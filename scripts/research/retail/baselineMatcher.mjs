// Track F3 Phase 2 — deterministic retail baseline matcher (research only).
// No production imports, no ML, no network. Consumes golden-matching-v1.json.
// Scoring: category gate + semantic role + dimension similarity + material/color/style hints.

const ASSET_HINTS = {
  // assetId: { materials:[], colors:[], styles:[], role }
  sofa:            { materials:['fabric'],          colors:['green','beige','grey'],   styles:['modern'] },
  nordicSofa:      { materials:['fabric'],          colors:['blue'],                   styles:['scandi'] },
  sofa_033:        { materials:['fabric'],          colors:[],                         styles:['modern'] },
  sofa_037:        { materials:['fabric'],          colors:[],                         styles:['modern'] },
  sofa_039:        { materials:['fabric'],          colors:[],                         styles:['modern'] },
  sofa_042:        { materials:['fabric'],          colors:[],                         styles:['modern'] },
  sofa_044:        { materials:['fabric'],          colors:[],                         styles:['modern'] },
  chair:           { materials:['fabric-velvet'],   colors:['clay'],                   styles:['soft'] },
  sheenChair:      { materials:['fabric-velvet'],   colors:['orange','teal'],          styles:['glamour'] },
  nordicArmchair:  { materials:['fabric'],          colors:['blue'],                   styles:['scandi'] },
  relaxArmchair:   { materials:['fabric'],          colors:['blue'],                   styles:['modern'] },
  chair_024:       { materials:['fabric-velvet'],   colors:[],                         styles:['classic'] },
  chair_026:       { materials:['fabric-velvet'],   colors:[],                         styles:['accent'] },
  chair_162:       { materials:['fabric-velvet'],   colors:[],                         styles:['accent'] },
  chair_058:       { materials:['fabric'],          colors:[],                         styles:['lounge'] },
  chair_066:       { materials:['fabric'],          colors:[],                         styles:['lounge'] },
  chair_041:       { materials:['fabric'],          colors:[],                         styles:['accent'] },
  chair_016:       { materials:['fabric'],          colors:[],                         styles:['modern'] },
  chair_019:       { materials:['fabric'],          colors:[],                         styles:['modern'] },
  chair_025:       { materials:['fabric'],          colors:[],                         styles:['stool'] },
  chair_027:       { materials:['fabric'],          colors:[],                         styles:['carver'] },
  chair_035:       { materials:['fabric'],          colors:[],                         styles:['tall'] },
  glassCoffeeTable:{ materials:['glass'],           colors:['transparent'],            styles:['loft'] },
  drawerSideTable: { materials:['wood'],            colors:['oak'],                    styles:['modern'] },
  coffee_table:    { materials:[],                  colors:[],                         styles:['modern'] },
  coffee_table_030:{ materials:[],                  colors:[],                         styles:['modern'] },
  coffee_table_028:{ materials:['glass'],           colors:[],                         styles:['modern'] },
  table:           { materials:['wood-oak'],        colors:['walnut','oak'],           styles:['natural'] },
  work_table_002:  { materials:['wood'],            colors:[],                         styles:['modern'] },
  work_table_017:  { materials:['wood'],            colors:[],                         styles:['modern'] },
  work_table_005:  { materials:['wood'],            colors:[],                         styles:['banquet'] },
  work_table_007:  { materials:['wood'],            colors:[],                         styles:['banquet'] },
  lowBookcase:     { materials:['wood'],            colors:['oak'],                    styles:['modern'] },
  cupboard_022:    { materials:['panel'],           colors:[],                         styles:['modern'] },
  dresser_001:     { materials:['wood'],            colors:[],                         styles:['modern'] },
  cupboard_003:    { materials:['panel'],           colors:[],                         styles:['modern'] },
  dresser:         { materials:['wood'],            colors:[],                         styles:['classic'] },
  lamp:            { materials:['metal','shade-fabric'], colors:['brass'],             styles:['classic'] },
  roundFloorLamp:  { materials:['metal'],           colors:['warm'],                   styles:['modern'] },
  lamp_028:        { materials:['metal','shade-fabric'], colors:[],                    styles:['classic'] },
  lamp_036:        { materials:['metal','marble'],  colors:[],                         styles:['designer'] },
  lamp_048:        { materials:['metal'],           colors:[],                         styles:['table-scale'] },
};

const MATERIAL_TOKENS = [
  ['fabric-velvet', ['велюр','velour','velutto','микровелюр']],
  ['fabric',        ['рогожка','шенилл','шенилловая','букле','ткан','флок']],
  ['leather',       ['экокожа','кожа']],
  ['faux-fur',      ['мех','тедди']],
  ['glass',         ['стекл']],
  ['marble',        ['мрамор','керамогранит','керамика']],
  ['wood-oak',      ['дуб','массив']],
  ['wood',          ['дерев','венге','бук','орех','мдф','лдсп','тамбурато']],
  ['metal',         ['металл','хром','сталь']],
  ['acrylic',       ['акрил','пластик','abs']],
  ['stone',         ['мраморн']],
  ['shade-fabric',  ['абажур','плафон']],
  ['panel',         ['шпона','шпон']],
];

