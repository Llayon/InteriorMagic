import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');
const sourcePipelineRoot = path.join(dataRoot, 'ithappy-production-pipeline');
const sourceCatalogRoot = path.join(dataRoot, 'ithappy-catalog-build');
const deliveryRoot = path.join(dataRoot, 'ithappy-r2-delivery');
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const EXPECTED_ASSETS = 836;

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
const releaseVersion = valueAfter('--release', 'v1');
const bucket = valueAfter('--bucket', 'interiormagic-assets');
const selectedAsset = valueAfter('--asset', null);
const shouldUpload = args.includes('--upload');
const shouldVerify = args.includes('--verify');
const publicOrigin = valueAfter('--origin', process.env.ITHAPPY_R2_PUBLIC_ORIGIN || '');

if (!/^[a-z0-9][a-z0-9-]*$/.test(releaseVersion)) throw new Error(`Invalid release: ${releaseVersion}`);
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error(`Invalid bucket: ${bucket}`);
if (selectedAsset && !/^[a-z0-9_]+$/.test(selectedAsset)) throw new Error(`Invalid asset ID: ${selectedAsset}`);
if (selectedAsset && shouldUpload) throw new Error('--asset is a dry-run inspection filter only; immutable releases must be uploaded completely');

const releasePrefix = `catalog/${releaseVersion}`;
const deploymentRoot = path.join(deliveryRoot, 'deployment', releasePrefix);
const reportsRoot = path.join(deliveryRoot, 'reports');
const cacheRoot = path.join(deliveryRoot, 'cache');
const runtimeSourceRoot = path.join(sourcePipelineRoot, 'runtime-assets');
const thumbnailSourceRoot = path.join(sourceCatalogRoot, 'thumbnails');
const runtimeSourceManifest = path.join(sourcePipelineRoot, 'manifests', 'runtime-catalog.json');
const catalogSourceManifest = path.join(sourceCatalogRoot, 'manifests', 'catalog-payload.json');

const runtimeFields = [
  'id', 'runtimeFilename', 'category', 'runtimeBytes', 'triangleCount', 'primitiveCount', 'materialCount',
  'textureCount', 'maxTextureDimension', 'analyticalDecodedRGBABytes', 'policyVersion',
];
const catalogFields = [
  'assetId', 'sourceCategory', 'displayCategory', 'displayName', 'thumbnailFilename', 'runtimeFilename',
  'runtimeBytes', 'triangleCount', 'textureCount',
];
const numericRuntimeFields = runtimeFields.slice(3);
const numericCatalogFields = ['runtimeBytes', 'triangleCount', 'textureCount'];
const displayCategories = new Set(['Seating', 'Tables', 'Storage', 'Bedroom', 'Lighting', 'Plants', 'Decor', 'Kitchen & Bath', 'Architecture']);

const assertSafeId = (id) => {
  if (typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id)) throw new Error(`Unsafe asset ID: ${id}`);
};
const assertNumberFields = (entry, fields, label) => {
  for (const field of fields) if (typeof entry[field] !== 'number' || !Number.isFinite(entry[field]) || entry[field] < 0) throw new Error(`Invalid ${label}.${field}`);
};
const explicitPick = (entry, fields) => Object.fromEntries(fields.map((field) => {
  if (!(field in entry)) throw new Error(`Missing required field: ${field}`);
  return [field, entry[field]];
}));
const prettyJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (filename) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(filename).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')));
});
const fileRecord = async ({ remoteKey, logicalType, localFile, sourceFile, contentType }) => ({
  remoteKey, logicalType, sourceFile, bytes: (await stat(localFile)).size, sha256: await sha256(localFile), contentType,
  cacheControl: CACHE_CONTROL, releaseVersion,
});
const containsUnsafePath = (value) => /[a-z]:\\|[a-z]:\/|\.agent-data|Programms\\Max/i.test(value);

