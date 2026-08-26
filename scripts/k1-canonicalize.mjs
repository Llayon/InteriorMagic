#!/usr/bin/env node
// scripts/k1-canonicalize.mjs
//
// K1 — Canonical writer using @gltf-transform/core (NodeIO) + @gltf-transform/functions.
//
// This replaces the failed GLTFExporter approach. glTF-Transform's NodeIO is a
// purpose-built Node.js GLB/glTF reader/writer that:
//   - preserves all texture/material/image data verbatim (no Node-only gotchas)
//   - supports scene graph modification via Document/Nodes API
//   - round-trips glTF files losslessly (same JSON+buffer layout)
//
// Translation order (guardrail #1 + user rule §3):
//   1. Apply rotation correction to root scene node (Y-axis quaternion).
//   2. (glTF-Transform updates world transforms lazily.)
//   3. Re-measure Box3 from POST-ROTATION scene via three.js + gltf-transform's
//      document.toThreeScene() helper or by computing from accessor bounds.
//   4. Compute midpointX, midpointZ, minY from POST-ROTATION Box3.
//   5. Apply translation = (-midpointX, -minY, -midpointZ).
//   6. Floor contact symmetric abs() check.
//
// Orientation contract (user rule §3):
//   - canonical semantic forward = +Z (frozen)
//   - raw-evidence-derived rotation; ambiguous = 0, no role-derived correction
//   - FAIL semantic-mismatch assets: still canonicalized geometrically, just
//     no role-derived orientation
//
// File naming:
//   --pilot <assetId>      one-asset pilot (sofa or carpet)
//   --batch                all 47 frozen-selection assets

import { NodeIO } from '@gltf-transform/core';
import {
  KHRDracoMeshCompression,
  KHRMaterialsSpecular,
  KHRMaterialsIOR,
} from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import * as THREE from 'three';
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
const k1LogsRoot = path.join(k1DataRoot, 'logs');

// Source asset root — K1 uses the authoritative Realistic_Furniture_glb directory.
const k1SourceAssetRoot = path.resolve(
  process.env.K1_SOURCE_ASSET_ROOT ||
    process.env.ITHAPPY_PIPELINE_ROOT ||
    'D:/Programms/Max/Assets/Realistic_Furniture_glb/Furniture_Realistic_glb',
);
const sourceAssetsRoot = k1SourceAssetRoot;

const frozenSelectionPath = path.join(
  repositoryRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-catalog-v1.json',
);
const k1BaseShaLogPath = path.join(k1LogsRoot, 'k1-base-sha.txt');

const auditReportPath = path.join(k1ReportsRoot, 'k1-audit-raw.json');
const rawVisualQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-raw.json');
const pilotReportPath = path.join(k1ReportsRoot, 'k1-pilot-result.json');
const canonicalReportPath = path.join(k1ReportsRoot, 'k1-canonicalization-report.json');

export const ORIGIN_EPSILON_M = 0.005;
export const FLOOR_CONTACT_EPSILON_M = 0.005;
export const DIMENSION_EPSILON_M = 0.01;

const FORWARD_TO_ROTATION = new Map([
  ['+Z', 0],
  ['-Z', Math.PI],
  ['+X', -Math.PI / 2],
  ['-X', Math.PI / 2],
  ['ambiguous', 0],
]);

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
    'draco3d.encoder': undefined, // skip Draco; we use uncompressed GLBs
    'draco3d.decoder': undefined,
  });

