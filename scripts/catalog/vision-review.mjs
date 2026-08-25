// scripts/catalog/vision-review.mjs
// A10: autonomous vision-led per-asset review of technical shortlist thumbnails.
// Each row produces a structured verdict. Low confidence / ambiguous → excluded.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIthappyCatalogBuildRoot, repositoryRoot } from './resolve-ithappy-root.mjs';

const SHORTLIST = path.join(repositoryRoot, 'docs/catalog/shortlist-technical.csv');
const CATEGORIES = ['sofa', 'armchair', 'coffeeTable', 'sideTable', 'console', 'tv', 'floorLamp', 'plant', 'rug', 'floorDecor'];

export function parseShortlist(text) {
  const [header, ...lines] = text.replace(/\r/g, '').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    const row = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    return row;
  });
}

export function emptyReviewRecord(item) {
  return {
    assetId: item.assetId,
    sourceCategory: item.sourceCategory,
    runtimeBytes: Number(item.runtimeBytes),
    thumbnailStatus: item.thumbnailStatus || '',
    visualQuality: '',
    silhouetteReadable: '',
    categoryCorrect: '',
    verifiedSemanticRole: '',
    duplicateOf: '',
    confidence: '',
    evidence: '',
    selected: '',
  };
}

export function parseVisionAnswer(answer, item) {
  const record = emptyReviewRecord(item);
  for (const line of answer.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k in record) record[k] = v;
  }
  // Validate semantic role against vocabulary.
  if (record.verifiedSemanticRole && !CATEGORIES.includes(record.verifiedSemanticRole)) {
    record.evidence = (record.evidence || '') + ' [invalid role → floorDecor]';
    record.verifiedSemanticRole = 'floorDecor';
    record.confidence = 'low';
  }
  // Low confidence → not selected.
  if (record.confidence === 'low') record.selected = 'no';
  return record;
}

// Lower-level helper for the executor: builds the full queue as JSON-lines.
export function buildReviewQueue() {
  const text = readFileSync(SHORTLIST, 'utf8');
  const items = parseShortlist(text);
  const thumbRoot = path.join(resolveIthappyCatalogBuildRoot(), 'thumbnails');
  return items.map((item) => ({
    assetId: item.assetId,
    sourceCategory: item.sourceCategory,
    runtimeBytes: Number(item.runtimeBytes),
    thumbnailStatus: item.thumbnailStatus || '',
    thumbPath: path.join(thumbRoot, `${item.assetId}.webp`),
    fileUrl: `file:///${path.join(thumbRoot, `${item.assetId}.webp`).replace(/\\/g, '/')}`,
  }));
}


// Review a single asset via vision_analyze. The execution agent implements
// this by invoking the vision tool. We provide the prompt template so the
// executor does not have to construct it inline.
export function buildPrompt(item) {
  return [
    `Asset: ${item.assetId} (sourceCategory: ${item.sourceCategory})`,
    'Inspect this 256x192 WebP thumbnail of a furniture/decor asset.',
    'Answer in EXACTLY this format, one field per line:',
    'visualQuality: pass|review|fail',
    'silhouetteReadable: yes|no',
    'categoryCorrect: yes|no',
    'verifiedSemanticRole: one of sofa|armchair|coffeeTable|sideTable|console|tv|floorLamp|plant|rug|floorDecor',
    'duplicateOf: <assetId or empty>',
    'confidence: high|medium|low',
    'evidence: <one short sentence>',
    'Be strict. If silhouette is unreadable or image is too small, confidence=low and the asset is excluded.',
  ].join('\n');
}

export function main() {
  // The actual vision loop is executed by the agent via vision_analyze.
  // This main() is only invoked if records were pre-populated externally.
  console.error('vision-review: main() is a no-op; the agent must run the vision loop and write visual-curation.csv');
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}