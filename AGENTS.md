# AGENTS.md: working on The Mechanics

Start here if you are an AI coding agent, or a person bringing one in. This
file has what you need to make a change, check it, and ship it. The other docs
go deeper:

| Doc | Read it for |
|---|---|
| [README.md](README.md) | What the game is, controls, quick start |
| [docs/TECH_ARCHITECTURE.md](docs/TECH_ARCHITECTURE.md) | How the code fits together (sim / content / client), the guidance contract, the render pipeline, the test harness |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | The shipped design: pillars, both levels beat by beat, systems, and what's deliberately *not* built |
| [docs/gameplay-issues.md](docs/gameplay-issues.md) | **Where playtest problems go.** Filed by class, each class with a rule, a shared fix and a check |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What's shipped, what's open, and what's next |

## The project in one paragraph

**The Mechanics** is a single-player, first-person repair game that runs in
the browser. It's built with TypeScript, Vite, three.js and Rapier (WASM
physics). There is no server. Two levels ship:
- **Orientation Day** (`depot`), the tutorial.
- **The Ridge Job** (`ridge`), the first mission.

The repair model is real: bolts, jacks, terminals, covers, fluids and puzzle
panels, all described as data. The game's job is to make that depth
*readable*, never to remove it.

## Commands

```bash
npm install                 # Node 20 (what CI uses)
npm run dev                 # http://localhost:5173, ?level=depot|ridge|sandbox  ?q=low|med|high
npm run typecheck           # tsc --noEmit (strict; covers src/ and test/)
npm test                    # vitest run: all test/**/*.spec.ts (node env), under a minute
npx vitest run test/lugnuts.spec.ts      # one file
npx vitest run -t "lug nuts"             # by test name
npm run build               # typecheck + production build to dist/
```

The browser tools use Puppeteer with SwiftShader software rendering. They are
slow (minutes each) and aren't run in CI. Run them locally before pushing
gameplay, render or HUD changes:

```bash
node tools/targetcheck.mjs [depot ridge]   # drawn-vs-clickable audit of every target; exits 1 on mismatch
node tools/walkthrough.mjs depot|ridge     # guidance bot plays the level in the real game; screenshot per step → walkthrough-<level>/
npm run playtest                           # menu + level tour with real key presses → screenshots/
npm run shot                               # the same tour as a quick smoke test (no screenshots)
node tools/audiocheck.mjs                  # audio meter: fails on NaN, clipping or silence
```

- If Puppeteer's bundled Chrome isn't installed, set
  `PUPPETEER_EXECUTABLE_PATH` to a local Chromium.
- `walkthrough.mjs` runs on the Vite dev server, so **don't edit files while
  it runs**: hot reload restarts the page.

## Directory map

```
src/shared/    constants (TICK_HZ=60), math (Vec3, makeRng), timer
src/sim/       the game itself. DOM-free and three-free; only imports Rapier
  world.ts       World: level runtime, focus, inventory, vehicles, wolves, beats, checkpoints, guidance
  machine.ts     Machine: the repair model (slots/bolts/covers/terminals/fluids/panels/jacks), Step, nextStep/removeStep
  interact.ts    Interactable, TargetBox, pickFocus (what the crosshair is on)
  items.ts       item kinds, ItemManager (hands / belt / pocket / racked / mounted)
  vehicle.ts     Rapier raycast vehicle, pinning, unflip, syncHubs
  player.ts, movement.ts, physics.ts, terrain.ts, combat.ts, hazards.ts, grade.ts, events.ts, puzzles/
src/content/   data: levels/{types,index,depot,ridge,ridgeTerrain,sandbox}.ts, vehicles/*.ts, kit.ts, nature.ts
src/client/    everything that touches the DOM / three.js
  main.ts        boot, screen flow, dev bridge (window.__mech)
  game.ts        a session: fixed 60 Hz step + interpolation, SimEvents → sound/HUD/fx
  input.ts, bindings.ts, settings.ts, progress.ts, cinematics.ts
  render/        view.ts (scene, highlight, resolveTarget/auditTargets), stylized materials, sky, terrain,
                 grass, foliage, water, machineView, highlight, post, kit/ (props), vehicles/ (models)
  ui/            hud.ts, menu.ts, shell.ts
  audio/         mixer.ts
index.html     HUD / menu markup and CSS
test/          *.spec.ts, plus bot.ts (Bot) and guide.ts (GuideBot)
tools/         browser harnesses (see above) and probe-terrain.ts
docs/          design, architecture, roadmap, gameplay-issues
```

## Rules that aren't obvious from the code

1. **The sim never imports the DOM, three.js or `src/client/`.**
   - `src/sim/` and `src/content/` run unchanged in node tests.
   - Levels name their art by string (`model: 'betsy'`, `PropDef.kind`), and
     the client resolves those strings in
     `src/client/render/kit/registry.ts`.
   - Sim code uses no `Math.random` or `Date.now`: use `makeRng`
     (`src/shared/math.ts`) with a seed.
2. **What's drawn is exactly what's clickable.**
   - Every interactable has a drawn object that can glow, and its click point
     sits on that object.
   - The sim and the renderer share the same pose functions
     (`Machine.hubPose`, `slotPoint`, `boltPos`); never duplicate the numbers.
   - New interactables must pass `node tools/targetcheck.mjs` and
     `test/interact.audit.spec.ts`.
