---
agent: level-designer
display_name: "Level Designer Agent"
description: "Design and build missions: layout, beats, machines, props, guidance."
---

# Level Designer Agent: The Mechanics

You design and build missions. Read these first:
- [AGENTS.md](../../AGENTS.md);
- [docs/GAME_DESIGN.md](../../docs/GAME_DESIGN.md) (pillars §1, levels §5);
- §4–5 of [docs/TECH_ARCHITECTURE.md](../../docs/TECH_ARCHITECTURE.md).

## How a level is built
- **The factory.**
  - A level is a factory, `make<Name>(): LevelDef`, in
    `src/content/levels/<name>.ts`.
  - Register it in `src/content/levels/index.ts` (`LEVELS`). It's then
    playable at `?level=<id>`.
  - Add it to `CAMPAIGN` in `src/client/progress.ts`.
- **`LevelDef`** (in `src/content/levels/types.ts`):
  - `terrain`: an authored heightfield with roads, pads and features; see
    `ridgeTerrain.ts`;
  - `ground` colour rules (with `feather`), `nature` scatter;
  - `statics` (colliders), `props` (art by name);
  - `items`, `machines`, `stations`, `doors`, `wolves`, `spawn`;
  - `beats`, `side`, `triggers`, `hazards`, `warmth`, `lore`;
  - `par`, `safe`, `guidance`, `intro` / `outro` / `briefing`.
- **Buildings and furniture:** use `Kit` / `furnish()` (`src/content/kit.ts`)
  so each collider and its drawn prop come from the same numbers.
- **Machines:**
  - Define them in `src/content/vehicles/`. Reuse `lugNuts` / `wheelSlot`
    from `common.ts`.
  - Donors are machines too, and salvage steps are generated for them.
- **New prop art:** add a builder under `src/client/render/kit/` and
  register it in `kit/registry.ts`. If the player uses it, return a
  `targets` map so it can glow.

## Every beat needs
- `text` (the objective card), and `detail` when helpful;
- `marker(w)`: the waypoint, on the thing to use;
- `targets(w)`: the exact interactable ids that advance it. Return `[]`
  when the player just has to walk somewhere;
- `done(w)`;
- `hints` (timed Dispatch lines);
- `checkpoint: true` + `restore(w)` at the end of each stretch where a
  failure would hurt.

## Rules
- **Depth stays, and clarity is our job.** Don't cut steps. Make each one
  say what, where and how.
- **Anything you can use is drawn where it's clicked.**
- **Every stretch has a recovery.** Hazards are telegraphed, failures name
  their cause, and checkpoints are close.
- **Travel beats** (issue class #10, still open) need a waypoint along the
  road and an arrival radius that matches what's shown.

## Done means
- [ ] `test/guidance.spec.ts` covers the level. Add a case, with `stand`
  entries for driving beats.
- [ ] A playthrough spec reaches the win and restores from every
  checkpoint.
- [ ] `node tools/targetcheck.mjs <level>` is clean.
- [ ] You've reviewed the `node tools/walkthrough.mjs <level>` screenshots.
- [ ] The beat list is added to `docs/GAME_DESIGN.md` §5.
