import type * as THREE from 'three';
import type { World } from '../../sim/world';
import type { Settings } from '../settings';

// Audio façade used by the game session. The full mixer (samples, engine,
// ambience, music, radio voice) implements this interface.

export interface Audio {
  play(name: string, pos?: { x: number; y: number; z: number }, vol?: number): void;
  foot(surface: string, speed: number): void;
  engine(vehicle: string, on: boolean): void;
  voice(line: string, who: string): void;
  frame(dt: number, w: World, cam: THREE.Camera): void;
  applySettings(s: Settings): void;
  resume(): void;
  stopAll(): void;
}
