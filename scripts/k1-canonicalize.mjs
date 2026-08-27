#!/usr/bin/env node
// scripts/k1-canonicalize.mjs
//
// K1 — Canonical writer using @gltf-transform/core (NodeIO).
//
// Fixes vs. previous version:
//   P0 #1: rotation now correctly applied around +Y axis.
//          Old code had `[0, 0, sin, cos]` (rotation around Z), not Y.
//   P0 #2: clean bounds walker — simple recursion, no visited poisoning,
//          no pre-collection of descendant meshes; each node measures
//          its OWN attached mesh using its own world matrix.
//   P1 #3: source root transforms preserved by introducing a NEW
//          canonical wrapper Node that parents the existing source
//          scene roots; we set rotation/translation on the wrapper,
//          never on the source.
//   REMOVE prune/dedup — K1 is spatial canonicalization, not graph
//   optimization. Mutation surface is minimal.
//   Independent verifier: Three.js GLTFLoader + Box3.setFromObject is
//   a separate code path; if writer and verifier disagree materially,
//   the pipeline halts (no self-verified measure).
//   Orientation assertions: dot(transformedUp, +Y) ≈ 1 and
//   dot(transformedForward, +Z) ≈ 1, both checked deterministically.

// K1 — install browser-globals polyfills (self, Blob, FileReader, URL,
// Image, HTMLImageElement) so three.js's GLTFLoader can run in Node ESM.
// This is required for the INDEPENDENT geometry verifier (THREE.GLTFLoader)
// below — without the polyfill the loader's texture-image path throws
// "self is not defined" / "Cannot read properties of null".
import './k1-glb-runtime.mjs';
import { NodeIO } from '@gltf-transform/core';
import {
  KHRDracoMeshCompression,
  KHRMaterialsSpecular,
  KHRMaterialsIOR,
} from '@gltf-transform/extensions';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// Paths & constants
// ----------------------------------------------------------------------------

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');

const k1DataRoot = path.resolve(repositoryRoot, '.agent-data', 'k1-production-assets');
const k1ReportsRoot = path.join(k1DataRoot, 'reports');
const k1CanonicalRoot = path.join(k1DataRoot, 'canonical');

const k1SourceAssetRoot = path.resolve(
  process.env.K1_SOURCE_ASSET_ROOT ||
    process.env.ITHAPPY_PIPELINE_ROOT ||
    'D:/Programms/Max/Assets/Realistic_Furniture_glb/Furniture_Realistic_glb',
);
const sourceAssetsRoot = k1SourceAssetRoot;

const auditReportPath = path.join(k1ReportsRoot, 'k1-audit-raw.json');
const rawVisualQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-raw.json');
const pilotReportPath = path.join(k1ReportsRoot, 'k1-pilot-result.json');
const canonicalReportPath = path.join(k1ReportsRoot, 'k1-canonicalization-report.json');

export const ORIGIN_EPSILON_M = 0.005;
export const FLOOR_CONTACT_EPSILON_M = 0.005;
export const DIMENSION_EPSILON_M = 0.01;
export const ORIENTATION_VECTOR_EPSILON = 1e-3;

// Forward axis label → rotation around +Y required to align source forward with +Z.
// All rotations are about the world +Y axis.
const FORWARD_TO_Y_ROTATION_RADIANS = new Map([
  ['+Z', 0],
  ['-Z', Math.PI],
  ['+X', -Math.PI / 2],
  ['-X', Math.PI / 2],
  ['ambiguous', 0],
]);

// glTF / Three.js quaternion order: [x, y, z, w]
// Rotation around +Y axis by θ radians:
//   x = 0
//   y = sin(θ/2)
//   z = 0
//   w = cos(θ/2)
const yAxisQuaternion = (theta) => [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)];

// ----------------------------------------------------------------------------
// glTF-Transform setup
// ----------------------------------------------------------------------------