// ----------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Convert a glTF-Transform Document to a THREE.Scene for Box3 measurement.
// This is a lightweight approach: we walk the node graph and create
// corresponding THREE.Object3D nodes, then measure.
const documentToThreeScene = (document) => {
  const scene = new THREE.Scene();
  const nodeMap = new Map(); // gltf-transform Node index → THREE.Object3D
  const list = document.getRoot().listSiblings(); // all top-level accessors
  // Walk nodes
  const nodes = document.getRoot().listNodes();
  for (const node of nodes) {
    let obj;
    if (node.propertyType === 'Node') {
      obj = new THREE.Group();
    } else if (node.propertyType === 'Mesh') {
      const mesh = node.getMesh();
      const geometry = new THREE.BufferGeometry();
      const position = mesh.getPrimitive(0).getAttribute('POSITION');
      if (position) {
        const arr = position.getArray();
        const itemSize = position.getElementSize();
        geometry.setAttribute('position', new THREE.BufferAttribute(arr, itemSize));
      }
      const material = new THREE.MeshBasicMaterial({ color: 0xcccccc });
      obj = new THREE.Mesh(geometry, material);
    } else {
      obj = new THREE.Object3D();
    }
    // Apply node transform
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    obj.position.set(t[0], t[1], t[2]);
    obj.quaternion.set(r[0], r[1], r[2], r[3]);
    obj.scale.set(s[0], s[1], s[2]);
    obj.name = node.getName() || '';
    nodeMap.set(node, obj);
  }
  // Build parent-child relationships from each Node's list of children
  for (const node of nodes) {
    if (node.propertyType !== 'Node') continue;
    const obj = nodeMap.get(node);
    for (const child of node.listChildren()) {
      const childObj = nodeMap.get(child);
      if (childObj) obj.add(childObj);
    }
    // If this Node has no parent in the list AND is a scene, attach to root scene
    const parent = node.getParentNode();
    if (!parent && obj.parent === null) {
      scene.add(obj);
    }
  }
  // Also handle meshes: their parent is the node they belong to
  for (const node of nodes) {
    if (node.propertyType !== 'Mesh') continue;
    const obj = nodeMap.get(node);
    // Find the node in the parent scene's node list that references this mesh
    for (const sceneNode of document.getRoot().listNodes()) {
      if (sceneNode.propertyType !== 'Node') continue;
      // gltf-transform's Node has listMeshes() in newer versions; we
      // fall back to parent lookup if needed.
      const parentObj = nodeMap.get(sceneNode);
      if (parentObj && parentObj.children.indexOf(obj) === -1) {
        // Attach if this scene node references our mesh
        try {
          const meshes = sceneNode.listMeshes ? sceneNode.listMeshes() : [];
          if (meshes.indexOf(node) !== -1 && obj.parent === null) {
            parentObj.add(obj);
          }
        } catch {
          // ignore — attach at root
          if (obj.parent === null) scene.add(obj);
        }
      }
    }
    if (obj.parent === null) scene.add(obj);
  }
  scene.updateMatrixWorld(true);
  return scene;
};

