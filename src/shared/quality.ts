export type QualityProfile='low'|'medium'|'high';
export const detectQuality=():QualityProfile=>{const memory=(navigator as Navigator & {deviceMemory?:number}).deviceMemory??4;return memory<=2?'low':memory<=6?'medium':'high'};
export const QUALITY={low:{dpr:1},medium:{dpr:1.25},high:{dpr:1.5}} as const;
export const qualityProfile=detectQuality();