const prepareRelease = async () => {
  const runtimeInput = JSON.parse(await readFile(runtimeSourceManifest, 'utf8'));
  const catalogInput = JSON.parse(await readFile(catalogSourceManifest, 'utf8'));
  if (!Array.isArray(runtimeInput) || runtimeInput.length !== EXPECTED_ASSETS) throw new Error(`Expected ${EXPECTED_ASSETS} runtime records`);
  if (!Array.isArray(catalogInput) || catalogInput.length !== EXPECTED_ASSETS) throw new Error(`Expected ${EXPECTED_ASSETS} catalog records`);

  const runtimeIds = new Set();
  const runtime = runtimeInput.map((source) => {
    const entry = explicitPick(source, runtimeFields);
    assertSafeId(entry.id);
    if (runtimeIds.has(entry.id)) throw new Error(`Duplicate runtime ID: ${entry.id}`);
    runtimeIds.add(entry.id);
    assertNumberFields(entry, numericRuntimeFields, entry.id);
    if (typeof entry.category !== 'string' || !entry.category || !['string', 'number'].includes(typeof entry.policyVersion)) throw new Error(`Invalid runtime metadata: ${entry.id}`);
    if (entry.runtimeFilename !== `runtime-assets/${entry.id}.glb`) throw new Error(`Unexpected source runtime path: ${entry.id}`);
    return { ...entry, runtimeFilename: `runtime/${entry.id}.glb` };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const sourceRuntimeById = new Map(runtimeInput.map((entry) => [entry.id, entry]));
  const deployedRuntimeById = new Map(runtime.map((entry) => [entry.id, entry]));
  const catalogIds = new Set();
  const catalog = catalogInput.map((source) => {
    const entry = explicitPick(source, catalogFields);
    assertSafeId(entry.assetId);
    if (catalogIds.has(entry.assetId)) throw new Error(`Duplicate catalog ID: ${entry.assetId}`);
    catalogIds.add(entry.assetId);
    assertNumberFields(entry, numericCatalogFields, entry.assetId);
    if (typeof entry.sourceCategory !== 'string' || !entry.sourceCategory || typeof entry.displayName !== 'string' || !entry.displayName || !displayCategories.has(entry.displayCategory)) throw new Error(`Invalid catalog metadata: ${entry.assetId}`);
    const sourceRuntime = sourceRuntimeById.get(entry.assetId);
    const deployedRuntime = deployedRuntimeById.get(entry.assetId);
    if (!sourceRuntime || !deployedRuntime || entry.runtimeFilename !== sourceRuntime.runtimeFilename || entry.runtimeBytes !== deployedRuntime.runtimeBytes || entry.triangleCount !== deployedRuntime.triangleCount || entry.textureCount !== deployedRuntime.textureCount) throw new Error(`Catalog/runtime mismatch: ${entry.assetId}`);
    if (entry.thumbnailFilename !== `thumbnails/${entry.assetId}.webp`) throw new Error(`Unexpected thumbnail path: ${entry.assetId}`);
    return { ...entry, runtimeFilename: deployedRuntime.runtimeFilename };
  }).sort((a, b) => a.assetId.localeCompare(b.assetId));
  if (runtimeIds.size !== EXPECTED_ASSETS || catalogIds.size !== EXPECTED_ASSETS || [...runtimeIds].some((id) => !catalogIds.has(id))) throw new Error('Runtime/catalog ID sets differ');

  await rm(deploymentRoot, { recursive: true, force: true });
  await mkdir(deploymentRoot, { recursive: true });
  await mkdir(reportsRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });
  const runtimeManifestFile = path.join(deploymentRoot, 'runtime-catalog.json');
  const catalogManifestFile = path.join(deploymentRoot, 'catalog-payload.json');
  await writeFile(runtimeManifestFile, prettyJson(runtime));
  await writeFile(catalogManifestFile, prettyJson(catalog));
  for (const filename of [runtimeManifestFile, catalogManifestFile]) {
    const contents = await readFile(filename, 'utf8');
    if (containsUnsafePath(contents)) throw new Error(`Absolute/source path leak: ${filename}`);
  }

  const objects = [];
  for (const entry of runtime) {
    const localFile = path.join(runtimeSourceRoot, `${entry.id}.glb`);
    await access(localFile);
    if ((await stat(localFile)).size !== entry.runtimeBytes) throw new Error(`Runtime byte mismatch: ${entry.id}`);
    objects.push(await fileRecord({ remoteKey: `${releasePrefix}/runtime/${entry.id}.glb`, logicalType: 'runtime-glb', localFile, sourceFile: `ithappy-production-pipeline/runtime-assets/${entry.id}.glb`, contentType: 'model/gltf-binary' }));
  }
  for (const entry of catalog) {
    const localFile = path.join(thumbnailSourceRoot, `${entry.assetId}.webp`);
    await access(localFile);
    objects.push(await fileRecord({ remoteKey: `${releasePrefix}/thumbnails/${entry.assetId}.webp`, logicalType: 'thumbnail-webp', localFile, sourceFile: `ithappy-catalog-build/thumbnails/${entry.assetId}.webp`, contentType: 'image/webp' }));
  }
  objects.push(await fileRecord({ remoteKey: `${releasePrefix}/runtime-catalog.json`, logicalType: 'runtime-catalog', localFile: runtimeManifestFile, sourceFile: `deployment/${releasePrefix}/runtime-catalog.json`, contentType: 'application/json; charset=utf-8' }));
  objects.push(await fileRecord({ remoteKey: `${releasePrefix}/catalog-payload.json`, logicalType: 'catalog-payload', localFile: catalogManifestFile, sourceFile: `deployment/${releasePrefix}/catalog-payload.json`, contentType: 'application/json; charset=utf-8' }));

  const checksums = { releaseVersion, releasePrefix, objects: Object.fromEntries(objects.map((entry) => [entry.remoteKey, { bytes: entry.bytes, sha256: entry.sha256 }])) };
  const checksumsFile = path.join(deploymentRoot, 'checksums.json');
  await writeFile(checksumsFile, prettyJson(checksums));
  objects.push(await fileRecord({ remoteKey: `${releasePrefix}/checksums.json`, logicalType: 'release-checksums', localFile: checksumsFile, sourceFile: `deployment/${releasePrefix}/checksums.json`, contentType: 'application/json; charset=utf-8' }));

  const remoteKeys = new Set(objects.map((entry) => entry.remoteKey));
  if (objects.length !== 1675 || remoteKeys.size !== objects.length) throw new Error(`Unexpected deployment object scale: ${objects.length}/${remoteKeys.size}`);
  const manifest = { releaseVersion, releasePrefix, objectCount: objects.length, objects };
  const manifestText = prettyJson(manifest);
  if (containsUnsafePath(manifestText)) throw new Error('Deployment manifest leaks an absolute/source path');
  const manifestFile = path.join(deliveryRoot, 'deployment', 'deployment-manifest.json');
  await writeFile(manifestFile, manifestText);
  await writeFile(path.join(cacheRoot, `operational-${releaseVersion}.json`), prettyJson({ ...manifest, objects: objects.map((entry) => ({ ...entry, absoluteLocalFile: resolveLocalFile(entry) })) }));

  const byType = Object.groupBy(objects, (entry) => entry.logicalType);
  const totalBytes = objects.reduce((sum, entry) => sum + entry.bytes, 0);
  const largest = objects.reduce((result, entry) => entry.bytes > result.bytes ? entry : result, objects[0]);
  const report = {
    releaseVersion, releasePrefix, objectCount: objects.length, glbCount: byType['runtime-glb']?.length ?? 0,
    thumbnailCount: byType['thumbnail-webp']?.length ?? 0, jsonCount: objects.length - (byType['runtime-glb']?.length ?? 0) - (byType['thumbnail-webp']?.length ?? 0),
    glbBytes: (byType['runtime-glb'] ?? []).reduce((sum, entry) => sum + entry.bytes, 0),
    thumbnailBytes: (byType['thumbnail-webp'] ?? []).reduce((sum, entry) => sum + entry.bytes, 0), totalBytes,
    largestObject: { remoteKey: largest.remoteKey, bytes: largest.bytes }, tenGbReleaseCopies: Math.floor(10_000_000_000 / totalBytes),
    unsafeInputCount: 0, duplicateRemoteKeys: 0, missingFiles: 0,
  };
  await writeFile(path.join(reportsRoot, `dry-run-${releaseVersion}.json`), prettyJson(report));
  return { manifest, manifestFile, report };
};

function resolveLocalFile(entry) {
  if (entry.logicalType === 'runtime-glb') return path.join(runtimeSourceRoot, path.basename(entry.remoteKey));
  if (entry.logicalType === 'thumbnail-webp') return path.join(thumbnailSourceRoot, path.basename(entry.remoteKey));
  return path.join(deploymentRoot, path.basename(entry.remoteKey));
}

const run = (command, commandArgs, options = {}) => new Promise((resolve) => {
  const child = spawn(command, commandArgs, { cwd: repositoryRoot, env: process.env, shell: false, windowsHide: true, ...options });
  let stdout = '', stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk; if (options.echo) process.stdout.write(chunk); });
  child.stderr?.on('data', (chunk) => { stderr += chunk; if (options.echo) process.stderr.write(chunk); });
  child.once('exit', (code) => resolve({ code, stdout, stderr }));
});

