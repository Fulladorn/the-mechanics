// Rebindable action set. One physical key (KeyboardEvent.code) per action; the
// input layer reverse-maps code -> action so keys can be remapped at runtime.

export type Action =
  | 'fwd'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'sprint'
  | 'interact'
  | 'drop'
  | 'pause'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6';

export const DEFAULT_BINDS: Record<Action, string> = {
  fwd: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  crouch: 'ControlLeft',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  drop: 'KeyG',
  pause: 'Escape',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
  slot5: 'Digit5',
  slot6: 'Digit6',
};

export const ACTION_LABELS: Record<Action, string> = {
  fwd: 'Move Forward',
  back: 'Move Back',
  left: 'Strafe Left',
  right: 'Strafe Right',
  jump: 'Jump',
  crouch: 'Crouch',
  sprint: 'Sprint',
  interact: 'Interact / Pick up',
  drop: 'Drop carried',
  pause: 'Pause',
  slot1: 'Toolbelt 1',
  slot2: 'Toolbelt 2',
  slot3: 'Toolbelt 3',
  slot4: 'Toolbelt 4',
  slot5: 'Toolbelt 5',
  slot6: 'Toolbelt 6',
};

const SPECIAL: Record<string, string> = {
  Space: 'Space',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: 'Tab',
  Enter: 'Enter',
};

/** Pretty label for a KeyboardEvent.code (for the rebinding UI / legend). */
export function bindLabel(code: string): string {
  if (!code) return '—';
  if (SPECIAL[code]) return SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
