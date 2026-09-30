# The Mechanics: Technical Architecture

This describes the code as it is. For commands and project rules, see
[AGENTS.md](../AGENTS.md). For the design, see
[GAME_DESIGN.md](GAME_DESIGN.md).

## 1. Shape of the thing

- It's a single-player browser game and a client-only app: no server, no
  netcode, no accounts. Vite builds it to static files, and GitHub Pages
  hosts it.
- It has three layers, and dependencies only point downward:

```
src/client/   DOM, three.js, audio, input, HUD            ← reads sim state, sends intents/commands
    │
src/content/  level + vehicle definitions (pure data + small functions)
    │
src/sim/      the game rules: physics, player, items, machines, vehicles, wolves, beats
    │
src/shared/   constants, math, seeded RNG, timer
```

- **`src/sim/` never imports the DOM, three.js or `src/client/`.** It imports
  only Rapier (in `physics.ts`). That's why tests can play whole levels in
  node.
- Content names its art by string (`model: 'betsy'`, `PropDef.kind: 'locker'`),
  and the client resolves the strings.

### Stack
| | |
|---|---|
| Language / build | TypeScript (strict), Vite 5, ES2022 |
| Rendering | three.js 0.169; `postprocessing` + N8AO |
| Physics | Rapier 3D (`@dimforge/rapier3d-compat` 0.21, WASM) |
| Tests | vitest 2 (node environment, `test/**/*.spec.ts`) |
| Browser harnesses | Puppeteer with SwiftShader (software GL) |
| Fonts / audio | @fontsource Barlow Condensed + Inter; Kenney CC0 `.ogg` foley plus synthesis |

## 2. The loop

`src/client/game.ts` owns a session:

- It runs a **fixed 60 Hz sim step** (`DT = 1/60` from `shared/constants.ts`),
  with at most 5 substeps per frame; if it falls further behind it drops the
  backlog.
- After each step, `view.capture()` stores poses, and the frame draws
  **interpolated** between the last two (`alpha = acc / DT`).
- Input becomes an `Intent`, a per-step snapshot of movement, look, use and
  interact. The `World.command()` calls are discrete: slot, cycle,
  flashlight, lights, horn, unflip, fuse, valve, commitValves, closePanel.
- The sim reports everything through `SimEvent`s (`src/sim/events.ts`): bolt
  loosened, part on, zap, wolf lunge, say, objective, fail…. `Game.drain()`
  turns them into sound, particles, camera shake, HUD stamps and toasts. The
  sim never knows how anything is presented.

## 3. The sim (`src/sim/`)

### World (`world.ts`)
`World.create(level, { assist })` builds the runtime from a `LevelDef`.
`step(intent, dt)` then runs, in order:

1. Movement on foot, then `updateFocus` (what the crosshair is on), then the
   E / LMB actions and drop / throw.
2. Vehicle control, then `phys.step`, then syncing item and vehicle poses.
3. Integrity and fail checks.
4. `Machine.refresh` for every machine, which emits `systemGo` / `allGo`.
5. Flares and wolves (`combat.ts`), survival (`hazards.ts`), then the
   **director**:
   - triggers;
   - the current beat's `done` / `finish`;
   - timed Dispatch hints;
   - checkpoints.
6. Doors.

It also holds the flags, the lore that's been found, grading inputs, and the
**guidance helpers** (§5).

### Machines: the repair model (`machine.ts`)
A machine is a `MachineDef`, i.e. data: components plus systems.

**Components:**
- `slot`: a mount for an item kind, with bolts;
- `cover`: a hood or lid that must be open;
- `terminals`: battery +/−, with order rules;
- `fluid`: a tank to pour into;
- `panel`: a puzzle, either the fuse grid or valve balance;
- `jack`: a jacking point.

The def also has an optional `inspect` spot, a hold-E diagnosis.

A **system** (tyre, battery, fuel, coolant, ignition…) is GO when all of its
components are OK. The vehicle can start when every critical system is GO.

**Steps are derived from state, never scripted.** `nextStep(sys, ctx)` walks a
system's components in order:
1. open the cover;
2. terminals: negative off first, positive on first;
3. loosen the bolts ("— 2/5 off");
4. jack it up;
5. take off the old part;
6. fit the new part;
7. torque the bolts ("— n/N tight");
8. fluids;
9. panels;
10. close the cover;
11. lower and pull out the jack.

`removeStep(slot, ctx)` does the same for salvaging from a donor. Each `Step`
is `{ text, pos?, targets[], need?, where? }`: the job-sheet line, the
waypoint, and the exact interactable ids to use.

