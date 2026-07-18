import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateRenderedManifest } from './validate-iac-secrets.mjs';

const requiredEncryptedData = `
  encryptedData:
    JWT_SECRET: encrypted-jwt
    SESSION_SECRET: encrypted-session
    OWNER_ID_SECRET: encrypted-owner
`;

function server({
  namespace = 'bubbles',
  reference = 'bubbles-secrets',
  body,
} = {}) {
  return `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bubbles-server
  namespace: ${namespace}
  labels:
    app: bubbles-server
spec:
  template:
    metadata:
      labels:
        app: bubbles-server
    spec:
      containers:
        - name: bubbles-server
          envFrom:
            - secretRef:
                name: ${reference}
${body || ''}
`;
}

function sealedSecret({
  namespace = 'bubbles',
  name = 'bubbles-secrets',
  encryptedData = requiredEncryptedData,
} = {}) {
  return `
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  template:
    metadata:
      name: ${name}
      namespace: ${namespace}
${encryptedData}
`;
}

describe('rendered IaC secret validation', () => {
  test('accepts a matching envFrom Secret and SealedSecret in one environment', () => {
    assert.deepEqual(
      validateRenderedManifest(`${server()}---${sealedSecret()}`, 'prod'),
      []
    );
  });

  test('rejects a same-name secret rendered for the wrong environment namespace', () => {
    const errors = validateRenderedManifest(
      `${server({ namespace: 'bubbles-dev' })}---${sealedSecret({ namespace: 'bubbles' })}`,
      'dev'
    );
    assert.match(
      errors.join('\n'),
      /no envFrom Secret backed by a same-environment encrypted source/
    );
  });

  test('does not let an unrelated workload and secret satisfy bubbles-server', () => {
    const unrelated = server({
      reference: 'missing-bubbles-secret',
    }).replaceAll('bubbles-server', 'report-worker');
    const errors = validateRenderedManifest(
      `${server()}---${unrelated}---${sealedSecret({ name: 'missing-bubbles-secret' })}`,
      'prod'
    );
    assert.match(
      errors.join('\n'),
      /no envFrom Secret backed by a same-environment encrypted source/
    );
  });

  test('rejects a matching encrypted resource with a missing required key', () => {
    const errors = validateRenderedManifest(
      `${server()}---${sealedSecret({
        encryptedData: `
  encryptedData:
    JWT_SECRET: encrypted-jwt
    SESSION_SECRET: encrypted-session
`,
      })}`,
      'prod'
    );
    assert.match(errors.join('\n'), /containing all required keys/);
  });

  test('rejects application secret keys stored in a ConfigMap', () => {
    const configMap = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: bubbles-config
  namespace: bubbles
data:
  JWT_SECRET: plaintext-is-forbidden
`;
    const errors = validateRenderedManifest(
      `${server()}---${sealedSecret()}---${configMap}`,
      'prod'
    );
    assert.match(
      errors.join('\n'),
      /Forbidden application secret key in ConfigMap/
    );
  });

  test('rejects temporary rotation keys stored in a ConfigMap', () => {
    const configMap = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: bubbles-config
  namespace: bubbles
data:
  JWT_SECRET_PREVIOUS: plaintext-is-forbidden
`;
    const errors = validateRenderedManifest(
      `${server()}---${sealedSecret()}---${configMap}`,
      'prod'
    );
    assert.match(
      errors.join('\n'),
      /Forbidden application secret key in ConfigMap/
    );
  });

  test('rejects one-of-three individual secretKeyRef mappings', () => {
    const workload = server({
      body: `
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: bubbles-secrets
                  key: JWT_SECRET
`,
    }).replace(/\n          envFrom:[\s\S]*?name: bubbles-secrets\n/, '\n');
    const externalSecret = `
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: bubbles-source
  namespace: bubbles
spec:
  target:
    name: bubbles-secrets
  data:
    - secretKey: JWT_SECRET
    - secretKey: SESSION_SECRET
    - secretKey: OWNER_ID_SECRET
`;
    assert.match(
      validateRenderedManifest(`${workload}---${externalSecret}`, 'prod').join(
        '\n'
      ),
      /missing env.secretKeyRef for SESSION_SECRET/
    );
  });

  test('accepts all three individual secretKeyRef mappings backed by one ExternalSecret', () => {
    const workload = server({
      body: `
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: bubbles-secrets
                  key: JWT_SECRET
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: bubbles-secrets
                  key: SESSION_SECRET
            - name: OWNER_ID_SECRET
              valueFrom:
                secretKeyRef:
                  name: bubbles-secrets
                  key: OWNER_ID_SECRET
`,
    }).replace(/\n          envFrom:[\s\S]*?name: bubbles-secrets\n/, '\n');
    const externalSecret = `
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: bubbles-source
  namespace: bubbles
spec:
  target:
    name: bubbles-secrets
  data:
    - secretKey: JWT_SECRET
    - secretKey: SESSION_SECRET
    - secretKey: OWNER_ID_SECRET
`;
    assert.deepEqual(
      validateRenderedManifest(`${workload}---${externalSecret}`, 'prod'),
      []
    );
  });

  test('rejects optional workload Secret references', () => {
    const optionalServer = server().replace(
      'name: bubbles-secrets',
      'name: bubbles-secrets\n                optional: true'
    );
    assert.match(
      validateRenderedManifest(
        `${optionalServer}---${sealedSecret()}`,
        'prod'
      ).join('\n'),
      /only optional envFrom Secret references/
    );
  });

  test('CLI accepts a rendered manifest from stdin without a temporary file', () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./validate-iac-secrets.mjs', import.meta.url)),
        '-',
        'prod',
      ],
      {
        encoding: 'utf8',
        input: `${server()}---${sealedSecret()}`,
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[prod\].*contract is valid/);
  });
});
