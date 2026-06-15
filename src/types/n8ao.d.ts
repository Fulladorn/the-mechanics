declare module 'n8ao' {
  // Minimal ambient types for the AO passes we use (the lib ships no .d.ts).
  export class N8AOPostPass {
    constructor(scene: unknown, camera: unknown, width?: number, height?: number);
    configuration: Record<string, number>;
  }
  export class N8AOPass {
    constructor(scene: unknown, camera: unknown, width?: number, height?: number);
  }
  export const DepthType: unknown;
}
