// Rebindable action set. One physical key (KeyboardEvent.code, or MouseN) per
// action; the input layer reverse-maps code -> action at runtime.

export type Action =
  | 'fwd'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'sprint'
  | 'interact'
  | 'use'
  | 'block'
  | 'drop'
  | 'flashlight'
  | 'jobsheet'
  | 'camera'
  | 'lights'
  | 'horn'
  | 'unflip'
  | 'pause'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4';

export const DEFAULT_BINDS: Record<Action, string> = {
  fwd: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  // Not Ctrl: Ctrl+W (crouch-walk) closes the browser tab, and pages can't stop it.
  crouch: 'KeyC',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  use: 'Mouse0',
  block: 'Mouse2',
  drop: 'KeyG',
  flashlight: 'KeyF',
  jobsheet: 'Tab',
  camera: 'KeyV',
  lights: 'KeyL',
  horn: 'KeyH',
  unflip: 'KeyR',
  pause: 'Escape',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
};

export const ACTION_LABELS: Record<Action, string> = {
  fwd: 'Move forward / Accelerate',
  back: 'Move back / Brake',
  left: 'Strafe left / Steer left',
  right: 'Strafe right / Steer right',
  jump: 'Jump / Handbrake',
  crouch: 'Crouch',
  sprint: 'Sprint',
  interact: 'Interact (tap or hold)',
  use: 'Use tool (hold on bolts)',
  block: 'Block',
  drop: 'Drop (hold to throw)',
  flashlight: 'Flashlight',
  jobsheet: 'Job sheet',
  camera: 'Vehicle camera',
  lights: 'Headlights',
  horn: 'Horn',
  unflip: 'Flip vehicle upright',
  pause: 'Pause',
  slot1: 'Toolbelt 1',
  slot2: 'Toolbelt 2',
  slot3: 'Toolbelt 3',
  slot4: 'Toolbelt 4',
};

const SPECIAL: Record<string, string> = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Space: 'Space',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  AltLeft: 'Alt',
  AltRight: 'R-Alt',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: 'Tab',
  Enter: 'Enter',
};

/** Pretty label for a KeyboardEvent.code (for the rebinding UI / prompts). */
export function bindLabel(code: string): string {
  if (!code) return '—';
  if (SPECIAL[code]) return SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
