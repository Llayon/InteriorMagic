import { createContext, useContext } from 'react';

export const CameraGateContext = createContext<(enabled: boolean) => void>(() => undefined);
export const useCameraGate = () => useContext(CameraGateContext);
