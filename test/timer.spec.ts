import { describe, it, expect, afterEach } from 'vitest';
import { formatTime, recordBest } from '../src/shared/timer';

describe('timer', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('formats mm:ss.s', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(5)).toBe('0:05.0');
    expect(formatTime(75.4)).toBe('1:15.4');
  });

  it('records and keeps the faster time', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    expect(recordBest('lvl', 30).isNew).toBe(true);
    expect(recordBest('lvl', 40).isNew).toBe(false);
    expect(recordBest('lvl', 40).best).toBe(30);
    expect(recordBest('lvl', 20)).toEqual({ best: 20, isNew: true });
  });
});
