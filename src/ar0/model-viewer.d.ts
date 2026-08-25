import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        'ios-src'?: string;
        poster?: string;
        ar?: boolean;
        'ar-modes'?: string;
        'ar-scale'?: 'auto' | 'fixed';
        'ar-placement'?: 'floor' | 'wall';
        'camera-controls'?: boolean;
        'shadow-intensity'?: string;
        exposure?: string;
      };
    }
  }
}

export {};
