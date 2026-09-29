import type { Vec3 } from '../shared/math';
import type { ItemKind } from './items';

// Everything the sim tells the client about. The client turns these into
// sound, particles, camera kicks, HUD stamps and Dispatch lines; the sim never
// knows how they are presented.

export type SimEvent =
  | { t: 'pickup'; item: number; kind: ItemKind; heavy: boolean }
  | { t: 'drop'; item: number; kind: ItemKind; thrown: boolean }
  | { t: 'belt'; item: number; kind: ItemKind; slot: number }
  | { t: 'pocket'; kind: ItemKind; tag?: string }
  | { t: 'boltLoose'; machine: string; bolt: string; pos: Vec3 }
  | { t: 'boltTight'; machine: string; bolt: string; pos: Vec3 }
  | { t: 'boltSlip'; machine: string; bolt: string; pos: Vec3 }
  | { t: 'boltBand'; machine: string; bolt: string }
  | { t: 'partOff'; machine: string; slot: string; item: number; pos: Vec3 }
  | { t: 'partOn'; machine: string; slot: string; item: number; pos: Vec3 }
  | { t: 'cover'; machine: string; cover: string; open: boolean; pos: Vec3 }
  | { t: 'terminal'; machine: string; which: 'pos' | 'neg'; on: boolean; pos: Vec3 }
  | { t: 'zap'; pos: Vec3 }
  | { t: 'jack'; machine: string; state: 'placed' | 'raised' | 'lowered' | 'taken'; pos: Vec3 }
  | { t: 'fluidFull'; machine: string; fluid: string }
  | { t: 'leak'; machine: string; fluid: string; pos: Vec3 }
  | { t: 'inspected'; machine: string }
  | { t: 'systemGo'; machine: string; system: string; label: string }
  | { t: 'allGo'; machine: string }
  | { t: 'panelOpen'; machine: string; panel: string }
  | { t: 'panelSolved'; machine: string; panel: string }
  | { t: 'panelClose' }
  | { t: 'enter'; vehicle: string }
  | { t: 'exit'; vehicle: string }
  | { t: 'crank'; vehicle: string; ok: boolean }
  | { t: 'impact'; vehicle: string; severity: number; pos: Vec3 }
  | { t: 'horn'; vehicle: string }
  | { t: 'land'; speed: number; surface: string }
  | { t: 'jump' }
  | { t: 'damage'; amount: number; cause: string }
  | { t: 'healed'; amount: number }
  | { t: 'flare'; pos: Vec3 }
  | { t: 'swing'; hit: boolean }
  | { t: 'wolf'; kind: 'notice' | 'telegraph' | 'lunge' | 'hit' | 'hurt' | 'died' | 'flee' | 'howl'; id: number; pos: Vec3 }
  | { t: 'say'; line: string; who?: string; priority?: number }
  | { t: 'objective'; id: string; text: string }
  | { t: 'objectiveDone'; id: string }
  | { t: 'stamp'; text: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }
  | { t: 'toast'; text: string }
  | { t: 'flag'; name: string }
  | { t: 'lore'; id: string; title: string }
  | { t: 'door'; id: string; open: boolean; pos: Vec3 }
  | { t: 'sfx'; name: string; pos?: Vec3; vol?: number }
  | { t: 'shake'; amount: number }
  | { t: 'cinematic'; id: string }
  | { t: 'checkpoint'; id: string }
  | { t: 'win' }
  | { t: 'fail'; reason: FailReason };

export type FailReason = 'downed' | 'vehicleLost' | 'wrecked' | 'cold';
