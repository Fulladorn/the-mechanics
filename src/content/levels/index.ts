import type { LevelDef } from './types';
import { makeSandbox } from './sandbox';

export const LEVELS: Record<string, () => LevelDef> = {
  sandbox: makeSandbox,
};