const COLOR_TOKENS = [
  ['white',['бел','молочн','крем']],['grey',['сер','графит','антрацит']],['black',['черн']],
  ['beige',['беж','пудр'],['капучино']],['brown',['коричн','коньячн','орех','венге']],
  ['blue',['син','голуб']],['green',['зелен','зелен','мят','оливк','малахит']],
  ['red',['красн','бордо','терракот','розов']],['yellow',['желт','горчич']],
  ['transparent',['прозрачн']]
];

const STYLE_TOKENS = [
  ['scandi',['сканди']],['loft',['лофт']],['classic',['классик','неокласс']],
  ['minimalist',['минимализм']],['designer',['дизайнерск']],['modern',['современн','модерн']]
];

function tokenize(text, table) {
  const t = text.toLowerCase();
  const found = new Set();
  for (const [key, patterns] of table) {
    for (const p of patterns) if (t.includes(p)) { found.add(key); break; }
  }
  return found;
}

function setScore(aSet, cSet) {
  if (!aSet.size) return null; // unknown on asset side -> neutral
  if (!cSet.size) return null; // unknown on candidate side -> neutral (do not punish)
  let hit = 0;
  for (const a of aSet) for (const c of cSet) {
    if (a === c) { hit++; break; }
    // family partial credit
    if ((a.startsWith('fabric') && c.startsWith('fabric')) ||
        (a.startsWith('wood') && c.startsWith('wood'))) { hit += 0.5; break; }
  }
  return Math.min(1, hit / aSet.size);
}

// Parse dimensions from product title strings like "300x170x74", "110x60x45", "Ø40x50", "H165", "155x27"
export function parseDims(text) {
  const t = String(text).replace(/\s+/g, ' ');
  const triple = t.match(/(\d{2,4})\s*[xх×*]\s*(\d{2,4})\s*[xх×*]\s*(\d{2,4})/i);
  if (triple) {
    const v = triple.slice(1).map(Number); // axis order ambiguous -> keep all three
    return { axes: sortDesc(v), known: 3 };
  }
  const double = t.match(/(\d{2,4})\s*[xх×*]\s*(\d{2,4})/i);
  if (double) {
    const v = double.slice(1).map(Number);
    return { axes: sortDesc(v), known: 2 };
  }
  const singleH = t.match(/(?:h|высота|высота[^\d]{0,6})\s*(\d{2,3})(?:\.\d)?\s*(?:см|мм|cm|mm)?\b/i);
  if (singleH) return { axes: [norm(singleH[1])], known: 1 };
  return { axes: [], known: 0 };

  function norm(n) { n = Number(n); return n > 40 ? n / 100 : n; } // crude cm->m for 41..999
  function sortDesc(v) { return v.map((n) => (n > 40 ? n / 100 : n)).sort((a, b) => b - a); }
}

// Axis-order-agnostic relative error: compare sorted-desc dimension vectors over min length.
export function dimError(assetDims, candAxes) {
  const a = [assetDims.width, assetDims.height, assetDims.depth].sort((x, y) => y - x);
  const c = candAxes;
  const k = Math.min(a.length, c.length);
  if (k === 0) return null;
  let sum = 0;
  for (let i = 0; i < k; i++) sum += Math.abs(c[i] - a[i]) / a[i];
  return sum / k;
}

export function dimCompatible(assetId, err) {
  if (err == null) return false;
  return assetId.startsWith('lamp') ? err <= 0.30 : err <= 0.20;
}

// Category derivation from product title (deterministic keyword rules).
export function categoryToken(text) {
  let t = String(text).toLowerCase().replace(/divan\.ru|divano/g, ' ');
  if (/углов.*диван|диван.*углов/.test(t)) return 'corner-sofa';
  if (/диван|divan/.test(t)) return 'sofa';
  if (/торшер|светильник|torsh|svetilnik|napolny.*svetilnik/.test(t)) return 'floor-lamp';
  if (/шкаф|shkaf/.test(t)) return 'wardrobe';
  if (/полубарн|барн.*стул|barstool|barnyy-stul|polubarn/.test(t)) return 'bar-chair';
  if (/кресл|kresl/.test(t)) return 'armchair';
  if (/журнальн|столик|приставн|кофейн|придиванн|stolik|zhurnaln|pristavn|pridivann/.test(t)) return 'coffee-table';
  if (/банкетн|складн.*стол|banketn|skladnoy-stol/.test(t)) return 'banquet-table';
  if (/комод|тумба|tumba|komod/.test(t)) return 'chest-tv';
  if (/стеллаж|stellazh/.test(t)) return 'shelving';
  if (/стол\b|stola\b|stol_|stoly|obedenn|dub-sun|kuhonny/.test(t) || /(^|[^a-z])stol([^a-z]|$)/.test(t)) return 'dining-table';
  if (/стул|stul/.test(t)) return 'dining-chair';
  return 'unknown';
}
const ALLOWED = {
  sofas:  { strong: ['sofa'], soft: ['corner-sofa'] },
  chairs: { strong: ['armchair'], soft: ['dining-chair', 'bar-chair'] }, // dining assets resolved by role below
  tables: { strong: ['coffee-table', 'dining-table'], soft: ['banquet-table', 'shelving'] },
  storage:{ strong: ['wardrobe', 'chest-tv'], soft: ['shelving'] },
  lamps:  { strong: ['floor-lamp'], soft: [] },
};

