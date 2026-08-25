import { readFile } from 'node:fs/promises';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiply = (a, b) => {
  const result = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
      }
    }
  }
  return result;
};

const fromTrs = (node) => {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
};

const transformPoint = (matrix, [x, y, z]) => [
  matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
  matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
  matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
];

const extend = (bounds, point) => {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
};

export const parseGlb = (buffer) => {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a GLB file');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('Only GLB v2 is supported');
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error('GLB length header is invalid');
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new Error('Truncated GLB chunk');
    chunks.push({ type, data });
    offset += 8 + length;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
  if (!jsonChunk) throw new Error('GLB JSON chunk is missing');
  const json = JSON.parse(jsonChunk.data.toString('utf8').replace(/[\u0000 ]+$/u, ''));
  return { json, chunks };
};

export const encodeGlb = (json, chunks) => {
  const rawJson = Buffer.from(JSON.stringify(json), 'utf8');
  const padding = (4 - (rawJson.length % 4)) % 4;
  const jsonData = Buffer.concat([rawJson, Buffer.alloc(padding, 0x20)]);
  const outputChunks = [{ type: JSON_CHUNK, data: jsonData }, ...chunks.filter((chunk) => chunk.type !== JSON_CHUNK)];
  const totalLength = 12 + outputChunks.reduce((total, chunk) => total + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of outputChunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
};

export const measureGlbJson = (json) => {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let primitiveCount = 0;
  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) throw new Error(`Missing GLB node ${nodeIndex}`);
    const world = multiply(parentMatrix, fromTrs(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      if (!mesh) throw new Error(`Missing GLB mesh ${node.mesh}`);
      for (const primitive of mesh.primitives ?? []) {
        const positionIndex = primitive.attributes?.POSITION;
        const accessor = positionIndex === undefined ? null : json.accessors?.[positionIndex];
        if (!accessor?.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) {
          throw new Error(`POSITION accessor ${String(positionIndex)} has no finite min/max`);
        }
        primitiveCount += 1;
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) extend(bounds, transformPoint(world, [x, y, z]));
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene) throw new Error('Default GLB scene is missing');
  for (const nodeIndex of scene.nodes ?? []) visit(nodeIndex, identity());
  const values = [...bounds.min, ...bounds.max];
  if (!primitiveCount || values.some((value) => !Number.isFinite(value))) throw new Error('GLB has no finite geometry');
  const size = bounds.max.map((value, axis) => value - bounds.min[axis]);
  if (size.some((value) => value <= 0)) throw new Error('GLB geometry has a zero or negative dimension');
  return {
    min: bounds.min,
    max: bounds.max,
    size,
    center: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2),
    primitiveCount,
  };
};

export const measureGlbFile = async (file) => measureGlbJson(parseGlb(await readFile(file)).json);
