// scripts/k1-glb-runtime.mjs
//
// K1 — minimal Node.js runtime shim for GLB parsing + (re-)export.
//
// `three`'s GLTFLoader + GLTFExporter are browser-targeted and use the
// browser-only globals `self`, `Blob`, `FileReader`, `URL.createObjectURL`,
// `URL.revokeObjectURL`, and `Image` (for texture loading). This module
// installs minimal Node-compatible stand-ins BEFORE the three modules load:
//
//   * `self` → `globalThis`.
//   * `Blob` → native `node:buffer` Blob.
//   * `URL.createObjectURL` → returns the blob itself (so the GLTFLoader's
//     `URL.createObjectURL(blob)` doesn't throw).
//   * `URL.revokeObjectURL` → no-op.
//   * `FileReader` → tiny polyfill that wraps `Blob.arrayBuffer()` via
//     `onloadend`.
//   * `Image` → minimal polyfill that fires `load` immediately on construction
//     (no actual image data; texture loads return a 1x1 transparent Image).
//     This unblocks GLTFLoader's texture-load path without crashing.
//   * `HTMLImageElement` → alias for Image.
//
// This is the standard "browser-globals-as-Node-globals" pattern used across
// countless Three.js Node-side tools (three-glTF-loader, gltf-pipeline,
// glb-mesh-merge, etc.).
//
// IMPORTANT: texture data is NOT actually rendered when the Image polyfill
// fires `load` immediately. For VISUAL rendering (the Playwright viewer),
// real textures still load (the viewer runs in Chromium where Image is real).
// For Node-side measurement (Box3 of vertices only), texture visuals don't
// matter — Box3 depends only on vertex positions, not on texture pixels.
//
// This is NOT a manual GLB chunk-writer fallback (Plan guardrail A23 / v3 #6).
// We never re-author binary chunk content; we only install polyfills for the
// browser APIs that three's loader needs to find its way around Node.

import { Blob as NodeBlob } from 'node:buffer';

if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = NodeBlob;
}

// URL.createObjectURL — return the blob directly. Consumers like GLTFLoader
// pass this URL to `Image.src = url`. In Node, Image is also polyfilled
// below and ignores the URL entirely.
if (typeof globalThis.URL === 'undefined') {
  globalThis.URL = class URL {};
}
if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = (blob) => blob;
}
if (typeof globalThis.URL.revokeObjectURL !== 'function') {
  globalThis.URL.revokeObjectURL = () => {};
}

if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    constructor() {
      this.readyState = 0;
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer()).then(
        (buf) => {
          this.result = buf;
          this.readyState = 2;
          if (this.onloadend) this.onloadend();
        },
        (err) => {
          if (this.onerror) this.onerror(err);
        },
      );
    }
  }
  globalThis.FileReader = NodeFileReader;
}

// Image polyfill. GLTFLoader's loadTextureImage creates `new Image()` and
// sets `.src = blobURL` then awaits `onload`. In Node there is no DOM, no
// actual image loading. We fire `load` immediately with a 1x1 transparent
// Image so the texture-load promise resolves successfully and the parser
// continues with texture.image = null (which GLTFExporter then embeds as a
// default material — fine for our purposes since we use direct GLB chunk
// rewriting, not GLTFExporter, for canonical output).
class NodeImage {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.src = '';
    this.onload = null;
    this.onerror = null;
    this.complete = false;
    this.naturalWidth = 1;
    this.naturalHeight = 1;
  }
  set src(value) {
    this._src = value;
    // Fire load asynchronously to mimic browser behavior
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
  get src() {
    return this._src ?? '';
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = NodeImage;
  globalThis.HTMLImageElement = NodeImage;
}

export const installNodeCompat = () => {
  // Idempotent — module top-level runs on import.
};
