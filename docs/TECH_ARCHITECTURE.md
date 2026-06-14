# The Mechanics — Technical Architecture

**Version:** 1.0 (planning)
**Companion docs:** [`GAME_DESIGN.md`](GAME_DESIGN.md) (what) · [`ROADMAP.md`](ROADMAP.md) (build order)

---

## 1. Guiding principles

1. **One deterministic sim, three hosts.** A single DOM-free `src/sim/` core is
   the source of truth. It runs identically on the **client** (prediction +
   offline), the **server** (authority), and **headless** (tests/CI/automation).
   This is the single most important architectural decision — it's what made the
   reference project (`world-of-claudecraft`) tractable to build *and* verify, and
   it's what keeps co-op fair and debuggable.
2. **Server-authoritative.** The server simulates; clients send **input intent**
   and render **snapshots**. No client is trusted with game state. Small player
   counts (1–4, up to 8) make full authority cheap.
3. **Web-native, zero-install.** TypeScript + Vite + Three.js. Players click a
   URL. Streamers share a link and a join code. No launchers.
4. **Procedural-first content, data-driven levels.** Build art in code; describe
   levels as data. Fewer binary assets = faster iteration + smaller repo.
5. **Verifiable by construction.** Determinism + headless sim + screenshot tours
   mean an agent (or human) can change code and *prove* it still works.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language across sim/client/server; safety |
| Client build | **Vite** (dev :5173, hot reload) | Fast HMR; `esbuild` prod bundles |
| Rendering | **Three.js** (WebGL2) | Proven web 3D; matches reference |
| Post-FX | **postprocessing** + **n8ao** | Cheap AO + bloom for the cartoony pop |
| **Physics** | **Rapier3D** (`@dimforge/rapier3d-compat`, WASM) | Fast, **deterministic** (fixed-step, same build), rigid bodies + character controller + vehicle. The key addition over the reference, which had no physics. |
| Server | **Node.js** (bundled to CJS via esbuild) | Same lang; runs Rapier WASM headless |
| Transport (state) | **`ws`** WebSockets | Low-latency binary snapshots; reference-proven |
| Transport (voice) | **WebRTC** (mesh, ≤8) | P2P spatial voice; server only signals |
| Persistence | **Postgres 16** (JSONB), `pg` | Profiles/unlocks; reference-proven. Dev fallback: SQLite/JSON behind a `Store` iface |
| Profanity | **`obscenity`** | Name/chat filtering |
| Asset pipeline | **`@gltf-transform/cli`** | Optimize curated glTF hero props/HDRIs |
| Unit tests | **vitest** | Sim logic, puzzles, vehicle FSM, movement |
| E2E / tours | **puppeteer-core** | Headless multi-client + screenshot diffs |
| Orchestration | **Docker + Compose** | client + server + postgres, one command |

**Why Rapier over cannon-es/ammo:** Rust→WASM performance, an actively
maintained API, a built-in **kinematic character controller** and **raycast
vehicle**, and — critically — **cross-platform determinism** when every host runs
the *same* WASM build with a *fixed* timestep and the *same* operation order.
That determinism is what lets client prediction reconcile cleanly against the
server and what makes headless tests meaningful.

---

## 3. System architecture

```
                         ┌──────────────────────────────────────┐
                         │        src/shared/  (pure TS)         │
                         │  protocol msgs · types · constants ·  │
                         │  fixed-point/seeded math · ids        │
                         └───────────────┬──────────────────────┘
                                         │ imported by all
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌───────────────┐               ┌───────────────────┐             ┌──────────────────┐
│  src/client/  │   WebSocket   │    src/server/    │   pg        │   Postgres 16    │
│               │  intent ▲     │                   │────────────▶│  profiles JSONB  │
│ Three.js view │  ───────┼──── │ lobby + sessions  │             └──────────────────┘
│ input→intent  │  snapshot▼    │ authoritative loop│
│ prediction    │◀───────────── │  (fixed 30 Hz)    │
│ interpolation │   WebRTC      │                   │
│ UI/HUD/puzzle │  signaling    │  ┌──────────────┐ │
│ audio + voice │◀────────────▶ │  │  src/sim/    │ │   ← SAME module runs here
└──────┬────────┘  (P2P voice   └──┤ deterministic├─┘     and inside the client
       │            mesh, peers)    │ + Rapier WASM│
       │                            └──────┬───────┘
       └── runs the SAME src/sim/ ─────────┘
           for offline + prediction         ▲
                                            │ also invoked by
                                   ┌────────┴─────────┐
                                   │   headless/      │  tests · CI · automation
                                   │  env_server.ts   │  (no renderer, no sockets)
                                   └──────────────────┘
```