const uploadRelease = async ({ manifest }) => {
  const require = createRequire(import.meta.url);
  const wranglerCli = require.resolve('wrangler');
  const checksumsEntry = manifest.objects.find((entry) => entry.logicalType === 'release-checksums');
  const remoteChecksumTemp = path.join(cacheRoot, `remote-checksums-${releaseVersion}.json`);
  await rm(remoteChecksumTemp, { force: true });
  const remoteCheck = await run(process.execPath, [wranglerCli, 'r2', 'object', 'get', `${bucket}/${checksumsEntry.remoteKey}`, '--file', remoteChecksumTemp, '--remote']);
  if (remoteCheck.code === 0) {
    const remoteHash = await sha256(remoteChecksumTemp);
    if (remoteHash !== checksumsEntry.sha256) throw new Error(`Immutable release ${releasePrefix} already exists with different hashes; use a new --release`);
    console.log(`Immutable release ${releasePrefix} already matches; upload skipped.`);
    return { uploaded: 0, skipped: manifest.objects.length };
  }

  const missingMessage = `${remoteCheck.stdout}\n${remoteCheck.stderr}`;
  if (!/not found|does not exist|no such key|10007/i.test(missingMessage)) {
    throw new Error(`Could not establish immutable release state before upload: ${missingMessage.trim() || `Wrangler exited ${remoteCheck.code}`}`);
  }

  const payload = manifest.objects.filter((entry) => entry.logicalType !== 'release-checksums');
  let uploaded = 0;
  const uploadOne = async (entry) => {
    const result = await run(process.execPath, [wranglerCli, 'r2', 'object', 'put', `${bucket}/${entry.remoteKey}`, '--file', resolveLocalFile(entry), '--content-type', entry.contentType, '--cache-control', entry.cacheControl, '--storage-class', 'Standard', '--remote', '--force']);
    if (result.code !== 0) throw new Error(`Upload failed: ${entry.remoteKey}`);
    uploaded += 1;
    if (uploaded % 100 === 0 || uploaded === payload.length) console.log(`Uploaded ${uploaded}/${payload.length} release payload objects.`);
  };
  const concurrency = 12;
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < payload.length) {
      const entry = payload[cursor++];
      await uploadOne(entry);
    }
  });
  await Promise.all(workers);
  const checksumResult = await run(process.execPath, [wranglerCli, 'r2', 'object', 'put', `${bucket}/${checksumsEntry.remoteKey}`, '--file', resolveLocalFile(checksumsEntry), '--content-type', checksumsEntry.contentType, '--cache-control', checksumsEntry.cacheControl, '--storage-class', 'Standard', '--remote', '--force'], { echo: true });
  if (checksumResult.code !== 0) throw new Error(`Upload failed: ${checksumsEntry.remoteKey}`);
  uploaded += 1;
  return { uploaded, skipped: manifest.objects.length - uploaded };
};