function allowedFor(asset) {
  const base = ALLOWED[asset.category] || { strong: [], soft: [] };
  if (asset.category !== 'chairs') return base;
  // dining-chair-like assets (no armchair role, slim proportions)
  const d = asset.dimensions;
  const slimChair = d.width <= 0.62 && d.height >= 1.0;
  if (asset.semanticRole === 'armchair') return base;
  if (slimChair) return { strong: ['dining-chair'], soft: ['bar-chair', 'armchair'] };
  return { strong: ['dining-chair', 'armchair'], soft: ['bar-chair'] };
}

const W = { dims: 0.40, role: 0.25, material: 0.15, color: 0.08, style: 0.07, catSoft: 0.85 };

export function scoreCandidate(asset, cand) {
  const why = [];
  const token = categoryToken(cand.product) === 'unknown'
    ? categoryToken(String(cand.url || '').replace(/https?:\/\//, ''))
    : categoryToken(cand.product);
  const allowed = allowedFor(asset);

  if (!allowed.strong.includes(token) && !allowed.soft.includes(token)) {
    return { score: 0, confidence: 0, gated: true, why: [`category gate fail: ${token} not allowed for ${asset.category}`] };
  }

  let s = 0;
  // category
  if (allowed.strong.includes(token)) { s += 0.15 * 1; why.push(`category exact (${token})`); }
  else { s += 0.15 * W.catSoft; why.push(`category soft-match (${token})`); }

  // semantic role compatibility
  let roleScore = 0.4; // default weak-positive same super-family
  const at = asset.semanticRole;
  if (asset.category === 'sofas' && (token === 'sofa' || token === 'corner-sofa')) roleScore = token === 'corner-sofa' ? 0.7 : 1.0;
  else if (asset.category === 'chairs') {
    if (at === 'armchair') roleScore = token === 'armchair' ? 1.0 : 0.45;
    else roleScore = token === 'dining-chair' ? 1.0 : token === 'bar-chair' ? 0.65 : 0.4;
  } else if (asset.category === 'tables') {
    if (asset.semanticRole === 'coffeeTable') roleScore = token === 'coffee-table' ? 1.0 : 0.35;
    else if (asset.semanticRole === 'sideTable') roleScore = token === 'coffee-table' ? 0.8 : 0.35;
    else if (asset.semanticRole === 'console') roleScore = token === 'shelving' ? 0.9 : token === 'chest-tv' ? 0.6 : 0.3;
    else roleScore = token === 'dining-table' ? 1.0 : token === 'banquet-table' ? 0.55 : 0.3;
  } else if (asset.category === 'storage') {
    roleScore = token === 'wardrobe' ? 1.0 : token === 'chest-tv' ? 0.75 : 0.4;
  } else if (asset.category === 'lamps') {
    roleScore = token === 'floor-lamp' ? 1.0 : 0.2;
  }
  s += W.role * roleScore;
  why.push(`role ${roleScore.toFixed(2)}`);

  // dimensions
  const dims = parseDims(`${cand.product}`);
  const err = dimError(asset.dimensions, dims.axes);
  let dScore = 0.18; // unknown-dims penalty baseline
  if (err != null) {
    dScore = Math.max(0, 1 - err / 0.60);
    if (dimCompatible(asset.assetId || asset.id, err)) why.push(`dims within tolerance (err ${err.toFixed(2)})`);
    else why.push(`dims off (err ${err.toFixed(2)})`);
  } else {
    why.push('dims unknown in listing');
  }
  s += W.dims * dScore;

  // hints
  const hints = ASSET_HINTS[asset.assetId || asset.id] || {};
  const cMats = tokenize(cand.product, MATERIAL_TOKENS);
  const matS = setScore(new Set(hints.materials || []), cMats);
  if (matS != null) { s += W.material * matS; why.push(`material ${matS.toFixed(2)}`); }

  const cCols = tokenize(cand.product, COLOR_TOKENS);
  const colS = setScore(new Set(hints.colors || []), cCols);
  if (colS != null) { s += W.color * colS; why.push(`color ${colS.toFixed(2)}`); }

  const cSty = tokenize(cand.product, STYLE_TOKENS);
  const styS = setScore(new Set(hints.styles || []), cSty);
  if (styS != null) { s += W.style * styS; why.push(`style ${styS.toFixed(2)}`); }

  const score = Math.round(Math.min(1, s) * 100) / 100;
  return { score, confidence: score, gated: false, categoryToken: token, dimErr: err, why };
}

export function rankCandidates(asset, candidates) {
  return candidates
    .map((c) => ({ ...c, ...scoreCandidate(asset, c) }))
    .sort((a, b) => b.score - a.score);
}







