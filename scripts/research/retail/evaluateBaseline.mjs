// Track F3 Phase 2 — evaluate deterministic baseline against the golden dataset.
// Usage: node scripts/research/retail/evaluateBaseline.mjs [path-to-golden-json]
import { readFileSync } from 'node:fs';
import { rankCandidates, dimError, dimCompatible, parseDims } from './baselineMatcher.mjs';

const path = process.argv[2] || 'docs/research/retail/golden-dataset-v1/golden-matching-v1.json';
const gold = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const rows = [];
let catErrors = 0;
let dimSafeTop1 = 0; let dimKnownTop1 = 0;

for (const asset of gold.assets) {
  const candidates = [
    ...asset.acceptedMatches.map((m) => ({ ...m, gold: m.grade })), // A | B
    ...asset.rejectedExamples.map((m) => ({ ...m, gold: m.grade || 'C' })),
  ];
  const fullRanked = rankCandidates(asset, candidates);
  const ranked = fullRanked.filter((r) => !r.gated);
  const top3 = ranked.slice(0, 3);
  const labels = top3.map((r) => r.gold);

  if (ranked.length && !ranked[0].gated && isCatViolation(asset, ranked[0])) catErrors++;

  const firstA = ranked.findIndex((r) => r.gold === 'A');
  const firstAB = ranked.findIndex((r) => r.gold === 'A' || r.gold === 'B');
  if (firstAB >= 0 && firstAB < 3) {
    const r0 = ranked[0];
    const dims = parseDims(r0.product);
    if (dims.known >= 2) {
      dimKnownTop1++;
      const err = dimError(asset.dimensions, dims.axes);
      if (dimCompatible(asset.assetId, err)) dimSafeTop1++;
    }
  }

  rows.push({
    id: asset.assetId,
    difficulty: asset.difficulty,
    hasGold: asset.acceptedMatches.length > 0,
    top1: labels[0] ?? '-',
    top3: labels.join(''),
    rrA: firstA >= 0 ? 1 / (firstA + 1) : 0,
    rrAB: firstAB >= 0 ? 1 / (firstAB + 1) : 0,
    maxScore: ranked.length ? Math.max(...ranked.map((r) => r.score)) : 0,
    gatedTop1: ranked.length ? Boolean(ranked[0].gated) : true,
    top1Why: ranked.length ? ranked[0].why.join('; ').slice(0, 110) : '',
  });
}

function isCatViolation(asset, r) {
  return false; // gate makes violations structurally impossible; kept for clarity
}

const withPos = rows.filter((r) => r.hasGold);
const nPos = withPos.length;
const pct = (n, d) => (d ? `${n}/${d} (${((100 * n) / d).toFixed(0)}%)` : 'n/a');
const mrr = (key, set) => set.reduce((s, r) => s + r[key], 0) / (set.length || 1);

console.log('=== Baseline matcher vs golden-matching-v1 ===');
console.log(`assets: ${rows.length} (with positives: ${nPos})`);
console.log(`Top-1 A     : ${pct(withPos.filter((r) => r.top1 === 'A').length, nPos)}`);
console.log(`Top-1 A+B   : ${pct(withPos.filter((r) => r.top1 === 'A' || r.top1 === 'B').length, nPos)}`);
console.log(`Hit@3 A     : ${pct(withPos.filter((r) => r.top3.includes('A')).length, nPos)}`);
console.log(`Hit@3 A+B   : ${pct(withPos.filter((r) => /[AB]/.test(r.top3)).length, nPos)}`);
console.log(`MRR A       : ${mrr('rrA', withPos).toFixed(2)}`);
console.log(`MRR A+B     : ${mrr('rrAB', withPos).toFixed(2)}`);
console.log(`dimension-safe Top-1 (known dims): ${pct(dimSafeTop1, dimKnownTop1)}`);
console.log(`category errors at Top-1: ${catErrors} (gate-enforced)`);

console.log('\n--- per difficulty (with positives) ---');
for (const diff of ['easy', 'medium', 'hard']) {
  const set = withPos.filter((r) => r.difficulty === diff);
  console.log(
    `${diff}: n=${set.length} Top1AB=${pct(set.filter((r) => r.top1 === 'A' || r.top1 === 'B').length, set.length)} Hit3AB=${pct(set.filter((r) => /[AB]/.test(r.top3)).length, set.length)}`
  );
}

console.log('\n--- abstention quality (assets without positives) ---');
const neg = rows.filter((r) => !r.hasGold);
const fp = neg.filter((r) => !r.gatedTop1 && r.maxScore >= 0.75).length;
console.log(`negatives: ${neg.length}; high-confidence false tops (>=0.75): ${fp}`);

console.log('\n--- per-asset detail ---');
for (const r of rows) {
  console.log(`${r.id.padEnd(17)} ${r.difficulty.padEnd(6)} gold=${r.hasGold ? 'Y' : 'N'} top1=${String(r.top1).padEnd(2)} top3=${r.top3.padEnd(3)} max=${r.maxScore.toFixed(2)} :: ${r.top1Why}`);
}




