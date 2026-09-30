import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings } from '../src/client/settings';

// Crouch used to default to Left Ctrl, and Ctrl+W (crouch-walk) closes the tab.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
};
const save = (o: unknown) => store.set('mech.settings.v2', JSON.stringify(o));

describe('settings migration', () => {
  afterEach(() => store.clear());
  it('fresh install crouches on C', () => {
    expect(loadSettings().controls.binds.crouch).toBe('KeyC');
  });
  it('moves an old default Ctrl crouch to C', () => {
    save({ controls: { binds: { crouch: 'ControlLeft' } } });
    expect(loadSettings().controls.binds.crouch).toBe('KeyC');
  });
  it('keeps Ctrl if the player chose it after the change', () => {
    save({ rev: 3, controls: { binds: { crouch: 'ControlLeft' } } });
    expect(loadSettings().controls.binds.crouch).toBe('ControlLeft');
  });
  it('does not steal C from another action', () => {
    save({ controls: { binds: { crouch: 'ControlLeft', camera: 'KeyC' } } });
    expect(loadSettings().controls.binds.crouch).toBe('ControlLeft');
  });
});