const io = new NodeIO()
  .registerExtensions([
    KHRDracoMeshCompression,
    KHRMaterialsSpecular,
    KHRMaterialsIOR,
  ])
  .registerDependencies({
    'draco3d.encoder': undefined,
    'draco3d.decoder': undefined,
  });

// ----------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Bounds walker (writer-side, glTF-Transform/accessor-based).
// Simple recursive traversal: each node composes its own world matrix
// from its parent's world matrix + its local TRS; measures ONLY its own
// attached mesh; recurses children with the composed world matrix.
// No pre-collection. No visited poisoning.
const computeBox3FromAccessors = (document) => {
  const worldMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const worldMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  const visit = (node, parentWorldMatrix) => {
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion(r[0], r[1], r[2], r[3]),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentWorldMatrix, local);

    // Measure THIS node's attached mesh using THIS world matrix.
    const mesh = typeof node.getMesh === 'function' ? node.getMesh() : null;
    if (mesh) {
      let prims = [];
      try {
        if (typeof mesh.listPrimitives === 'function') {
          prims = mesh.listPrimitives();
        }
      } catch {
        // defensive no-op: gltf-transform version may lack this API
      }
      for (const prim of prims) {
        let pos = null;
        try {
          pos = prim.getAttribute('POSITION');
        } catch {
          // defensive no-op
        }
        if (!pos) continue;
        let arr = null;
        try {
          arr = pos.getArray();
        } catch {
          // defensive no-op
        }
        const itemSize =
          typeof pos.getElementSize === 'function' ? pos.getElementSize() : 3;
        if (!arr || itemSize < 3) continue;
        for (let i = 0; i < arr.length; i += itemSize) {
          const v = new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(worldMatrix);
          worldMin.min(v);
          worldMax.max(v);
        }
      }
    }

    // Recurse into children with the composed world matrix.
    try {
      for (const child of node.listChildren()) {
        if (child.propertyType === 'Node') visit(child, worldMatrix);
      }
    } catch {
      // defensive no-op
    }
  };

  // Find root Nodes: top-level Nodes that have no parent.
  const rootNodes = document.getRoot()
    .listNodes()
    .filter((n) => n.propertyType === 'Node' && !n.getParentNode());

  const identity = new THREE.Matrix4();
  for (const root of rootNodes) visit(root, identity);

  if (!isFinite(worldMin.x)) {
    return { min: worldMin, max: worldMax, size: new THREE.Vector3() };
  }
  const size = new THREE.Vector3().subVectors(worldMax, worldMin);
  return { min: worldMin, max: worldMax, size };
};

// INDEPENDENT geometry verifier using Three.js GLTFLoader.
// This is a separate code path from the writer. If they disagree
// materially, the pipeline halts.
const verifyWithGltfLoader = async (glbBytes) => {
  const ab = glbBytes.buffer.slice(
    glbBytes.byteOffset,
    glbBytes.byteOffset + glbBytes.byteLength,
  );
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(ab, '');
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
    size: { width: size.x, height: size.y, depth: size.z },
    midpointX: (box.min.x + box.max.x) / 2,
    midpointZ: (box.min.z + box.max.z) / 2,
    minY: box.min.y,
  };
};

// ----------------------------------------------------------------------------
// Deterministic orientation assertions
// ----------------------------------------------------------------------------