### 3.1 `src/shared/`
Pure, dependency-light TypeScript imported everywhere: wire **protocol** message
types + (de)serializers, shared **enums/types** (item ids, system ids, level ids),
**constants** (tick rate, speeds, tolerances), **seeded RNG** and any fixed-point
math helpers. No Three.js, no `ws`, no Node APIs.

### 3.2 `src/sim/` — the deterministic core
The whole game *as logic*, with **no DOM and no rendering**. Given an initial
**seed + level definition** and a stream of per-tick **player intents**, it
advances world state by a **fixed timestep** and produces **snapshots**. Same
inputs ⇒ same outputs, everywhere.

Modules:
- `world.ts` — `World` aggregate: entities, players, items, vehicle, hazards, RNG,
  `step(dtFixed, intents)`.
- `physics.ts` — Rapier wrapper: world creation, fixed-step, body/collider
  registry, deterministic insertion order, character controller, raycast vehicle.
- `movement.ts` — kinematic FP controller incl. **bunny-hop/crouch-jump** model
  (acceleration, air control, speed cap, biome modifiers) + stamina.
- `interaction.ts` — raycast “what am I looking at”, pickup/drop/throw, install.
- `inventory.ts` — 6-slot toolbelt + carried heavy-part state.
- `vehicle.ts` — **assembly FSM** (systems `MISSING|BROKEN|GO`, `critical` set →
  drivable) + driving dynamics + integrity/damage.
- `puzzles/` — pure logic + seeding + win-check for each interface puzzle
  (wire-match, bolt-torque, fuse-grid, valve-balance, alignment, fuel-mix).
- `hazards.ts` — survival meters (HP/stamina/exposure: cold/breath/oxygen),
  whirlpool pull, vacuum.
- `combat.ts` — enemy AI (telegraph/dodge/block/strike), down/revive timer.
- `events.ts` — domain events emitted for the client to turn into VFX/SFX/UI
  (e.g. `SystemRepaired`, `PlayerDowned`, `PartPickedUp`) — keeps the sim mute but
  expressive.
- `index.ts` — public API: `createWorld(seed, levelDef)`, `step()`,
  `snapshot()`, `applyCommand()`.

**Determinism rules (enforced by lint/review):** no `Date.now()`/`Math.random()`
in sim (use injected clock + seeded RNG); fixed iteration order over entities
(arrays/sorted maps, never `Set`/`Map` insertion-dependent iteration of floats);
fixed timestep accumulator; all randomness seeded from world seed; Rapier stepped
at the fixed dt with stable body ordering.

### 3.3 `src/client/`
- `render/` — Three.js scene, `models.ts` (code rigs), `props.ts`, `textures.ts`
  (procedural), `effects.ts` (post-FX), vehicle/biome scene builders.
- `input/` — pointer-lock mouse + keybinds → **intent** (not state).
- `net/` — `ws` client, **prediction** (run local intent through `sim` immediately),
  **reconciliation** (replay unacked intents against server snapshot),
  **interpolation/extrapolation** for remote players & dynamic bodies.
- `ui/` — HUD, menus, lobby, **puzzle panels** (DOM/Canvas overlay), results.
- `audio/` — positional SFX, music director, VO playback (+ Moon degrade filter).
- `voice/` — WebRTC mesh; gain per peer driven by **sim distance** (proximity).
- `main.ts` — boot, fixed world seed per mission, offline vs online switch.

The client can run the sim **standalone** (offline/solo) — online mode just adds
the server as the authority and the network as the transport.

### 3.4 `src/server/`
- `index.ts` — HTTP (REST: auth, lobby create/join, profile) + `ws` upgrade.
- `lobby.ts` — lobbies keyed by **join code**; party membership; level select
  (unlocked only); ready/start.
- `session.ts` — one **authoritative game** per active mission: owns a `sim`
  `World`, accumulates intents, **steps at fixed 30 Hz**, broadcasts snapshots.
- `snapshot.ts` — snapshot assembly + **delta/quantization** (small player counts
  → no interest management needed; whole-world deltas are fine).
- `persistence/` — `Store` interface; `PgStore` (Postgres JSONB) + `MemoryStore`/
  `JsonFileStore` for local dev. Saves **profile/unlocks** only (no mid-mission).
