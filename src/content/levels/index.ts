import type { LevelDef } from './types';
import { makeSandbox } from './sandbox';
import { makeDepot } from './depot';
import { makeRidge } from './ridge';

export const LEVELS: Record<string, () => LevelDef> = {
  sandbox: makeSandbox,
  depot: makeDepot,
  ridge: makeRidge,
};