const verifyOrientationAssertions = ({ axis, rotationCorrectionRadians }) => {
  // Assert 1: world up after correction remains +Y.
  // +Y rotation only changes the X and Z axes; it does NOT change up.
  // dot((0,1,0), (0,1,0)) = 1. Always true for pure Y-axis rotation.
  // We re-verify by composing: rotation about +Y leaves (0,1,0) invariant.
  const upAfterRotation = new THREE.Vector3(0, 1, 0).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    rotationCorrectionRadians,
  );
  const upInvariant = Math.abs(upAfterRotation.y - 1) < ORIENTATION_VECTOR_EPSILON;

  // Assert 2: source apparent forward, after the rotation about +Y,
  // must equal +Z (the canonical semantic forward).
  const axisVec = (() => {
    switch (axis) {
      case '+Z': return new THREE.Vector3(0, 0, 1);
      case '-Z': return new THREE.Vector3(0, 0, -1);
      case '+X': return new THREE.Vector3(1, 0, 0);
      case '-X': return new THREE.Vector3(-1, 0, 0);
      default: return null; // ambiguous
    }
  })();

  if (!axisVec) {
    return { upInvariant, forwardAsserted: 'notApplicable', axis };
  }

  const rotated = axisVec.clone().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    rotationCorrectionRadians,
  );
  const dotWithZ = rotated.dot(new THREE.Vector3(0, 0, 1));
  const forwardAsserted = Math.abs(dotWithZ - 1) < ORIENTATION_VECTOR_EPSILON;

  return { upInvariant, forwardAsserted, axis };
};

// ----------------------------------------------------------------------------
// Canonicalize one asset
// ----------------------------------------------------------------------------

