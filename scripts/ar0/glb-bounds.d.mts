export interface GlbBounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
  primitiveCount: number;
}
export function measureGlbFile(file: string): Promise<GlbBounds>;
