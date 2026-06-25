# Copilot instructions for The Mechanics

This file provides concise, repository-specific guidance for future Copilot sessions so suggestions and automated changes are effective and safe.

---

## 1) Quick commands

- Install: `npm ci` (CI) or `npm install` (local)
- Dev: `npm run dev` (Vite dev server + watched server per README)
- Build: `npm run build`
- Typecheck: `npm run typecheck` (tsc --noEmit)
- Test (full): `npm test` (runs `vitest run`)
- Test (watch): `npm run test:watch` (interactive vitest)
- Headless screenshot smoke: `npm run shot` (tools/shot.mjs)

Run a single test file or pattern:
- By path: `npm test -- test/path/to/file.spec.ts`
- By name/pattern: `npm test -- -t "pattern"` or `npx vitest -t "pattern"`

CI (what the workflow runs):
- `npm ci && npm run typecheck && npm test && npm run build`

---

## 2) High-level architecture (what matters to Copilot)

- Single deterministic sim core: `src/sim/` is the authoritative, DOM-free game logic. It is the single source of truth and is imported by client, server, and headless runners.
- Shared schema/types: `src/shared/` contains wire protocol types, constants, and seeded math used everywhere. Avoid duplicating shapes.
- Client: `src/client/` holds renderer, input→intent, prediction, interpolation, UI and audio. Client runs the sim locally for prediction and rendering.
- Server: `src/server/` runs authoritative sessions (`session.ts`) stepping the sim at a fixed tick rate (30 Hz) and broadcasting snapshots.
- Headless: `headless/env_server.ts` runs missions without a renderer for CI, soak tests, and scripted playthroughs.
- Test harness: vitest unit tests in `test/` and Puppeteer-based visual tours in `tools/` (visual_tour.mjs, mp_browser.mjs).

Key files & APIs Copilot may reference:
- `src/sim/index.ts` exports `createWorld(seed, levelDef)`, `step(dt, intents)`, `snapshot()` etc.
- `src/sim/` modules: `world.ts`, `physics.ts`, `movement.ts`, `vehicle.ts`, `puzzles/`.

See `docs/TECH_ARCHITECTURE.md` and README for deeper context.

---

## 3) Key conventions and repository rules (must-follow)

- Determinism-first: Any change to `src/sim/` must preserve determinism. The sim must produce identical snapshots given the same seed + intent log.
  - Do NOT use `Date.now()` or `Math.random()` inside `src/sim/` or other determinism-sensitive modules. Use the injected clock and the seeded RNG in `src/shared/`.
  - Maintain stable iteration orders (avoid relying on `Map`/`Set` insertion order for floats), use arrays or sorted structures where required.
- Sim is DOM-free and dependency-light: `src/sim/` must not import Three.js, browser DOM, or Node-only APIs. Keep it portable for client/server/headless hosts.
- Shared types: Put protocol and wire types in `src/shared/` so client/server/headless agree on serialization.
- Physics: Rapier WASM is used via the sim wrapper. Determinism depends on using the same Rapier build and fixed-step ordering — avoid altering step order or body insertion order without re-verifying determinism.
- Tests: Unit tests (vitest) cover sim logic and determinism; headless envs and Puppeteer tours provide E2E proofs. When making sim changes, update/extend determinism tests and run the headless mission smoke where appropriate.
- Snapshots & hash tests: The codebase includes tests that assert identical snapshot hashes for identical seeds+intents — preserve any fields used in hashing or update tests accordingly if intentional.

---

## 4) Where to look first for context

- `README.md` — quick start and scripts
- `docs/TECH_ARCHITECTURE.md` — design decisions, sim structure, determinism rules (authoritative)
- `src/sim/`, `src/shared/`, `src/client/`, `src/server/` — the primary places to read before proposing changes
- `headless/env_server.ts`, `tools/visual_tour.mjs`, `tools/mp_browser.mjs` — how CI verifies behavior

---

## 5) Safety hints for automated edits

- When modifying `src/sim/`, add/update a determinism test and run `npm test` locally (and the headless smoke if available).
- If changing wire formats (types in `src/shared/`), bump serialization compatibility and update both client and server usages in the same PR.
- Avoid adding heavy native or platform-specific toolchains that would break CI's `npm ci` + `npm run typecheck` + `npm test` pipeline.

---

(Generated from README.md, docs/TECH_ARCHITECTURE.md and the repository package.json + CI workflow.)
