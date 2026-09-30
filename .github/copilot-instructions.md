# Copilot instructions: The Mechanics

**Read [AGENTS.md](../AGENTS.md) at the repo root first.** It's the single
source for commands, the directory map, project rules and the checks to run
before pushing. What follows is the short version.

## What this is
- A single-player, first-person repair game in the browser.
- TypeScript + Vite + three.js + Rapier (WASM).
- **No server and no netcode.** Static build, deployed to GitHub Pages from
  `main`.
- Two levels: `depot` (the tutorial) and `ridge` (Level 1).

## Commands
- `npm run dev` starts http://localhost:5173. Add `?level=depot|ridge` to skip
  the menus, and `?q=low|med|high` to set quality.
- `npm run typecheck`, `npm test` (vitest, node env, `test/**/*.spec.ts`) and
  `npm run build` are what CI runs.
- The browser tools are slow and not in CI. Run them for gameplay, render
  and HUD changes:
  - `node tools/targetcheck.mjs`
  - `node tools/walkthrough.mjs <level>`
  - `npm run playtest`

## Rules
1. `src/sim/` and `src/content/` never import the DOM, three.js or
   `src/client/`. No `Math.random` / `Date.now` in the sim: use `makeRng`.
2. What's drawn is what's clickable. The sim and renderer share poses
   (`Machine.hubPose`, `slotPoint`, `boltPos`).
3. Every repair `Step` and level `BeatDef` names its targets, has a
   waypoint, and shows its progress. `test/guidance.spec.ts` must still pass.
4. Playtest problems are fixed **by class**
   ([docs/gameplay-issues.md](../docs/gameplay-issues.md)), never by removing
   depth.
5. No default key binding may collide with a browser shortcut (no Ctrl).
   Changing a default means bumping `SETTINGS_REV` and adding a migration.
6. Tests are `*.spec.ts`; `*.test.ts` files don't run.

## Where things are
- **Game rules:** `src/sim/world.ts` (World), `machine.ts` (repair model),
  `interact.ts` (focus).
- **Levels:** `src/content/levels/*.ts` (`LevelDef` / `BeatDef` in
  `types.ts`, registered in `index.ts`).
- **Rendering:** `src/client/render/` (`view.ts`, `stylized.ts`, models in
  `vehicles/` and `kit/`, registered in `kit/registry.ts`).
- **HUD:** `src/client/ui/hud.ts` + `index.html`.
- **Architecture:** [docs/TECH_ARCHITECTURE.md](../docs/TECH_ARCHITECTURE.md).