// Alternative Box3 computation directly from accessor bounds (works for
// static, non-skinned glTFs). We iterate POSITION accessors and union the
// min/max ranges in the node-local frame. This is more reliable than the
// THREE.Scene walk above because it doesn't depend on Three.js Object3D
// hierarchy.
const computeBox3FromAccessors = (document) => {
  // Find root nodes: top-level Nodes that have no parent.
  const allNodes = document.getRoot().listNodes();
  const rootNodes = allNodes.filter(
    (n) => n.propertyType === 'Node' && !n.getParentNode(),
  );
  const worldMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const worldMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const visited = new Set();

  // Recursive function: for each node, gather the mesh attached to it
  // (and recursively for child Nodes), apply the node's world matrix,
  // and union the bounds.
  const visit = (node, parentWorldMatrix) => {
    if (visited.has(node)) return;
    visited.add(node);

    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion(r[0], r[1], r[2], r[3]),
      new THREE.Vector3(s[0], s[1], s[2]),
    );
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentWorldMatrix, local);

    // The single mesh attached to this Node (newer glTF-Transform stores
    // it via Node.getMesh(); earlier versions used a Mesh Extension).
    const attachedMesh = typeof node.getMesh === 'function' ? node.getMesh() : null;
    const allMeshes = [];
    if (attachedMesh) allMeshes.push(attachedMesh);

    // Recursively collect child Nodes' meshes too.
    try {
      for (const child of node.listChildren()) {
        if (child.propertyType === 'Node') {
          // We need to descend — collect meshes by recursing into the child.
          const collect = (n, acc) => {
            if (visited.has(n)) return;
            visited.add(n);
            try {
              const m = typeof n.getMesh === 'function' ? n.getMesh() : null;
              if (m) acc.push(m);
            } catch {}
            try {
              for (const c of n.listChildren()) collect(c, acc);
            } catch {}
          };
          collect(child, allMeshes);
        }
      }
    } catch {}

    for (const mesh of allMeshes) {
      let prims = [];
      try {
        if (typeof mesh.listPrimitives === 'function') {
          prims = mesh.listPrimitives();
        }
      } catch {}
      for (const prim of prims) {
        let pos = null;
        try {
          pos = prim.getAttribute('POSITION');
        } catch {}
        if (!pos) continue;
        let arr = null;
        try {
          arr = pos.getArray();
        } catch {}
        const itemSize =
          typeof pos.getElementSize === 'function' ? pos.getElementSize() : 3;
        if (!arr || itemSize < 3) continue;
        // Iterate vertices in local space, transform each by worldMatrix, union.
        for (let i = 0; i < arr.length; i += itemSize) {
          const v = new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(worldMatrix);
          worldMin.min(v);
          worldMax.max(v);
        }
      }
    }

    try {
      for (const child of node.listChildren()) {
        if (child.propertyType === 'Node') visit(child, worldMatrix);
      }
    } catch {}
  };

  const identity = new THREE.Matrix4();
  for (const root of rootNodes) visit(root, identity);

  if (!isFinite(worldMin.x)) {
    return { min: worldMin, max: worldMax, size: new THREE.Vector3() };
  }
  const size = new THREE.Vector3().subVectors(worldMax, worldMin);
  return { min: worldMin, max: worldMax, size };
};

// ----------------------------------------------------------------------------
// Canonicalize one asset using glTF-Transform
// ----------------------------------------------------------------------------