3. **Every step says what, where and how.**
   - Every `Step` from `Machine.nextStep` / `removeStep` and every level
     `BeatDef` names its exact target ids (`targets`).
   - Every step has a waypoint (`marker`), and shows its progress on repeats
     ("2/5 off").
   - The **guidance bot** (`test/guidance.spec.ts`, via `test/guide.ts`)
     plays both levels using only the waypoint, the glow and the prompt text.
     If you add or change a beat or repair step, that test must still pass.
4. **Fix problems by class, never by dumbing the game down.**
   - When a playtest finds a problem, find its class in
     `docs/gameplay-issues.md` and fix the shared mechanism, not the one
     object.
   - If it's a new class, add a row (rule, shared fix, check) before fixing
     the instance.
   - Five lug nuts stay five lug nuts: make them clear and reliable instead.
5. **No default binding may collide with a browser shortcut.**
   - For example, Ctrl+W closes the tab, which is why crouch is on C.
   - Changing a default means bumping `SETTINGS_REV` and adding a `migrate()`
     step in `src/client/settings.ts`, with a test in `test/settings.spec.ts`.
6. **Performance target:** 60 fps at the Medium preset on an RTX 5060-class
   GPU. Merge and instance geometry, and check `__mech.stats()` for draw
   calls.

## Common tasks

**Add or change a repair.**
- Machines are data (`MachineDef`) in `src/content/vehicles/*.ts`; wheels use
  the helpers in `common.ts` (`lugNuts`, `wheelSlot`).
- Step generation is in `src/sim/machine.ts`, and the drawn state is in
  `src/client/render/machineView.ts`.
- Add a spec next to `test/machine.spec.ts` / `test/lugnuts.spec.ts`.

**Add or change a mission beat.**
- Beats live in `src/content/levels/<level>.ts` (`BeatDef` in `types.ts`).
- Give each beat `text`, `marker`, `targets`, `done`, and optionally `hints`
  and `detail`.
- For a checkpoint beat, add `checkpoint: true` and a `restore` that recreates
  the state that stretch leaves behind; `test/ridge.playthrough.spec.ts`
  restores from each one.

**Add a level.**
- Write a `make<Name>(): LevelDef` factory and register it in
  `src/content/levels/index.ts`. It's then playable at `?level=<id>`.
- Add a campaign entry in `src/client/progress.ts`.
- Add a start-to-finish spec modelled on `test/depot.playthrough.spec.ts`, and
  guidance coverage in `test/guidance.spec.ts`.

**Add a prop or model.**
- Write a builder in `src/client/render/kit/*.ts` (or `vehicles/`) and
  register it in `kit/registry.ts`.
- Use `styl()` / `MAT` materials from `render/stylized.ts` so it matches the
  painterly look.
- If the player can use it, expose a `targets` map so the glow and audit find
  it.

**Change the HUD.**
- The markup and CSS are in `index.html`, and the logic is in
  `src/client/ui/hud.ts`.
- Prompts are placed by `Hud.placePrompt()` so they never overlap the
  subtitle or carry line. Check with `tools/walkthrough.mjs` screenshots.

## Debugging in the browser

In `npm run dev` builds, `window.__mech` is a dev bridge:

| Function | Does |
|---|---|
| `game()` | the current `Game` (`.world` is the sim) |
| `level(id)` | start a level |
| `title()` | go to the title screen |
| `finish()` | jump to the results screen |
| `fail()` | jump to the fail screen |
| `pause()` | pause |
| `teleport(x, z, yaw?, pitch?, y?)` | move the player |
| `look(yaw, pitch)` | set the view angles |
| `lookAt(x, y, z)` | aim at a point |
| `focus()` | the label of the current prompt |
| `pick(sx, sy)` | the mesh chain under an NDC point |
| `auditTargets()` | drawn-vs-clickable problems in view |
| `intent({...})` | override input; `null` releases it |
| `enter(key)` | get into a vehicle |
| `hour(h)` | set the time of day |
| `cam(x, y, z, tx, ty, tz)` | set a cinematic camera |
| `nocam()` | clear the cinematic camera |
| `lock()` | fake pointer lock for headless browsers |
| `stats()` | draw calls, triangles and memory |
| `audio()` | mixer meter |

## Before you push

1. Run `npm run typecheck` and `npm test`. Both must pass; CI runs exactly
   these plus `npm run build`.
2. If you touched gameplay, targets, the HUD or rendering, also run
   `node tools/targetcheck.mjs`, `node tools/walkthrough.mjs <level>` (and
   look at the screenshots), and `npm run playtest`.
3. If you touched audio, run `node tools/audiocheck.mjs`.
4. If a playtest found the problem, update the class row and the "found by"
   list in `docs/gameplay-issues.md`.

## Git conventions

- Work on a feature branch (`claude/*`, `copilot/*`, or your own) and merge
  to `main` through a pull request using
  `.github/pull_request_template.md`.
- CI (`.github/workflows/ci.yml`) runs on `main`, on `claude/**` pushes, and
  on PRs to `main`.
- A push to `main` deploys to GitHub Pages (`deploy.yml`, built with
  `--base=/the-mechanics/`).
- Commit subjects are plain sentences about the player-facing result, e.g.
  "Crouch on C, not Ctrl: Ctrl+W closed the tab". The body explains the cause
  and the fix. Don't use `[Phase X]` prefixes.
- Tests are `test/**/*.spec.ts`. Files named `*.test.ts` **won't run**.