- auth: scrypt-hashed passwords + bearer tokens (guests allowed; account optional
  for cross-session unlocks).

### 3.5 `headless/`
`env_server.ts` runs missions with **no renderer and no sockets** — drive the sim
with scripted/random intents for tests, balance sweeps, soak tests, and (à la
reference) a possible RL-style env later. `npm run env` / `npm run bench`.

---

## 4. Netcode model

- **Tick:** fixed **30 Hz** server authority (33.3 ms). Client samples input each
  frame, sends compact **intent** packets ~30 Hz.
- **Intent, not state:** `{seq, dtTicks, move:{x,y}, look:{yaw,pitch}, buttons:bitmask, action?}`.
- **Prediction:** client applies its own intent to its local `sim` immediately for
  zero-latency feel.
- **Reconciliation:** each snapshot carries the last-acked input `seq`; client
  rewinds local player to authoritative state and **replays** unacked intents.
- **Remote entities:** **interpolated** between snapshots (≈100 ms buffer);
  dynamic physics props interpolated, with short extrapolation on packet loss.
- **Snapshots:** authoritative entity transforms + game state, **quantized**
  (pos/quat compressed) and **delta-encoded** vs the client's last ack.
- **Why this is enough:** co-op vs PvE at ≤8 players is tiny; we trade bandwidth
  for simplicity (full-world deltas, no AoI culling in v1).
- **Determinism payoff:** because client and server run the *same* `sim`,
  prediction/reconciliation rarely visibly corrects — the client is usually
  already right.

**Voice:** server is only the **signaling** broker; audio is **WebRTC P2P mesh**.
Per-peer gain is set from in-sim distance/orientation → spatial **proximity chat**;
push-to-talk/toggle just gates the local mic track.

---

## 5. Data & persistence

- **Profiles (Postgres JSONB):** `{ id, name, auth, unlocks:{levels, cosmetics},
  settings, stats }`. Autosave on change + on disconnect; **no mission state** is
  persisted (design: no mid-mission save).
- **Level definitions are data, not rows:** `content/levels/*.ts` export typed
  `LevelDef` (spawns, terrain ref, part/tool placements, puzzle seeds, hazard
  zones, enemy spawns, exfil trigger, cutscene script). Loaded by the sim; trivial
  to add/tune levels.
- **Parts catalog** (`content/parts.ts`) and **narrative** (`content/narrative.ts`,
  Dispatch VO + cutscene storyboards) are likewise data.

---

## 6. Repository layout

```
the-mechanics/
├── docs/                     # GAME_DESIGN, TECH_ARCHITECTURE, ROADMAP
├── index.html                # Vite entry
├── package.json
├── tsconfig.json             # base (strict)
├── tsconfig.server.json      # server/headless build
├── vite.config.ts
├── docker-compose.yml        # client + server + postgres
├── Dockerfile.server
├── src/
│   ├── shared/               # protocol, types, constants, seeded math
│   ├── sim/                  # deterministic core (+ physics.ts Rapier wrapper)
│   │   └── puzzles/
│   ├── client/
│   │   ├── render/  input/  net/  ui/  audio/  voice/
│   │   └── main.ts
│   └── server/
│       ├── persistence/
│       └── index.ts  lobby.ts  session.ts  snapshot.ts
├── content/
│   ├── levels/               # garage, mountains, ocean, moon (LevelDef)
│   ├── parts.ts  narrative.ts
│   └── assets/               # curated glTF/HDRI (+ CREDITS.md), gitignored _raw/
├── headless/
│   └── env_server.ts
├── test/                     # *.spec.ts (vitest) + tours
└── tools/
    ├── visual_tour.mjs       # single-client screenshot tour
    └── mp_browser.mjs        # two real clients that see each other
```

## 7. Proposed `package.json` (scripts & key deps)

> Versions are a starting proposal; pin exact versions at scaffold time
> (Phase 0) after `npm install` resolves them.

