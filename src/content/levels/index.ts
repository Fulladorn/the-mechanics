import type { LevelDef } from './types';
import { makeSandbox } from './sandbox';
import { makeDepot } from './depot';

export const LEVELS: Record<string, () => LevelDef> = {
  sandbox: makeSandbox,
  depot: makeDepot,
};
