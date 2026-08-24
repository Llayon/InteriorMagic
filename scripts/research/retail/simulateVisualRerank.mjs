// Track F3 Phase 3 — visual reranking SIMULATION (research only).
// No embeddings, no vision model, no network. This script estimates the CEILING effect of a
// visual reranker by using the gold reason strings as a proxy for visual agreement.
//
// Honest framing: this is NOT a CLIP/SigLIP/vLLM experiment. It measures how much a reranker
// COULD improve ranking if visual similarity were available and correlated with the gold
// silhouette/style/material judgments recorded in the dataset. See visual-rerank-experiment-v1.md.
import { readFileSync } from 'node:fs';
import { rankCandidates } from './baselineMatcher.mjs';

const path = process.argv[2] || 'docs/research/retail/golden-dataset-v1/golden-matching-v1.json';
const gold = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const REASON_PENALTY = {
  'wrong silhouette': 0.9,
  'dimension mismatch': 0.35, // dims already handled by baseline; small extra penalty
  'wrong material': 0.5,
  'wrong style': 0.55,
  'wrong usage': 0.7,
  'wrong category': 1.0,
};

// Proxy "visual agreement" for a candidate against its asset:
// derived from the GOLD reason (upper bound info a real reranker would approximate visually).
function proxyVisual(asset, cand) {
  const reasons = [];
  for (const r of asset.rejectedExamples) if (r.url === cand.url) reasons.push(r.reason);
  let v = 0.85; // default: textually plausible candidates look similar (optimistic prior)
  for (const r of reasons) {
    const key = Object.keys(REASON_PENALTY).find((k) => r && r.includes(k));
    if (key) { v = Math.min(v, 1 - REASON_PENALTY[key]); }
  }
  // gold grade bonus
  const acc = asset.acceptedMatches.find((m) => m.url === cand.url);
  if (acc) v = Math.max(v, acc.grade === 'A' ? 0.95 : 0.8);
  return v;
}

const rows = [];
for (const asset of gold.assets) {
  const cands = [
    ...asset.acceptedMatches.map((m) => ({ ...m, gold: m.grade })),
    ...asset.rejectedExamples.map((m) => ({ ...m, gold: m.grade || 'C' })),
  ];
  const base = rankCandidates(asset, cands).filter((r) => !r.gated);
  const reranked = base
    .map((r) => {
      const v = proxyVisual(asset, r);
      return { ...r, visual: v, final: Math.round((0.65 * r.score + 0.35 * v) * 100) / 100 };
    })
    .sort((a, b) => b.final - a.final);

  const metrics = (list) => {
    const firstA = list.findIndex((r) => r.gold === 'A');
    const firstAB = list.findIndex((r) => r.gold === 'A' || r.gold === 'B');
    return {
      top1A: firstA === 0,
      top1AB: firstAB === 0,
      hit3AB: list.slice(0, 3).some((r) => r.gold === 'A' || r.gold === 'B'),
      rrA: firstA >= 0 ? 1 / (firstA + 1) : 0,
      rrAB: firstAB >= 0 ? 1 / (firstAB + 1) : 0,
    };
  };
  const b = metrics(base); const rr = metrics(reranked);
  rows.push({ id: asset.assetId, difficulty: asset.difficulty, hasGold: asset.acceptedMatches.length > 0, b, rr });
}

const pos = rows.filter((r) => r.hasGold);
const sum = (arr, f) => arr.reduce((s, r) => s + (f(r) ? 1 : 0), 0);
const pct = (n, d) => (d ? `${n}/${d} (${((100 * n) / d).toFixed(0)}%)` : 'n/a');