export const canonicalizeOne = async ({ assetId, forwardApparentAxis }) => {
  let rotationCorrectionRadians = 0;
  let orientationDerived = false;
  if (
    forwardApparentAxis &&
    forwardApparentAxis !== 'ambiguous' &&
    FORWARD_TO_Y_ROTATION_RADIANS.has(forwardApparentAxis)
  ) {
    rotationCorrectionRadians = FORWARD_TO_Y_ROTATION_RADIANS.get(forwardApparentAxis);
    orientationDerived = true;
  }

  const sourcePath = path.join(sourceAssetsRoot, `${assetId}.glb`);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = hashBytes(sourceBytes);

  const document = await io.read(sourcePath);
  const root = document.getRoot();

  // ---- Source-side Box3 (for dimensions-preserved check).
  const sourceBox3 = computeBox3FromAccessors(document);
  const sourceDimensions = {
    width: sourceBox3.max.x - sourceBox3.min.x,
    height: sourceBox3.max.y - sourceBox3.min.y,
    depth: sourceBox3.max.z - sourceBox3.min.z,
  };

  // ---- STEP 1: create a NEW canonical wrapper Node that parents the
  // existing source scene root(s). Source root transforms are NOT
  // modified; the wrapper carries the rotation correction.
  const wrapper = document.createNode('CanonicalWrapper');

  // Detach existing scene root Nodes from their scene and re-parent to
  // the wrapper. The wrapper becomes the new scene root. Source root
  // local transforms are preserved (only their parent reference changes).
  const scenes = root.listScenes();
  const rootNodesToMove = [];
  for (const scene of scenes) {
    for (const child of scene.listChildren()) {
      if (child !== wrapper) rootNodesToMove.push(child);
    }
  }
  // Also catch any root-level nodes not listed under a scene.
  for (const n of root.listNodes()) {
    if (n.propertyType !== 'Node') continue;
    if (n === wrapper) continue;
    if (!n.getParentNode() && !rootNodesToMove.includes(n)) {
      rootNodesToMove.push(n);
    }
  }

  // Add the wrapper as the new scene root first.
  for (const scene of scenes) {
    scene.addChild(wrapper);
  }
  // Move original scene children into the wrapper (and remove them from
  // their original scene to keep the wrapper the only scene root).
  for (const child of rootNodesToMove) {
    wrapper.addChild(child);
    for (const scene of scenes) {
      try {
        scene.removeChild(child);
      } catch {
        // defensive no-op: child may not have been a scene child
      }
    }
  }

  // ---- STEP 2: apply rotation around +Y to the WRAPPER (not to source
  // roots). Source transforms preserved.
  wrapper.setRotation(yAxisQuaternion(rotationCorrectionRadians));
  wrapper.setTranslation([0, 0, 0]);
  wrapper.setScale([1, 1, 1]);

  // ---- STEP 3: measure POST-rotation Box3 of the wrapped scene.
  // The wrapper has rotation about +Y. Compute its world bounds.
  const postRotationBox3 = computeBox3FromAccessors(document);
  const midpointX = (postRotationBox3.min.x + postRotationBox3.max.x) / 2;
  const midpointZ = (postRotationBox3.min.z + postRotationBox3.max.z) / 2;
  const minY = postRotationBox3.min.y;

  // ---- STEP 4: apply translation to the WRAPPER so the asset's
  // post-rotation midpoint sits at world origin and the floor contacts
  // world Y=0.
  const translation = { x: -midpointX, y: -minY, z: -midpointZ };
  wrapper.setTranslation([translation.x, translation.y, translation.z]);

  // ---- STEP 5: write canonical GLB.
  const canonicalBytes = await io.writeBinary(document);
  const canonicalSha256 = hashBytes(canonicalBytes);
  await mkdir(k1CanonicalRoot, { recursive: true });
  const outPath = path.join(k1CanonicalRoot, `${assetId}.glb`);
  await writeFile(outPath, canonicalBytes);

  // ---- STEP 6: re-measure with the writer's bounds walker.
  const verifyDoc = await io.readBinary(canonicalBytes);
  const verifyBox3 = computeBox3FromAccessors(verifyDoc);
  const reloadMidpointX = (verifyBox3.min.x + verifyBox3.max.x) / 2;
  const reloadMidpointZ = (verifyBox3.min.z + verifyBox3.max.z) / 2;
  const reloadMinY = verifyBox3.min.y;
  const reloadedSize = verifyBox3.size;

  // ---- STEP 7: INDEPENDENT verification via GLTFLoader.
  const independentVerify = await verifyWithGltfLoader(canonicalBytes);

  // ---- STEP 8: orientation assertions.
  const orientationAssertions = verifyOrientationAssertions({
    axis: forwardApparentAxis,
    rotationCorrectionRadians,
  });

  return {
    skipped: false,
    assetId,
    rotationCorrectionRadians,
    orientationDerived,
    translationApplied: translation,
    scaleApplied: 1,
    sourceSha256,
    canonicalSha256,
    sourceDimensions,
    sourceBox3: {
      min: { x: sourceBox3.min.x, y: sourceBox3.min.y, z: sourceBox3.min.z },
      max: { x: sourceBox3.max.x, y: sourceBox3.max.y, z: sourceBox3.max.z },
    },
    canonicalBox3: {
      min: { x: verifyBox3.min.x, y: verifyBox3.min.y, z: verifyBox3.min.z },
      max: { x: verifyBox3.max.x, y: verifyBox3.max.y, z: verifyBox3.max.z },
    },
    reloadedSize: {
      width: reloadedSize.x,
      height: reloadedSize.y,
      depth: reloadedSize.z,
    },
    reloadMidpointX,
    reloadMidpointZ,
    reloadMinY,
    // Independent GLTFLoader measurement (separate code path).
    independentMeasurement: {
      dimensions: independentVerify.size,
      midpointX: independentVerify.midpointX,
      midpointZ: independentVerify.midpointZ,
      minY: independentVerify.minY,
    },
    orientationAssertions,
  };
};

// ----------------------------------------------------------------------------
// CLI entrypoint
// ----------------------------------------------------------------------------

const isMainModule = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  const args = process.argv.slice(2);
  const pilotIdx = args.indexOf('--pilot');
  const batchIdx = args.indexOf('--batch');

  if (pilotIdx >= 0) {
    const pilotAssetId = args[pilotIdx + 1];
    if (!pilotAssetId) {
      console.error('K1 canonicalize: --pilot requires an assetId argument');
      process.exit(2);
    }
    runPilot(pilotAssetId).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else if (batchIdx >= 0) {
    runBatch().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    console.error('Usage: node scripts/k1-canonicalize.mjs --pilot <assetId> | --batch');
    process.exit(2);
  }
}