export const canonicalizeOne = async ({ assetId, forwardApparentAxis }) => {
  let rotationCorrectionRadians = 0;
  let orientationDerived = false;
  if (
    forwardApparentAxis &&
    forwardApparentAxis !== 'ambiguous' &&
    FORWARD_TO_ROTATION.has(forwardApparentAxis)
  ) {
    rotationCorrectionRadians = FORWARD_TO_ROTATION.get(forwardApparentAxis);
    orientationDerived = true;
  }

  // Read source via glTF-Transform (preserves textures, materials, etc.)
  const sourcePath = path.join(sourceAssetsRoot, `${assetId}.glb`);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = hashBytes(sourceBytes);

  // Use glTF-Transform to read the source.
  const document = await io.read(sourcePath);
  const root = document.getRoot();

  // Step 1: Apply rotation correction to ALL root scene nodes.
  // We use Node.setRotation() with a Y-axis quaternion.
  const rotationQuat = [
    0,
    0,
    Math.sin(rotationCorrectionRadians / 2),
    Math.cos(rotationCorrectionRadians / 2),
  ];
  const rootNodes = root.listNodes().filter((n) => n.propertyType === 'Node' && !n.getParentNode());
  for (const node of rootNodes) {
    // Combine existing rotation with our correction by composing quaternions.
    // For a childless semantic — we just SET the rotation on root nodes.
    // (For nested scenes, deeper rotations remain unchanged; the top-level
    // rotation is what affects the world-axis forward convention.)
    node.setRotation(rotationQuat);
  }

  // Step 2: Compute POST-ROTATION Box3 directly from accessor bounds.
  // glTF-Transform applies setRotation lazily; accessor positions are still in
  // local frame. We compute world bounds by walking the scene graph and applying
  // each node's world matrix to its descendant mesh positions.
  const postRotationBox3 = computeBox3FromAccessors(document);
  const midpointX = (postRotationBox3.min.x + postRotationBox3.max.x) / 2;
  const midpointZ = (postRotationBox3.min.z + postRotationBox3.max.z) / 2;
  const minY = postRotationBox3.min.y;

  // Step 3: Apply translation = (-midpointX, -minY, -midpointZ) to root nodes.
  // Compose with the rotation already on the node (so existing rotation +
  // new translation is the final world transform).
  const translation = {
    x: -midpointX,
    y: -minY,
    z: -midpointZ,
  };
  for (const node of rootNodes) {
    // Set translation directly; rotation was already set above. The order
    // in the resulting world matrix is T * R * S (Three.js convention), which
    // matches what we want: the asset is rotated first, then translated so
    // its post-rotation midpoint sits at world origin.
    node.setTranslation([translation.x, translation.y, translation.z]);
  }

  // Step 4: Write canonical GLB via glTF-Transform's NodeIO.
  // dedup + prune are safety passes; they don't strip textures.
  await document.transform(prune({ keepLeaves: false }), dedup());

  const canonicalBytes = await io.writeBinary(document);
  const canonicalSha256 = hashBytes(canonicalBytes);

  await mkdir(k1CanonicalRoot, { recursive: true });
  const outPath = path.join(k1CanonicalRoot, `${assetId}.glb`);
  await writeFile(outPath, canonicalBytes);

  // Step 5: Reload and re-measure to verify (per user rule §3).
  const verifyDoc = await io.readBinary(canonicalBytes);
  const verifyBox3 = computeBox3FromAccessors(verifyDoc);
  const reloadMidpointX = (verifyBox3.min.x + verifyBox3.max.x) / 2;
  const reloadMidpointZ = (verifyBox3.min.z + verifyBox3.max.z) / 2;
  const reloadMinY = verifyBox3.min.y;
  const reloadedSize = verifyBox3.size;

  return {
    skipped: false,
    assetId,
    rotationCorrectionRadians,
    orientationDerived,
    translationApplied: translation,
    scaleApplied: 1,
    sourceSha256,
    canonicalSha256,
    sourceBox3: {
      min: { x: postRotationBox3.min.x, y: postRotationBox3.min.y, z: postRotationBox3.min.z },
      max: { x: postRotationBox3.max.x, y: postRotationBox3.max.y, z: postRotationBox3.max.z },
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
  };
};

// ----------------------------------------------------------------------------
// CLI entrypoint — only runs when this script is invoked directly. Imports
// from other modules must avoid side effects here.
// ----------------------------------------------------------------------------

// On Windows, import.meta.url uses forward slashes (file:///D:/path) while
// process.argv[1] uses backslashes (D:\path). Normalize both for comparison.
const argv1 = process.argv[1] ? `file:///${process.argv[1].replace(/\\/g, '/')}` : '';
const isMainModule = import.meta.url === argv1;
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
  // Pilot assumes +Z forward for the basic geometry test. RAW evidence
  // (when called from --batch) overrides this per-asset.
  const forwardForPilot = assetId === 'sofa' ? '-Z' : '+Z';

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

  const preTranslationSize = {
    width: result.sourceBox3.max.x - result.sourceBox3.min.x,
    height: result.sourceBox3.max.y - result.sourceBox3.min.y,
    depth: result.sourceBox3.max.z - result.sourceBox3.min.z,
  };
  const dimensionChecks = {
    widthOk: Math.abs(result.reloadedSize.width - preTranslationSize.width) <= DIMENSION_EPSILON_M,
    heightOk: Math.abs(result.reloadedSize.height - preTranslationSize.height) <= DIMENSION_EPSILON_M,
    depthOk: Math.abs(result.reloadedSize.depth - preTranslationSize.depth) <= DIMENSION_EPSILON_M,
  };
  const measurementAssertions = {
    midpointXAtOrigin: Math.abs(result.reloadMidpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    midpointZAtOrigin: Math.abs(result.reloadMidpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
    floorContactForFloorAssets:
      Math.abs(result.reloadMinY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
    dimensionsPreserved:
      dimensionChecks.widthOk && dimensionChecks.heightOk && dimensionChecks.depthOk
        ? 'pass'
        : 'fail',
  };

  const pilotReport = {
    pilotAssetId: assetId,
    pilotAssumption: `forward=${forwardForPilot} (RAW evidence will override per-asset in --batch)`,
    sourceSha256,
    sourceBytes: sourceBytes.byteLength,
    canonicalSha256: result.canonicalSha256,
    canonicalFile: path.join(k1CanonicalRoot, `${assetId}.glb`),
    rotationCorrectionRadians: result.rotationCorrectionRadians,
    translationApplied: result.translationApplied,
    scaleApplied: 1,
    preTranslationSize,
    reloadedBox3: result.canonicalBox3,
    reloadedSize: result.reloadedSize,
    reloadMidpointX: result.reloadMidpointX,
    reloadMidpointZ: result.reloadMidpointZ,
    reloadMinY: result.reloadMinY,
    measurementAssertions,
    allAssertionsPass:
      measurementAssertions.midpointXAtOrigin === 'pass' &&
      measurementAssertions.midpointZAtOrigin === 'pass' &&
      measurementAssertions.floorContactForFloorAssets === 'pass' &&
      measurementAssertions.dimensionsPreserved === 'pass',
    tolerances: {
      ORIGIN_EPSILON_M,
      FLOOR_CONTACT_EPSILON_M,
      DIMENSION_EPSILON_M,
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
  const auditById = new Map(audit.assets.map((r) => [r.assetId, r]));
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
        reason: 'RAW QA verdict=unsupported (no evidence to normalize)',
      });
      continue;
    }

    const r = await canonicalizeOne({ assetId: id, forwardApparentAxis: axis });
    if (r.skipped) {
      out.push({
        assetId: id,
        semanticRole: auditRow.semanticRole,
        sourceSha256: auditRow.sourceSha256,
        sourceSha256: auditRow.sourceSha256,
        canonicalSha256: null,
        skipped: true,
        reason: r.reason,
      });
      continue;
    }

    const preTranslationSize = {
      width: r.sourceBox3.max.x - r.sourceBox3.min.x,
      height: r.sourceBox3.max.y - r.sourceBox3.min.y,
      depth: r.sourceBox3.max.z - r.sourceBox3.min.z,
    };

    out.push({
      assetId: id,
      semanticRole: auditRow.semanticRole,
      semanticMismatch: v === 'fail',
      rawVerdict: v,
      sourceSha256: r.sourceSha256,
      canonicalSha256: r.canonicalSha256,
      rotationCorrectionRadians: r.rotationCorrectionRadians,
      orientationDerived: r.orientationDerived,
      translationApplied: r.translationApplied,
      scaleApplied: 1,
      sourceBox3: r.sourceBox3,
      canonicalBox3: r.canonicalBox3,
      preTranslationSize,
      reloadedBox3: r.canonicalBox3,
      reloadedSize: r.reloadedSize,
      measurementAssertions: {
        midpointXAtOrigin: Math.abs(r.reloadMidpointX) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        midpointZAtOrigin: Math.abs(r.reloadMidpointZ) <= ORIGIN_EPSILON_M ? 'pass' : 'fail',
        floorContactForFloorAssets:
          Math.abs(r.reloadMinY) <= FLOOR_CONTACT_EPSILON_M ? 'pass' : 'fail',
        dimensionsPreserved:
          Math.abs(r.reloadedSize.width - preTranslationSize.width) <= DIMENSION_EPSILON_M &&
          Math.abs(r.reloadedSize.height - preTranslationSize.height) <= DIMENSION_EPSILON_M &&
          Math.abs(r.reloadedSize.depth - preTranslationSize.depth) <= DIMENSION_EPSILON_M
            ? 'pass'
            : 'fail',
      },
    });
  }

  await mkdir(k1ReportsRoot, { recursive: true });
  await writeFile(canonicalReportPath, JSON.stringify({ assets: out }, null, 2));
  console.log(
    `K1 batch canonicalization: wrote ${out.length} asset rows to ${canonicalReportPath}`,
  );
}
