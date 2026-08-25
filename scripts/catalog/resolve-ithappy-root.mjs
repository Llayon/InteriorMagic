// scripts/catalog/resolve-ithappy-root.mjs
// A1: repositoryRoot is the parent of `scripts/`.`. We derive it from THIS file's
// import.meta.url — no scriptsDir parameterization.
//   file://.../scripts/catalog/resolve-ithappy-root.mjs
//       ↑ up 3 levels = <repoRoot>
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..', '..');

// Mirrors scripts/ithappy-local-staging.mjs exactly:
//   const dataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');
export const ithappyDataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');

export const resolveIthappyPipelineRoot = () =>
  path.resolve(process.env.ITHAPPY_PIPELINE_ROOT || path.join(ithappyDataRoot, 'ithappy-production-pipeline'));

export const resolveIthappyCatalogBuildRoot = () =>
  path.resolve(process.env.ITHAPPY_CATALOG_BUILD_ROOT || path.join(ithappyDataRoot, 'ithappy-catalog-build'));