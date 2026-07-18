import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseAllDocuments } from 'yaml';

const REQUIRED_SECRET_KEYS = [
  'JWT_SECRET',
  'SESSION_SECRET',
  'OWNER_ID_SECRET',
];
const FORBIDDEN_CONFIG_KEYS = [
  ...REQUIRED_SECRET_KEYS,
  'JWT_SECRET_PREVIOUS',
  'SESSION_SECRET_PREVIOUS',
  'OWNER_ID_SECRET_PREVIOUS',
];
const WORKLOAD_KINDS = new Set([
  'CronJob',
  'DaemonSet',
  'Deployment',
  'Job',
  'StatefulSet',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function namespaceOf(resource) {
  return object(resource.metadata).namespace || 'default';
}

function podTemplateOf(resource) {
  const spec = object(resource.spec);
  if (resource.kind === 'CronJob') {
    return object(object(object(spec.jobTemplate).spec).template);
  }
  return object(spec.template);
}

function bubblesServerContainers(resource) {
  const podSpec = object(podTemplateOf(resource).spec);
  const containers = [
    ...array(podSpec.initContainers),
    ...array(podSpec.containers),
  ];
  const explicitlyNamed = containers.filter(
    (container) => object(container).name === 'bubbles-server'
  );
  return explicitlyNamed.length ? explicitlyNamed : containers;
}

function isBubblesServerWorkload(resource) {
  if (!WORKLOAD_KINDS.has(resource.kind)) return false;
  const metadata = object(resource.metadata);
  const template = podTemplateOf(resource);
  return (
    metadata.name === 'bubbles-server' ||
    object(metadata.labels).app === 'bubbles-server' ||
    object(object(template.metadata).labels).app === 'bubbles-server' ||
    bubblesServerContainers(resource).some(
      (container) => object(container).name === 'bubbles-server'
    )
  );
}

function applicationSecretMappings(resource) {
  const envFrom = [];
  const explicit = [];
  for (const rawContainer of bubblesServerContainers(resource)) {
    const container = object(rawContainer);
    for (const rawSource of array(container.envFrom)) {
      const secretRef = object(object(rawSource).secretRef);
      if (secretRef.name) {
        envFrom.push({
          name: secretRef.name,
          optional: secretRef.optional === true,
        });
      }
    }
    for (const rawVariable of array(container.env)) {
      const variable = object(rawVariable);
      if (!REQUIRED_SECRET_KEYS.includes(variable.name)) continue;
      const secretKeyRef = object(object(variable.valueFrom).secretKeyRef);
      if (secretKeyRef.name && secretKeyRef.key) {
        explicit.push({
          environmentName: variable.name,
          name: secretKeyRef.name,
          key: secretKeyRef.key,
          optional: secretKeyRef.optional === true,
        });
      }
    }
  }
  return { envFrom, explicit };
}

function requiredKeysFrom(resource) {
  const spec = object(resource.spec);
  if (resource.kind === 'SealedSecret') {
    return new Set([
      ...Object.keys(object(spec.encryptedData)),
      ...Object.keys(object(object(spec.template).data)),
      ...Object.keys(object(object(spec.template).stringData)),
    ]);
  }
  if (resource.kind === 'ExternalSecret') {
    const targetTemplate = object(object(spec.target).template);
    return new Set([
      ...array(spec.data)
        .map((entry) => object(entry).secretKey)
        .filter(Boolean),
      ...Object.keys(object(targetTemplate.data)),
      ...Object.keys(object(targetTemplate.stringData)),
    ]);
  }
  return new Set();
}

function encryptedSecretOutput(resource) {
  const metadata = object(resource.metadata);
  const spec = object(resource.spec);
  const keys = requiredKeysFrom(resource);
  if (resource.kind === 'SealedSecret') {
    const templateMetadata = object(object(spec.template).metadata);
    return {
      kind: resource.kind,
      name: templateMetadata.name || metadata.name,
      namespace: templateMetadata.namespace || metadata.namespace || 'default',
      keys,
    };
  }
  if (resource.kind === 'ExternalSecret') {
    return {
      kind: resource.kind,
      name: object(spec.target).name || metadata.name,
      namespace: metadata.namespace || 'default',
      keys,
    };
  }
  return null;
}

function parsedResources(renderedYaml, environment, errors) {
  const resources = [];
  for (const [index, document] of parseAllDocuments(renderedYaml, {
    uniqueKeys: true,
  }).entries()) {
    if (document.errors.length) {
      errors.push(
        `[${environment}] Rendered YAML document ${index + 1} is invalid`
      );
      continue;
    }
    const resource = document.toJS({ maxAliasCount: 100 });
    if (resource && typeof resource === 'object') resources.push(resource);
  }
  return resources;
}

export function validateRenderedManifest(renderedYaml, environment) {
  const errors = [];
  const resources = parsedResources(renderedYaml, environment, errors);
  const serverWorkloads = resources.filter(isBubblesServerWorkload);
  const encryptedResources = resources
    .filter(
      (resource) =>
        resource.kind === 'SealedSecret' || resource.kind === 'ExternalSecret'
    )
    .map(encryptedSecretOutput)
    .filter(Boolean);

  for (const resource of resources) {
    if (resource.kind !== 'ConfigMap') continue;
    const configKeys = new Set([
      ...Object.keys(object(resource.data)),
      ...Object.keys(object(resource.binaryData)),
    ]);
    if (FORBIDDEN_CONFIG_KEYS.some((key) => configKeys.has(key))) {
      errors.push(
        `[${environment}] Forbidden application secret key in ConfigMap ${namespaceOf(resource)}/${object(resource.metadata).name || 'unnamed'}`
      );
    }
  }

  if (serverWorkloads.length === 0) {
    errors.push(
      `[${environment}] No bubbles-server workload found in rendered manifests`
    );
    return errors;
  }

  for (const workload of serverWorkloads) {
    const metadata = object(workload.metadata);
    const namespace = namespaceOf(workload);
    const name = metadata.name || 'bubbles-server';
    const mappings = applicationSecretMappings(workload);
    const matchingResources = (referenceName) =>
      encryptedResources.filter(
        (resource) =>
          resource.name === referenceName && resource.namespace === namespace
      );

    const validEnvFrom = mappings.envFrom.some(
      (reference) =>
        !reference.optional &&
        matchingResources(reference.name).some((resource) =>
          REQUIRED_SECRET_KEYS.every((key) => resource.keys.has(key))
        )
    );
    if (validEnvFrom) continue;

    if (mappings.explicit.length > 0) {
      for (const requiredKey of REQUIRED_SECRET_KEYS) {
        const mapping = mappings.explicit.find(
          (candidate) => candidate.environmentName === requiredKey
        );
        if (!mapping) {
          errors.push(
            `[${environment}] ${namespace}/${name} is missing env.secretKeyRef for ${requiredKey}`
          );
          continue;
        }
        if (mapping.optional) {
          errors.push(
            `[${environment}] ${namespace}/${name} maps ${requiredKey} from an optional Secret`
          );
        }
        if (mapping.key !== requiredKey) {
          errors.push(
            `[${environment}] ${namespace}/${name} maps ${requiredKey} from the wrong Secret key`
          );
          continue;
        }
        if (
          !matchingResources(mapping.name).some((resource) =>
            resource.keys.has(requiredKey)
          )
        ) {
          errors.push(
            `[${environment}] ${requiredKey} is not provided by encrypted Secret source ${namespace}/${mapping.name}`
          );
        }
      }
      continue;
    }

    if (
      mappings.envFrom.length > 0 &&
      mappings.envFrom.every((item) => item.optional)
    ) {
      errors.push(
        `[${environment}] ${namespace}/${name} has only optional envFrom Secret references for required application secrets`
      );
    } else if (mappings.envFrom.length > 0) {
      errors.push(
        `[${environment}] ${namespace}/${name} has no envFrom Secret backed by a same-environment encrypted source containing all required keys`
      );
    } else {
      errors.push(
        `[${environment}] ${namespace}/${name} has no complete required application Secret mapping`
      );
    }
  }

  return errors;
}

function main() {
  const [renderedFile, environment] = process.argv.slice(2);
  if (!renderedFile || !environment || process.argv.length !== 4) {
    console.error(
      'Usage: node scripts/validate-iac-secrets.mjs <rendered-yaml|-> <environment>'
    );
    process.exitCode = 2;
    return;
  }

  const input = renderedFile === '-' ? 0 : renderedFile;
  const errors = validateRenderedManifest(
    readFileSync(input, 'utf8'),
    environment
  );
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(`[${environment}] Bubbles rendered Secret contract is valid`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
