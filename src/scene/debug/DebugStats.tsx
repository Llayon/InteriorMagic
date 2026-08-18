import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { setRenderMetrics } from './debugMetrics';

export function DebugStatsBridge() {
  const windowStart = useRef(performance.now());
  const previousFrame = useRef(windowStart.current);
  const accumulatedFrameTime = useRef(0);
  const frameCount = useRef(0);
  useFrame(({ gl }) => {
    const now = performance.now();
    frameCount.current += 1;
    accumulatedFrameTime.current += now - previousFrame.current;
    previousFrame.current = now;
    const elapsed = now - windowStart.current;
    if (elapsed < 250) return;
    setRenderMetrics({
      fps: frameCount.current * 1000 / elapsed,
      frameTime: accumulatedFrameTime.current / frameCount.current,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      dpr: gl.getPixelRatio(),
      sampledAt: now,
    });
    frameCount.current = 0;
    accumulatedFrameTime.current = 0;
    windowStart.current = now;
  });
  return null;
}