**Poses are shared.** The client and the sim both use:
- `hubPose` (per-wheel `dy` / `steer`), set by `Vehicle.syncHubs()`: a pinned
  car rests, droops by `HUB_DROOP` when jacked, and follows the suspension
  while driving;
- `slotPoint(slot, local)`;
- `boltPos(slot, i)`.

So a nut is clicked exactly where `machineView.ts` draws it. The wording
helpers `plural()` and `ctx.locate(kind)` keep the text right ("the hold-down
bolt", "it's strapped to the quad's rack").

### Interaction (`interact.ts`)
Anything usable is an `Interactable`:
- an id;
- a label;
- a verb: `tap | hold | loosen | torque | pour`;
- a `TargetBox` (centre, half-extents, yaw, `offCap`, `slack`);
- a priority;
- an optional `disabled` reason, shown greyed out.

`pickFocus` picks what the crosshair is on:
- **Two passes:** real targets (priority ≥ 0) first, then fallback volumes
  (inspect, doors, vehicle entry).
- **Score:** `t + 3·offCentre − 0.2·priority`, plus `DISABLED_PENALTY` (0.6)
  when disabled, so a greyed prompt never steals focus from a usable one.
- If no ray hits, an aim-assist cone applies.
- `offCap` caps the off-centre penalty for big targets like a tyre disc.
  `slack` is how much a collider may overlap the face before the target
  counts as occluded.

The World keeps focus **sticky** while you hold or torque, as long as you
stay within 0.11 m.

**Target id scheme** (used by the sim, the highlight, the audit and tests):

```
item:<id>                              a loose item
machine:<key>:<kind>:<id>              kind ∈ bolt|slot|cover|term|panel|fluid|jack|inspect|ghost
vehicle:<key>:enter | :rack | :unrack:<itemId>   vehicles and their racks
door:<id>                              doors
station:<id>                           level stations (clock, locker, map board, pull cord…)
```

### Other modules
| File | What |
|---|---|
| `items.ts` | 19 item kinds (`ITEM_DEFS`) and `ItemManager`. Item states: `world / held / belt / pocket / mounted / racked / gone`. The belt holds the wrench, flashlight, flare and medkit; the pocket holds keys; everything else goes in your hands. Heavy parts slow you to 0.72× and stop sprinting. |
| `player.ts`, `movement.ts` | A kinematic character controller with a Quake-style velocity model: bunny-hop, optional autohop, stamina. `BELT_SLOTS = 4`. |
| `vehicle.ts` | Rapier raycast vehicle. Handles pinning (chocked / on blocks), creep, unflip and `syncHubs`, and holds the rack (the flatbed: any stowed part can be taken back). |
| `physics.ts` | Rapier wrapper: collision groups `G`, surfaces, `castRay`. |
| `terrain.ts` | An authored heightfield: noise, plus features, roads and pads. **One grid** feeds the collider, the mesh, grass, and gameplay queries (`heightAt`). |
| `combat.ts` | Wolves: idle → stalk → telegraph (0.75 s) → lunge → recover. Pack discipline allows one attacker at a time. Flares scare them within 13 m. Wrench swing; block. |
| `hazards.ts` | Cold above an altitude, warmth sources, fall damage, regen, medkits. `LevelDef.safe` keeps the tutorial unfailable. |
| `grade.ts` | S–D grading from time vs par, vehicle condition, finds, side jobs and injuries. |
| `puzzles/` | `fuseGrid` (lights-out style, seeded), `valveBalance` (coupled gauges, lever commit), `boltTorque` (tests only). |

**Randomness:** sim code uses `makeRng(seed)` from `shared/math.ts`, never
`Math.random` or `Date.now`, so levels and tests play the same way every
time.

## 4. Content (`src/content/`)

- **`levels/types.ts`** defines `LevelDef` and `BeatDef`. The main
  `LevelDef` fields:
  - `id, title, subtitle, env, terrain, hour, spawn`;
  - `statics, props, nature, items, machines, stations, doors, wolves`;
  - `beats, side, triggers, hazards, warmth, lore, par, safe, guidance`;
  - `intro, outro, briefing, ground, rooms, lostY`.
- **A beat** is:
  - `text`, `detail`;
  - `marker(w)`: the waypoint;
  - `targets(w)`: the ids that glow;
  - `start`, `done(w)`, `finish`;
  - `hints: [seconds, line][]`;
  - `checkpoint` + `restore(w)`;
  - `hour`.
- **Levels are factories** (`makeDepot`, `makeRidge`, `makeSandbox`)
  registered in `levels/index.ts` as `LEVELS`.
- **`vehicles/`** holds the machine definitions: Betsy, the Ridgeback, and
  the donors (ranger pickup, logging truck, ATV, generator). `common.ts` has
  the `lugNuts` / `wheelSlot` helpers.
- **`kit.ts`: `Kit`** builds colliders and prop placements from the *same
  numbers*, so walls you see are walls you hit. `furnish()` places common
  furniture with `FOOT` footprints.
- **`nature.ts`:** deterministic tree and rock scatter, plus its colliders.

## 5. Guidance: how the game tells you what to do

This is the contract behind "every step says what, where and how"
(see [gameplay-issues.md](gameplay-issues.md)).

- **What:**
  - the objective card is `BeatDef.text` / `detail`;
  - the job sheet (Tab) lists each system's `nextStep().text`;
  - the prompt under the crosshair is the focused interactable's label, or
    its disabled reason.
- **Where:**
  - the waypoint is `BeatDef.marker`;
  - for machine steps, `World.markerFor(step)` puts it on the part to fetch,
    or on the rack it's strapped to.
  - The HUD hides the diamond once you're on the target.
- **Which part:** `World.guide()` returns the interactables that the current
  beat's `targets(w)` names:
  - if `targets` is omitted, whatever is at the marker;
  - if it's `null`, nothing.
  
  `targetsFor(step)` maps a machine step to ids, including the
  `item:` / `vehicle:<key>:unrack:<id>` ids for a part you still need to
  fetch.
- **Hands:** `World.handsFor(step)` rewrites a step when you're holding the
  wrong thing:
  - "Strap the X to the quad's rack (E at the rack) — then: …" when the part
    is worth keeping (`worthKeeping`) and a rack is in range (`stowRack`);
  - otherwise "Put the X down (G) — then: …".
  
  `whereIs(kind)` reports whether a part is in your hands, on your belt, on a
  rack, in the world, or nowhere.
- **The glow:**
  - `View.updateHighlight` draws a warm focus overlay, red-orange when the
    focus is disabled;
  - the guide targets get an amber "breath" (`render/highlight.ts`);
  - a carried part shows its ghost slot in green if it fits, amber if it's
    blocked.
- **When the glow shows** depends on `settings.accessibility.guidance`:
  - `always` / `off` do what they say;
  - `auto` follows `LevelDef.guidance`. That's `'always'` in the tutorial,
    and in missions it comes on after 20 s on a step (`GUIDE_DELAY` in
    `view.ts`).
- **Failure:** `World.lastHurtBy` (wolf / fall / crash / cold) chooses the
  fail-screen tip, and retry restores the last checkpoint.

## 6. The client (`src/client/`)

| Area | Files |
|---|---|
| Boot & screens | `main.ts`: title (live 3D backdrop), contract board, briefing, results, failed; `?level` / `?q`; the dev bridge `window.__mech`; the `beforeunload` guard; keyboard lock in fullscreen |
| Session | `game.ts`: fixed step, event → fx wiring, job sheet, panel mode, bolt toasts |
| Input | `input.ts`: pointer lock, keyboard and gamepad (`PAD` map). Ctrl combinations are swallowed. `bindings.ts` has `DEFAULT_BINDS`, all rebindable. |
| Settings | `settings.ts`: `localStorage` key `mech.settings.v2`, deep-merged over the defaults. `SETTINGS_REV` + `migrate()` move old saves forward (for example, crouch from Ctrl to C). |
| Progress | `progress.ts` (`mech.progress.v2`, `CAMPAIGN`: depot → ridge); best times in `shared/timer.ts` (`mech.best.v1`) |
| HUD | `ui/hud.ts` + markup in `index.html`. `placePrompt()` keeps the prompt clear of the subtitle and carry line; `panelProgress()` shows puzzle progress. Menus are in `ui/menu.ts`, the other screens in `ui/shell.ts`. |
| Audio | `audio/mixer.ts`: samples plus a synthesized engine, ambience, radio voice and score; `meter()` for audiocheck |
| Cinematics | `cinematics.ts`: the Ridge cold open |

### Rendering (`src/client/render/`)
- **`view.ts`** builds the scene from the `World` and the `LevelDef`, and
  draws interpolated poses. It also owns:
  - the highlight;
  - `resolveTarget(id)`, which maps a target id to the drawn object;
  - `auditTargets()`, which reports "no drawn object", "clickable but not
    drawn" and "click point off the drawn part" (used by `targetcheck.mjs`).
- **The look.** `stylized.ts` has `styl()`, a patched `MeshStandardMaterial`
  with wrap light, rim light, world-space noise, sun-tinted height fog and
  wind, plus the `MAT` presets. There's also:
  - `sky.ts` (time of day);
  - `terrainView.ts` + `biome.ts` (ground colour per `ground` rule, with
    `feather` blending);
  - `grass.ts` (a GPU blade lattice);
  - `foliage.ts` (merged, vertex-coloured canopies, which must be closed;
    `test/foliage.spec.ts` checks this);
  - `water.ts`, `particles.ts`.
- **Models:**
  - `vehicles/*.ts` (Betsy, the Ridgeback, the donors) and `kit/*.ts`
    (buildings, props, Ridge props), registered by name in
    `kit/registry.ts`;
  - `machineView.ts` draws live repair state (nuts, jack, hood, clamps,
    wheels) from the shared poses;
  - `viewmodel.ts` / `itemModels.ts` draw the held tool.
- **Post** (`post.ts`): RenderPass → N8AO (Medium and up) → SMAA → bloom →
  grade → ACES → vignette → film grain. If the chain fails, it falls back to
  a plain ACES render.

### Quality presets
| | Low | Medium (default) | High |
|---|---|---|---|
| Pixel ratio cap | 1 | 1.5 | 2 |
| Shadow map | 2048 | 4096 | 8192 |
| Grass radius / spacing | 26 m / 0.17 | 44 m / 0.12 | 60 m / 0.10 |
| N8AO + grain | off | on | on |
| Particles | 300 | 600 | 900 |
| Terrain LOD rings | 140 / 320 m | 220 / 480 m | 320 / 650 m |

**Performance target:** 60 fps at Medium on an RTX 5060-class GPU. Check the
draw calls with `__mech.stats()`.

## 7. Testing

**Unit and headless tests** (`npm test`, all in node):

| Spec | Covers |
|---|---|
| `depot.playthrough`, `ridge.playthrough` | Each level start to finish through the real aim → `pickFocus` → intent pipeline (`test/bot.ts`); the Ridge also restores from every checkpoint |
| `guidance` | `GuideBot` (`test/guide.ts`) follows only the waypoint, the glow and the prompt text: Depot to "start her up", and every on-foot Ridge step. Driving beats are stood in by placing the quad. |
| `interact.audit` | Aims at every station, door, cover and item from many spots in both levels |
| `lugnuts` | The wheel job: nuts stay off, hub-centre aim, jacked-hub targets, wobble keeps the hold |
| `machine`, `puzzles` | Repair model and puzzles |
| `physics`, `hazards`, `combat` | Movement, falls and cold, wolf pack turn-taking |
| `ridge.smoke`, `grade`, `timer`, `settings`, `foliage` | Other checks; `foliage` imports three to check the canopy meshes |

- **`Bot`** moves by teleporting, but acts only through real focus and
  intents: `approach`, `aim`, `tapAt`, `holdAt`, `loosenAt`, `torqueAt`.
- **`GuideBot.follow({ until, stand?, maxMoves })`** throws a readable
  failure ("stuck on …", "nothing glows at the waypoint") naming the step a
  player would get stuck on.

**Browser harnesses** (`tools/`; Puppeteer + SwiftShader, not in CI):

| Tool | Server | Does |
|---|---|---|
| `targetcheck.mjs [levels…]` | static dev-mode build + `vite preview` :4193 | Stands at 6 spots around every machine and at every station, both as found and opened up, and runs `auditTargets()`. Exits 1 on any mismatch. |
| `walkthrough.mjs <level> [out]` | dev server :4194 | Loads `GuideBot` into the real page and takes a screenshot each time the step changes. Don't edit files mid-run. |
| `playtest.mjs [--smoke] [--q] [--grass] [--head] [--out]` | dev server :4173 | Tour of the title, contracts, depot (real E and F key presses), yard, pause, Ridge stops, night, results and failed screens |
| `audiocheck.mjs` | dev server :4175 | Samples `__mech.audio()` across scenes; fails on NaN, clipping or silence |
| `shot.mjs <out> <script.json> [level] [q]` | dev server :4190 | Ad-hoc scripted screenshots |
| `probe-terrain.ts` | none | `npx vite-node tools/probe-terrain.ts`: Ridge road grades and profiles |

**CI** (`.github/workflows/ci.yml`, Node 20): `npm ci` (with
`PUPPETEER_SKIP_DOWNLOAD=true`) → typecheck → test → build. It runs on `main`,
on `claude/**`, and on PRs to `main`.

## 8. Deploy

`.github/workflows/deploy.yml` runs on a push to `main` or on manual
dispatch. It typechecks, then builds with `vite build --base=/the-mechanics/`,
then publishes `dist/` to GitHub Pages. No runtime configuration or
environment variables are needed.

## 9. Known gaps

- **No automated driving check.** Travel beats are covered by teleporting in
  the playthroughs and guidance bot; see issue class #10.
- **No unit test for the fuse grid puzzle.** It's covered by the
  playthroughs.
- **Dead constants.** `shared/constants.ts` has some unused ones left from
  the prototype (`KART_*`, `GATE_SPEED`).
