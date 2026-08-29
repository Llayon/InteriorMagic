import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readApprovedBlenderVersion } from './blender-provenance.mjs';
import { parseAr0RevisionArgument } from './revision-config.mjs';

const root = process.cwd();
const { arRevisionId: revision, materialProfile } = parseAr0RevisionArgument(process.argv.slice(2));
const outputRoot = path.join(root, `.agent-data/ar0/${revision}`);
const canonical = path.join(outputRoot, 'model.glb');
const usdz = path.join(outputRoot, 'model.usdz');
const poster = path.join(outputRoot, 'poster.webp');
const blenderReport = path.join(outputRoot, 'converter-report.json');
const usdReport = path.join(outputRoot, 'usdz-stage-report.json');
const blenderCandidates = [
  process.env.BLENDER_PATH,
  'D:/Programms/Blender Foundation/Blender 5.2/blender.exe',
  'D:/Programms/Blender/5.2/blender.exe',
  'D:/Programms/Blender/blender.exe',
].filter(Boolean);

const findBlender = async () => {
  for (const candidate of blenderCandidates) {
    try { await access(candidate); return candidate; } catch { /* try next installed candidate */ }
  }
  throw new Error('No approved local Blender executable was found; runtime conversion is forbidden');
};

const run = (executable, args, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...extraEnv } });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited with code ${code}`)));
});

await mkdir(outputRoot, { recursive: true });
await access(canonical);
const blender = await findBlender();
const exportArgs = [
  '--background', '--factory-startup', '--python', path.join(root, 'scripts/ar0/export-usdz.py'), '--',
  '--input', canonical, '--output', usdz, '--poster', poster, '--report', blenderReport,
  '--material-profile', materialProfile,
];
const previousUsdz = await readFile(usdz).catch(() => null);
const previousPoster = await readFile(poster).catch(() => null);
await run(blender, exportArgs);
let converterReport;
try {
  converterReport = JSON.parse(await readFile(blenderReport, 'utf8'));
} catch (error) {
  throw new Error(`Blender converter report is missing or malformed: ${error instanceof Error ? error.message : String(error)}`);
}
const actualBlenderVersion = readApprovedBlenderVersion(converterReport);
await run(blender, [
  '--background', '--factory-startup', '--python', path.join(root, 'scripts/ar0/validate-usdz.py'),
  '--', '--input', usdz, '--report', usdReport, '--ar-revision-id', revision, '--material-profile', materialProfile,
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const [glbBytes, usdzBytes, posterBytes] = await Promise.all([readFile(canonical), readFile(usdz), readFile(poster)]);
const command = [`"${blender}"`, ...exportArgs.map((value) => value.includes(' ') ? `"${value}"` : value)].join(' ');
await writeFile(path.join(outputRoot, 'conversion-provenance.json'), `${JSON.stringify({
  schemaVersion: 1,
  converter: { name: 'Blender', version: actualBlenderVersion, executable: blender },
  command,
  input: { path: 'model.glb', bytes: glbBytes.length, sha256: sha256(glbBytes) },
  output: { path: 'model.usdz', bytes: usdzBytes.length, sha256: sha256(usdzBytes) },
  poster: { path: 'poster.webp', bytes: posterBytes.length, sha256: sha256(posterBytes) },
  repeatability: previousUsdz ? {
    usdz: previousUsdz.equals(usdzBytes) ? 'DETERMINISTIC' : 'NOT_DETERMINISTIC',
    previousUsdzSha256: sha256(previousUsdz),
    poster: previousPoster?.equals(posterBytes) ? 'DETERMINISTIC' : 'NOT_DETERMINISTIC',
  } : { usdz: 'NOT_MEASURED', poster: 'NOT_MEASURED' },
  materialProfile,
  status: revision === 'sheen-chair-r2'
    ? 'USDZ_STRUCTURALLY_BUILT_QUICK_LOOK_SAFE_MATERIAL_PROFILE_PHYSICAL_QA_PENDING'
    : 'USDZ_STRUCTURALLY_BUILT_IOS_MATERIAL_QA_PENDING',
}, null, 2)}\n`);
console.log(JSON.stringify({ modelGlbSha256: sha256(glbBytes), modelUsdzSha256: sha256(usdzBytes), modelUsdzBytes: usdzBytes.length, posterSha256: sha256(posterBytes) }, null, 2));
