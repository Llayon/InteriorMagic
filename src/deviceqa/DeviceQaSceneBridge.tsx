import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { deviceQa } from './deviceQa';

/** Mounted only when device QA is enabled. Bridges real rendered frames into
 *  the pacing recorder (useFrame fires only when R3F actually renders, which
 *  is exactly what demand-frame pacing must measure) and observes WebGL
 *  context loss WITHOUT preventDefault or any recovery behavior. */
export function DeviceQaSceneBridge() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    deviceQa.registerRenderer(gl);
    const canvas = gl.domElement;
    const onContextLost = () => deviceQa.record('webglcontextlost');
    const onContextRestored = () => deviceQa.record('webglcontextrestored');
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    return () => {
      deviceQa.registerRenderer(null);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
    };
  }, [gl]);
  useFrame(() => deviceQa.observeFrame(performance.now()));
  return null;
}