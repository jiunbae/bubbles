import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const DEFAULT_BUNDLE_BUDGETS = Object.freeze({
  threeCore: 140_000,
  r3f: 56_000,
  visualMode: 18_000,
  visualTotal: 210_000,
});

const VISUAL_CHUNKS = Object.freeze([
  {
    key: 'threeCore',
    label: 'three-core',
    pattern: /^three-core-[A-Za-z0-9_-]+\.js$/,
  },
  {
    key: 'r3f',
    label: 'r3f',
    pattern: /^r3f-[A-Za-z0-9_-]+\.js$/,
  },
  {
    key: 'visualMode',
    label: 'VisualMode',
    pattern: /^VisualMode-[A-Za-z0-9_-]+\.js$/,
  },
]);

function modulePreloads(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /\brel\s*=\s*["']modulepreload["']/i.test(tag))
    .map((tag) => tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
}

function assertBuiltHtmlPolicy(html) {
  const violations = [];
  const preloadedVisualChunks = modulePreloads(html).filter((href) =>
    VISUAL_CHUNKS.some(({ pattern }) => pattern.test(basename(href)))
  );

  if (preloadedVisualChunks.length > 0) {
    violations.push(
      `lazy visual chunks must not be modulepreloaded: ${preloadedVisualChunks.join(', ')}`
    );
  }

  const optionalTrackingMarkers = [
    /googletagmanager\.com/i,
    /google-analytics\.com/i,
    /\bgtag\s*\(/i,
    /\badsbygoogle\b/i,
  ];
  if (optionalTrackingMarkers.some((pattern) => pattern.test(html))) {
    violations.push(
      'built HTML must not eagerly include analytics or advertising loaders'
    );
  }

  if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html)) {
    violations.push('built HTML must declare a non-empty document language');
  }
  if (!/<title\b[^>]*>\s*\S[\s\S]*?<\/title>/i.test(html)) {
    violations.push('built HTML must include a non-empty document title');
  }

  const viewport = html.match(
    /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i
  )?.[0];
  if (!viewport) {
    violations.push('built HTML must include viewport metadata');
  } else if (
    /user-scalable\s*=\s*no/i.test(viewport) ||
    /maximum-scale\s*=\s*1(?:\.0*)?(?:\s*[,"']|$)/i.test(viewport)
  ) {
    violations.push('viewport metadata must not disable user zoom');
  }

  return violations;
}

function formatBytes(bytes) {
  return new Intl.NumberFormat('en-US').format(bytes);
}

export async function verifyProductionBundle(
  distDirectory,
  budgets = DEFAULT_BUNDLE_BUDGETS
) {
  const dist = resolve(distDirectory);
  const assets = resolve(dist, 'assets');
  const [html, assetNames] = await Promise.all([
    readFile(resolve(dist, 'index.html'), 'utf8'),
    readdir(assets),
  ]);
  const violations = assertBuiltHtmlPolicy(html);
  const measurements = {};

  for (const chunk of VISUAL_CHUNKS) {
    const matches = assetNames.filter((name) => chunk.pattern.test(name));
    if (matches.length !== 1) {
      violations.push(
        `expected exactly one ${chunk.label} chunk, found ${matches.length}`
      );
      continue;
    }

    const bytes = gzipSync(await readFile(resolve(assets, matches[0])), {
      level: 9,
    }).byteLength;
    measurements[chunk.key] = { bytes, file: matches[0] };
    if (bytes > budgets[chunk.key]) {
      violations.push(
        `${chunk.label} is ${formatBytes(bytes)} bytes gzip; budget is ${formatBytes(budgets[chunk.key])}`
      );
    }
  }

  if (Object.keys(measurements).length === VISUAL_CHUNKS.length) {
    const visualTotal = Object.values(measurements).reduce(
      (total, measurement) => total + measurement.bytes,
      0
    );
    measurements.visualTotal = { bytes: visualTotal };
    if (visualTotal > budgets.visualTotal) {
      violations.push(
        `lazy visual bundle total is ${formatBytes(visualTotal)} bytes gzip; budget is ${formatBytes(budgets.visualTotal)}`
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Production bundle verification failed:\n- ${violations.join('\n- ')}`
    );
  }

  return {
    measurements,
    modulePreloads: modulePreloads(html),
  };
}

async function main() {
  const dist = process.argv[2] ?? './dist';
  try {
    const report = await verifyProductionBundle(dist);
    console.log('Production bundle release gates passed:');
    for (const chunk of VISUAL_CHUNKS) {
      const measurement = report.measurements[chunk.key];
      console.log(
        `- ${chunk.label}: ${formatBytes(measurement.bytes)} / ${formatBytes(DEFAULT_BUNDLE_BUDGETS[chunk.key])} bytes gzip`
      );
    }
    console.log(
      `- lazy visual total: ${formatBytes(report.measurements.visualTotal.bytes)} / ${formatBytes(DEFAULT_BUNDLE_BUDGETS.visualTotal)} bytes gzip`
    );
    console.log(
      `- initial modulepreloads: ${report.modulePreloads.length > 0 ? report.modulePreloads.join(', ') : 'none'}`
    );
    console.log('- optional tracking loaders: absent from built HTML');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