const verifyPublic = async ({ manifest }) => {
  if (!publicOrigin) throw new Error('--origin or ITHAPPY_R2_PUBLIC_ORIGIN is required for --verify');
  const base = publicOrigin.replace(/\/+$/, '');
  const sampleKeys = [
    `${releasePrefix}/catalog-payload.json`, `${releasePrefix}/thumbnails/sofa_037.webp`, `${releasePrefix}/runtime/sofa_037.glb`,
    `${releasePrefix}/runtime/chair_024.glb`, `${releasePrefix}/runtime/coffee_table.glb`, `${releasePrefix}/runtime/cupboard_003.glb`, `${releasePrefix}/runtime/lamp_048.glb`,
  ];
  const byKey = new Map(manifest.objects.map((entry) => [entry.remoteKey, entry]));
  const results = [];
  for (const key of sampleKeys) {
    const response = await fetch(`${base}/${key}`, { headers: { Origin: 'https://llayon.github.io' } });
    const bytes = Buffer.from(await response.arrayBuffer());
    const entry = byKey.get(key);
    results.push({ key, status: response.status, contentType: response.headers.get('content-type'), contentLength: response.headers.get('content-length'), cacheControl: response.headers.get('cache-control'), allowOrigin: response.headers.get('access-control-allow-origin'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (!response.ok || bytes.length !== entry.bytes || results.at(-1).sha256 !== entry.sha256) throw new Error(`Remote integrity failed: ${key}`);
  }
  const missing = await fetch(`${base}/${releasePrefix}/does-not-exist-${Date.now()}.glb`);
  const root = await fetch(`${base}/`);
  if (missing.ok || root.status === 200 && (await root.text()).includes('<ListBucketResult')) throw new Error('Remote 404/directory-listing safety failed');
  await writeFile(path.join(reportsRoot, `remote-http-${releaseVersion}.json`), prettyJson({ publicOrigin: base, results, missingStatus: missing.status, rootStatus: root.status }));
};

const prepared = await prepareRelease();
console.log(prettyJson(prepared.report));
if (shouldUpload) console.log(await uploadRelease(prepared));
if (shouldVerify) await verifyPublic(prepared);