```jsonc
{
  "name": "the-mechanics",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:client\" \"npm:dev:server\"",
    "dev:client": "vite",
    "dev:server": "node --watch --import tsx src/server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "esbuild src/server/index.ts --bundle --platform=node --format=cjs --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "env": "tsx headless/env_server.ts",
    "bench": "tsx headless/env_server.ts --bench",
    "test": "vitest run",
    "test:watch": "vitest",
    "tour": "node tools/visual_tour.mjs",
    "tour:mp": "node tools/mp_browser.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "compose:up": "docker compose up --build"
  },
  "dependencies": {
    "three": "^0.165.0",
    "postprocessing": "^6",
    "n8ao": "^1",
    "@dimforge/rapier3d-compat": "^0.14",
    "ws": "^8",
    "pg": "^8",
    "obscenity": "^0.4"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^5",
    "esbuild": "^0.23",
    "tsx": "^4",
    "concurrently": "^9",
    "vitest": "^2",
    "puppeteer-core": "^23",
    "@gltf-transform/cli": "^4",
    "eslint": "^9"
  }
}
```

## 8. Local dev & deployment

- **Dev:** `npm install && npm run dev` → Vite client (:5173) + watched server
  (:8787). Open two tabs: host in one, paste the join code in the other. Postgres
  optional in dev (defaults to `JsonFileStore`); set `DATABASE_URL` to use PG.
- **Env vars:** `PORT` (8787), `DATABASE_URL`, `PUBLIC_WS_URL` (client→server),
  `WORLD_SEED` (override fixed seed), `TICK_HZ` (default 30).
- **Docker:** `docker compose up --build` brings up `postgres:16-alpine`, the
  server, and the static client behind one entry. Server bundled to CJS via
  esbuild; client built by Vite to static assets.
- **Web execution note:** outbound network in this managed environment is governed
  by the chosen network policy — `npm install`, Docker image pulls, and CDN-hosted
  assets depend on it. Keep deps lean and asset fetches vendored where possible.

## 9. Verification harness (the "prove it works" loop)

This is first-class, not an afterthought — it's how we keep a large game stable.

1. **vitest unit/sim suites** — deterministic and fast:
   - movement: bunny-hop accel curve, speed cap, biome modifiers, stamina.
   - vehicle FSM: state transitions, `critical`→drivable, integrity/damage.
   - each **puzzle**: seeded generation is solvable; win-check correctness; failure
     modes.
   - hazards: cold/breath/oxygen drain & recovery; down/revive timer & wipe.
   - combat: telegraph→dodge/block windows; co-op stagger math.
   - **determinism test:** same seed + same intent log ⇒ identical snapshot hash
     across two independent `sim` runs (guards the whole architecture).
2. **Headless mission runs** (`headless/env_server.ts`) — scripted intents play a
   mission start→exfil; assert win + no exceptions; soak/balance sweeps.
3. **Puppeteer tours** — `visual_tour.mjs` boots the client, walks a route,
   captures screenshots (smoke + visual diff). `mp_browser.mjs` launches **two
   real browser clients** in one server, proves they see each other move and can
   co-op a repair step.
4. **CI / web SessionStart hook** — `npm ci && npm run typecheck && npm test`
   (+ a smoke tour) on every change so web sessions start from a known-green base.
   (See the `session-start-hook` skill.)

## 10. Performance budget (targets)

- 60 fps on a mid laptop iGPU at 1080p; graceful resolution-scale down.
- Draw calls minimized via merged static geometry per biome + instancing
  (trees/rocks/debris/craters). Procedural textures generated once, cached.
- Physics: ≤ ~200 active rigid bodies/biome; sleep static props; vehicle + carried
  parts + enemies are the live set. Fixed 30 Hz physics, render interpolated to
  frame rate.
- Snapshot bandwidth target: < ~10 KB/s per client at 4 players (quantized deltas).

## 11. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| **Physics determinism** drift (float/WASM) | Single Rapier build everywhere; fixed dt; stable body order; snapshot-hash determinism test in CI; server stays authoritative so any drift is corrected, not fatal |
| **Networked physics** feel (jitter on carried/vehicle bodies) | Server-auth + interpolation; predict only the local character; short extrapolation; tune snapshot rate |
| **Scope** (3 biomes × full loop) | Vertical slice first (Garage + Mountains end-to-end) before replicating; levels are data so biomes 2–3 reuse systems |
| **Asset volume** vs cartoony polish | Procedural-first; only vehicles/HDRIs are curated glTF; juice via VFX/shaders not megascans |
| **Voice/WebRTC** complexity | Ship text/proximity-less first; add WebRTC mesh in a later phase; never block core loop on it |
| **Web network policy** limiting installs/CDN | Vendor critical assets; keep deps lean; document required policy |
| **Co-op-gated steps** blocking solo | Every hero step has a slower solo mechanical substitute (clamp/prop/override) |

---

*Build order and acceptance criteria: [`ROADMAP.md`](ROADMAP.md).*
