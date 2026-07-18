import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  DEFAULT_BUNDLE_BUDGETS,
  verifyProductionBundle,
} from '../apps/web/scripts/verify-production-bundle.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function fixture({ html, chunks = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'bubbles-bundle-test-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, 'index.html'),
    html ??
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bubbles</title><link rel="modulepreload" href="/assets/vendor-hash.js"></head></html>'
  );

  const defaults = {
    'three-core-hash.js': 'export const three = true;',
    'r3f-hash.js': 'export const r3f = true;',
    'VisualMode-hash.js': 'export const visual = true;',
  };
  await Promise.all(
    Object.entries({ ...defaults, ...chunks }).map(([name, contents]) =>
      writeFile(join(directory, 'assets', name), contents)
    )
  );
  return directory;
}

test('accepts lazy visual chunks within their gzip budgets', async () => {
  const directory = await fixture();
  const report = await verifyProductionBundle(directory);

  assert.deepEqual(report.modulePreloads, ['/assets/vendor-hash.js']);
  assert.ok(report.measurements.visualTotal.bytes > 0);
});

test('rejects a visual dependency in the initial HTML preload list', async () => {
  const directory = await fixture({
    html: '<html lang="en"><head><meta name="viewport" content="width=device-width"><title>Bubbles</title><link href="/assets/three-core-hash.js" rel="modulepreload"></head></html>',
  });

  await assert.rejects(
    verifyProductionBundle(directory),
    /lazy visual chunks must not be modulepreloaded: \/assets\/three-core-hash\.js/
  );
});

test('rejects visual chunks that exceed a deliberate gzip budget', async () => {
  const directory = await fixture();

  await assert.rejects(
    verifyProductionBundle(directory, {
      ...DEFAULT_BUNDLE_BUDGETS,
      threeCore: 1,
      visualTotal: 1,
    }),
    /three-core is .* bytes gzip; budget is 1/
  );
});

test('rejects optional tracking in built HTML before consent', async () => {
  const directory = await fixture({
    html: '<html lang="en"><head><meta name="viewport" content="width=device-width"><title>Bubbles</title><script src="https://www.googletagmanager.com/gtag/js"></script></head></html>',
  });

  await assert.rejects(
    verifyProductionBundle(directory),
    /must not eagerly include analytics or advertising loaders/
  );
});

test('rejects missing language and a viewport that disables zoom', async () => {
  const directory = await fixture({
    html: '<html><head><meta name="viewport" content="width=device-width, user-scalable=no"><title>Bubbles</title></head></html>',
  });

  await assert.rejects(
    verifyProductionBundle(directory),
    /must declare a non-empty document language[\s\S]*must not disable user zoom/
  );
});
