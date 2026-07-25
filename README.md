# The Mechanics

> You and your friends are an expert team of Mechanics. You get dropped into
> remote, hostile locations to repair a vehicle and drive it to safety. Gather,
> build, repair, survive — then get out.

**The Mechanics** is a first-person survival puzzle game that runs in the
browser — no install, no download. Each mission drops you into a hostile place
with a broken vehicle: scavenge the parts, solve hands-on repair puzzles, fend
off whatever lives there, then drive the fixed-up vehicle to the exfil point
before the elements finish you.

v1 ships two missions — the Garage and Summer Mountains — as a single-player
campaign. Ocean and the Moon, and the co-op the design is built around, are
next.

Think **Surgeon Simulator**'s tactile chaos meets **Raft**'s co-op survival and
**The Long Drive**'s "fix it and go" loop, with the cartoony jank of **Totally
Reliable Delivery Service**.

---

## Status

🟢 **v1.0 — shippable single-player campaign: two missions, start to finish.**

**Mission 0 — The Garage (training).** A lived-in workshop under a real roof,
opening onto a yard of parked vans, pines and drifting cloud. Learn to move,
bunny-hop a speed gate, scavenge parts and *build your own vehicle* — part
variants change both the look and the driving stats (top speed / accel / grip /
durability) on a live spec sheet — then drive your build through a checkpoint
loop and clock out. No fail state.

**Mission 1 — Summer Mountains.** A client's 4×4 is rolling toward a cliff edge
near the summit. Chock it before it goes over, then get five critical systems
back to GO: find a spare wheel and a fuel can across three mountain cabins, and
fix the battery, brakes and coolant loop with three hands-on repair puzzles
(fuse grid, bolt torque, valve balance). Wolves work the treeline, cold bites
above the tree line, and a cave holds a log the last team left behind. Then
drive the switchbacks down without putting it over an edge.

The connective tissue: main menu with unlock-gated mission select, results and
mission-failed screens, best times, per-mission integrity and lore tracking,
pause menu, full settings (video / audio / controls with rebinding, including
mouse buttons / accessibility), gamepad support, Dispatch narration with
subtitles, and adaptive procedural music that shifts on tension and triumph.

**Graphics.** Physically-based sky with sun-driven lighting and an IBL probe
baked from that sky; a shared bevelled-geometry and PBR material kit; a
heightfield mountain whose collision and visuals come from one function;
volumetric light shafts; god rays, colour grading, AO, bloom and grain; smoke
and dust particles; first-person hands with sway, bob and landing dip.

Co-op is designed for but not in v1 — the sim is DOM-free and deterministic so
an authoritative server can be dropped in, but the game ships as a static page
with no server to run one.

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — the complete game design document (what we're building)
- [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) — the engineering plan (how we build it)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased milestones, vertical slice first, with acceptance criteria

## The pitch in one screen

| | |
|---|---|
| **Genre** | Co-op survival puzzle (first-person) |
| **Players** | 1 in v1 (co-op designed for; see Status) |
| **Session** | ~10–25 min per mission |
| **Audience** | Streamers & Discord groups — share a URL, share a code, play |
| **Loop** | Drop in → scavenge → repair (puzzles + physics) → defend → drive to exfil |
| **Hook** | Skill-based movement (bunny-hop/crouch-jump), tactile co-op repairs, a creeping mystery |
| **Style** | Colorful, cartoony, deliberately wonky physics |
| **Platform** | Web (TypeScript + Three.js); no install, no download |

## Tech at a glance

- **Client:** TypeScript + Vite + Three.js. Every asset is procedural — textures,
  props, vehicles and terrain are generated in code, so the whole game is a
  ~340 kB gzipped bundle with no downloads.
- **Physics:** a small deterministic AABB + heightfield resolver in `sim/`
  (swept axis-by-axis, with step-up). No WASM, no native deps.
- **Shared core:** one DOM-free, `Math.random`-free `sim/` runs the game; the
  client renders it and the tests run it headless. Ready for an authoritative
  server without changes.
- **Persistence:** `localStorage` — mission unlocks, best times, integrity, lore.
- **Verification:** vitest unit suite + headless start→win playthroughs of both
  missions + a Puppeteer screenshot tour (`npm run playtest`).

See [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) for the full rationale.

## Quick start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
# open it, pick The Garage, and play
```

Other scripts:

```bash
npm test           # vitest: sim units + headless playthroughs of both missions
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
npm run shot       # fast headless smoke: boot both levels, assert no errors
npm run playtest   # full scripted playthrough in a real browser, screenshots
                   # of every beat to screenshots/, plus draw-call/triangle counts
```

**Controls:** `WASD` move · mouse look · `Space` jump (hold to bunny-hop) ·
`Shift` sprint · `Ctrl` crouch · `E` interact/pickup · `G` drop · `LMB` swing ·
`RMB` block · `F` use item · `1–6`/scroll toolbelt · `Esc` pause. Everything is
rebindable, and a gamepad works out of the box. Build speed by holding `Space`
and air-strafing (`A`/`D` + mouse) to open the speed gate.

## Repository layout

```
the-mechanics/
├── docs/            # design + engineering plan (start here)
├── src/
│   ├── shared/      # protocol, types, constants, math (no deps on client/server)
│   ├── sim/         # deterministic, DOM-free game core (the source of truth)
│   ├── client/      # Three.js renderer, input, UI, audio, progression
│   └── content/     # data-driven levels, parts catalog, narrative scripts
├── test/            # vitest specs incl. headless mission playthroughs
└── tools/           # playtest.mjs — scripted browser playthrough + screenshots
```

## License

TBD. Third-party art assets retain their own licenses (tracked in
`content/assets/CREDITS.md` once added).