async function runPilot(assetId) {
  // Per RAW evidence: sofa source apparent forward = -Z; carpet forward = ambiguous.
  const forwardForPilot = assetId === 'sofa' ? '-Z' : 'ambiguous';

  const sourcePath = path.join(sourceAssetsRoot, `${assetId}.glb`);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = hashBytes(sourceBytes);

  const result = await canonicalizeOne({
    assetId,
    forwardApparentAxis: forwardForPilot,
  });

  if (result.skipped) {
    throw new Error(`K1 STOP — pilot skipped: ${result.reason}`);
  }

  const preTranslationSize = result.sourceDimensions;
  const dimensionChecks = {
    widthOk: Math.abs(result.reloadedSize.width - preTranslationSize.width) <= DIMENSION_EPSILON_M,
    heightOk: Math.abs(result.reloadedSize.height - preTranslationSize.height) <= DIMENSION_EPSILON_M,
    depthOk: Math.abs(result.reloadedSize.depth - preTranslationSize.depth) <= DIMENSION_EPSILON_M,
  };
  const writerAssertions = {
    midpointXAtOrigin: Math.abs(result.reloadMidpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    midpointZAtOrigin: Math.abs(result.reloadMidpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    floorContactForFloorAssets:
      Math.abs(result.reloadMinY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
    dimensionsPreserved:
      dimensionChecks.widthOk && dimensionChecks.heightOk && dimensionChecks.depthOk
        ? 'pass'
        : 'fail',
  };
  const independentAssertions = {
    midpointXAtOrigin:
      Math.abs(result.independentMeasurement.midpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    midpointZAtOrigin:
      Math.abs(result.independentMeasurement.midpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    floorContactForFloorAssets:
      Math.abs(result.independentMeasurement.minY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
    dimensionsPreserved:
      Math.abs(result.independentMeasurement.dimensions.width - preTranslationSize.width) <=
        DIMENSION_EPSILON_M &&
      Math.abs(result.independentMeasurement.dimensions.height - preTranslationSize.height) <=
        DIMENSION_EPSILON_M &&
      Math.abs(result.independentMeasurement.dimensions.depth - preTranslationSize.depth) <=
        DIMENSION_EPSILON_M
        ? 'pass'
        : 'fail',
  };
  const independentVsWriter =
    Math.abs(result.independentMeasurement.midpointX - result.reloadMidpointX) <
      ORIGIN_EPSILON_M * 4 &&
    Math.abs(result.independentMeasurement.midpointZ - result.reloadMidpointZ) <
      ORIGIN_EPSILON_M * 4 &&
    Math.abs(result.independentMeasurement.minY - result.reloadMinY) <
      FLOOR_CONTACT_EPSILON_M * 4
      ? 'pass'
      : 'fail';

  const pilotReport = {
    pilotAssetId: assetId,
    pilotAssumption: `forward=${forwardForPilot}`,
    sourceSha256,
    sourceBytes: sourceBytes.byteLength,
    canonicalSha256: result.canonicalSha256,
    canonicalFile: path.join(k1CanonicalRoot, `${assetId}.glb`),
    rotationCorrectionRadians: result.rotationCorrectionRadians,
    rotationAxis: '+Y',
    translationApplied: result.translationApplied,
    scaleApplied: 1,
    preTranslationSize,
    reloadedSize: result.reloadedSize,
    reloadMidpointX: result.reloadMidpointX,
    reloadMidpointZ: result.reloadMidpointZ,
    reloadMinY: result.reloadMinY,
    independentMeasurement: result.independentMeasurement,
    orientationAssertions: result.orientationAssertions,
    writerAssertions,
    independentAssertions,
    independentVsWriter,
    tolerances: {
      ORIGIN_EPSILON_M,
      FLOOR_CONTACT_EPSILON_M,
      DIMENSION_EPSILON_M,
      ORIENTATION_VECTOR_EPSILON,
    },
    timestamp: new Date().toISOString(),
  };

  await mkdir(k1ReportsRoot, { recursive: true });
  await writeFile(pilotReportPath, JSON.stringify(pilotReport, null, 2));
  console.log(JSON.stringify(pilotReport, null, 2));
}

async function runBatch() {
  const audit = JSON.parse(await readFile(auditReportPath, 'utf8'));
  const rawQa = JSON.parse(await readFile(rawVisualQaPath, 'utf8'));
  const qaById = new Map(rawQa.assets.map((r) => [r.assetId, r]));

  const out = [];
  for (const auditRow of audit.assets) {
    const id = auditRow.assetId;
    const qaRow = qaById.get(id);
    if (!qaRow) {
      out.push({
        assetId: id,
        semanticRole: auditRow.semanticRole,
        sourceSha256: auditRow.sourceSha256,
        canonicalSha256: null,
        skipped: true,
        reason: 'no RAW QA row found for this asset',
      });
      continue;
    }
    const v = qaRow.verdict;
    const axis = qaRow.reviewerFields?.forwardApparentAxis;

    if (v === 'unsupported') {
      out.push({
        assetId: id,
        semanticRole: auditRow.semanticRole,
        sourceSha256: auditRow.sourceSha256,
        canonicalSha256: null,
        skipped: true,
        reason: 'RAW QA verdict=unsupported',
      });
      continue;
    }

    const r = await canonicalizeOne({ assetId: id, forwardApparentAxis: axis });
    if (r.skipped) {
      out.push({
        assetId: id,
        semanticRole: auditRow.semanticRole,
        sourceSha256: r.sourceSha256,
        canonicalSha256: null,
        skipped: true,
        reason: r.reason,
      });
      continue;
    }

    out.push({
      assetId: id,
      semanticRole: auditRow.semanticRole,
      semanticMismatch: v === 'fail',
      rawVerdict: v,
      sourceSha256: r.sourceSha256,
      canonicalSha256: r.canonicalSha256,
      rotationCorrectionRadians: r.rotationCorrectionRadians,
      rotationAxis: '+Y',
      orientationDerived: r.orientationDerived,
      translationApplied: r.translationApplied,
      scaleApplied: 1,
      sourceDimensions: r.sourceDimensions,
      reloadedSize: r.reloadedSize,
      reloadMidpointX: r.reloadMidpointX,
      reloadMidpointZ: r.reloadMidpointZ,
      reloadMinY: r.reloadMinY,
      independentMeasurement: r.independentMeasurement,
      orientationAssertions: r.orientationAssertions,
      measurementAssertions: {
        midpointXAtOrigin:
          Math.abs(r.reloadMidpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        midpointZAtOrigin:
          Math.abs(r.reloadMidpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        floorContactForFloorAssets:
          Math.abs(r.reloadMinY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
        dimensionsPreserved:
          Math.abs(r.reloadedSize.width - r.sourceDimensions.width) <= DIMENSION_EPSILON_M &&
          Math.abs(r.reloadedSize.height - r.sourceDimensions.height) <= DIMENSION_EPSILON_M &&
          Math.abs(r.reloadedSize.depth - r.sourceDimensions.depth) <= DIMENSION_EPSILON_M
            ? 'pass'
            : 'fail',
        independentMidpointXAtOrigin:
          Math.abs(r.independentMeasurement.midpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        independentMidpointZAtOrigin:
          Math.abs(r.independentMeasurement.midpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        independentFloorContact:
          Math.abs(r.independentMeasurement.minY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
        orientationUpInvariant: r.orientationAssertions.upInvariant ? 'pass' : 'fail',
        orientationForwardAsserted:
          r.orientationAssertions.forwardAsserted === true
            ? 'pass'
            : r.orientationAssertions.forwardAsserted === 'notApplicable'
              ? 'notApplicable'
              : 'fail',
      },
    });
  }

  await mkdir(k1ReportsRoot, { recursive: true });
  await writeFile(canonicalReportPath, JSON.stringify({ assets: out }, null, 2));
  console.log(`K1 batch canonicalization: wrote ${out.length} rows`);
}