console.log('=== Visual rerank SIMULATION vs baseline (proxy ceiling) ===');
for (const scopeName of [['all', pos], ['easy', pos.filter(r=>r.difficulty==='easy')], ['medium', pos.filter(r=>r.difficulty==='medium')], ['hard', pos.filter(r=>r.difficulty==='hard')]]) {
  const [name, set] = scopeName;
  console.log(`${name}: n=${set.length}`);
  console.log(`  Top-1 A    baseline ${pct(sum(set,(r)=>r.b.top1A),set.length)} -> reranked ${pct(sum(set,(r)=>r.rr.top1A),set.length)}`);
  console.log(`  Top-1 A+B  baseline ${pct(sum(set,(r)=>r.b.top1AB),set.length)} -> reranked ${pct(sum(set,(r)=>r.rr.top1AB),set.length)}`);
  console.log(`  Hit@3 A+B  baseline ${pct(sum(set,(r)=>r.b.hit3AB),set.length)} -> reranked ${pct(sum(set,(r)=>r.rr.hit3AB),set.length)}`);
  const mrrB = set.reduce((s,r)=>s+r.b.rrA,0)/(set.length||1);
  const mrrR = set.reduce((s,r)=>s+r.rr.rrA,0)/(set.length||1);
  console.log(`  MRR A      baseline ${mrrB.toFixed(2)} -> reranked ${mrrR.toFixed(2)}`);
}

// --- Oracle ceiling tier ------------------------------------------------------
// Perfect visual knowledge = gold-informed ordering. This is the CEILING any real
// visual reranker could approach, never exceed (given this candidate pool).
function oracleRank(list) {
  const g = (r) => (r.gold === 'A' ? 2 : r.gold === 'B' ? 1 : 0);
  return [...list].sort((a, b) => (g(b) - g(a)) || (b.score - a.score));
}
const opos = [];
for (const asset of gold.assets) {
  const cands = [
    ...asset.acceptedMatches.map((m) => ({ ...m, gold: m.grade })),
    ...asset.rejectedExamples.map((m) => ({ ...m, gold: m.grade || 'C' })),
  ];
  const base = rankCandidates(asset, cands).filter((r) => !r.gated);
  const orc = oracleRank(base);
  const m = (list) => {
    const fA = list.findIndex((r) => r.gold === 'A');
    const fAB = list.findIndex((r) => r.gold === 'A' || r.gold === 'B');
    return { top1A: fA === 0, top1AB: fAB === 0, hit3AB: list.slice(0, 3).some((r) => ['A','B'].includes(r.gold)) };
  };
  opos.push({ id: asset.assetId, difficulty: asset.difficulty, hasGold: asset.acceptedMatches.length > 0, b: metricsOf(base), o: m(orc) });
}
function metricsOf(list) {
  const fA = list.findIndex((r) => r.gold === 'A');
  const fAB = list.findIndex((r) => r.gold === 'A' || r.gold === 'B');
  return { top1A: fA === 0, top1AB: fAB === 0, hit3AB: list.slice(0, 3).some((r) => ['A','B'].includes(r.gold)) };
}
const oposOnly = opos.filter((r) => r.hasGold);
console.log('\n=== ORACLE visual ceiling (gold-informed perfect reranker) ===');
for (const scopeName of [['all', oposOnly], ['easy', oposOnly.filter(r=>r.difficulty==='easy')], ['medium', oposOnly.filter(r=>r.difficulty==='medium')], ['hard', oposOnly.filter(r=>r.difficulty==='hard')]]) {
  const [name, set] = scopeName;
  console.log(`${name}: n=${set.length} | Top1A ${pct(sum(set,(r)=>r.o.top1A),set.length)} (base ${pct(sum(set,(r)=>r.b.top1A),set.length)}) | Top1AB ${pct(sum(set,(r)=>r.o.top1AB),set.length)} (base ${pct(sum(set,(r)=>r.b.top1AB),set.length)}) | Hit3AB ${pct(sum(set,(r)=>r.o.hit3AB),set.length)}`);
}
const neg = rows.filter((r) => !r.hasGold);
const negFix = sum(neg, (r) => !r.rr.top1AB && r.b.top1AB);
console.log(`\nnegatives where simulation removes a false Top-1: ${negFix}/${neg.length}`);


