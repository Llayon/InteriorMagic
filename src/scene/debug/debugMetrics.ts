export interface RenderMetrics {
  fps: number;
  frameTime: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  dpr: number;
  sampledAt: number;
}

let current: RenderMetrics = { fps: 0, frameTime: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, dpr: 1, sampledAt: 0 };
export const getRenderMetrics = () => current;
export const setRenderMetrics = (metrics: RenderMetrics) => { current = metrics; };
