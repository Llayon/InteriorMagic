import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ithappyDataRoot,
  repositoryRoot,
  resolveIthappyCatalogBuildRoot,
  resolveIthappyPipelineRoot,
} from '../../../scripts/catalog/resolve-ithappy-root.mjs';

test('repositoryRoot equals path.resolve(<this file>, ../../..)', () => {
  // resolve-ithappy-root.mjs lives at <repoRoot>/scripts/catalog/.
  // This test file lives at <repoRoot>/tests/catalog/upstream/.
  const expected = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
  assert.equal(repositoryRoot, expected);
});

test('ithappyDataRoot is exactly two levels above repositoryRoot (matches ithappy-local-staging.mjs)', () => {
  assert.equal(ithappyDataRoot, path.resolve(repositoryRoot, '..', '..', '.agent-data'));
});

test('resolveIthappyPipelineRoot honours ITHAPPY_PIPELINE_ROOT env var', () => {
  globalThis.process.env.ITHAPPY_PIPELINE_ROOT = '/custom/pipeline';
  try {
    assert.equal(resolveIthappyPipelineRoot(), path.resolve('/custom/pipeline'));
  } finally {
    delete globalThis.process.env.ITHAPPY_PIPELINE_ROOT;
  }
});

test('resolveIthappyCatalogBuildRoot honours ITHAPPY_CATALOG_BUILD_ROOT env var', () => {
  globalThis.process.env.ITHAPPY_CATALOG_BUILD_ROOT = '/custom/build';
  try {
    assert.equal(resolveIthappyCatalogBuildRoot(), path.resolve('/custom/build'));
  } finally {
    delete globalThis.process.env.ITHAPPY_CATALOG_BUILD_ROOT;
  }
});

test('default pipelineRoot and catalogBuildRoot live under the same dataRoot', () => {
  assert.ok(resolveIthappyPipelineRoot().endsWith('ithappy-production-pipeline'));
  assert.ok(resolveIthappyCatalogBuildRoot().endsWith('ithappy-catalog-build'));
});

test('resolved roots point at existing directories on this machine', async () => {
  // Skip this assertion when the developer did not set the upstream
  // environment variables AND the default data root does not exist
  // (a clean checkout / CI without .agent-data). The env-var tests above
  // already prove the resolve functions honour ITHAPPY_PIPELINE_ROOT and
  // ITHAPPY_CATALOG_BUILD_ROOT.
  const hasEnv = !!globalThis.process.env.ITHAPPY_PIPELINE_ROOT || !!globalThis.process.env.ITHAPPY_CATALOG_BUILD_ROOT;
  if (!hasEnv) {
    const { existsSync } = await import('node:fs');
    const defPipeline = resolveIthappyPipelineRoot();
    const defBuild = resolveIthappyCatalogBuildRoot();
    if (!existsSync(defPipeline) || !existsSync(defBuild)) {
      return; // acceptable: upstream data not provisioned on this machine
    }
  }
  const { stat } = await import('node:fs/promises');
  for (const [name, p] of [
    ['pipeline', resolveIthappyPipelineRoot()],
    ['catalog-build', resolveIthappyCatalogBuildRoot()],
  ]) {
    try {
      const s = await stat(p);
      assert.equal(s.isDirectory(), true, `${name} root is not a directory: ${p}`);
    } catch (e) {
      assert.fail(`${name} root missing: ${p} (${e.message})`);
    }
  }
});