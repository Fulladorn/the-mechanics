# The Mechanics

> A game about fixing things in bad places.

**The Mechanics** is a first-person, hands-on repair game that runs in the
browser. You're the Company's newest mechanic. They send you to broken
vehicles in remote places, and you get them home. You undo real bolts, jack
up real axles, clip battery terminals in the right order, bleed cooling
systems, scavenge parts off whatever the landscape has left lying around, and
drive the thing out before dark.

The art is painterly and stylized: warm sun, violet shadows, puffy clouds,
wind in the grass, chunky characterful vehicles.

---

## What's in the box

**Orientation Day (tutorial, ~8 min).** It's your first shift at Depot 7.
- Punch in, get your tools from your locker, and meet Betsy, the Company's
  practice pickup.
- Inspect her, then fix her: jack her up and swap a flat tyre, swap the dead
  battery (black terminal off first), sort the scrambled fuse box, and fill
  the tank.
- Drive the cone course in the yard and park in the bay.
- It can't be failed. A few secrets are hidden behind the hall for players
  who like to climb.

**The Ridge Job (Level 1, ~20–30 min).** A private client's 4×4 has been left
at the summit overlook on Kestrel Ridge, and as you arrive it starts rolling
toward the drop.
- **The cold open.** Chock it before it goes over.
- **The diagnosis.** Someone sabotaged it on purpose: a shredded tyre, a
  cracked battery, split hoses, an empty tank, and scrambled ignition fuses.
- **The scavenge.**
  - Take a wheel off the ranger's pickup, which is up on blocks.
  - Ride the ranger's quad (its cargo rack holds four parts).
  - Get the old sawmill's generator running to open the shed and pull the
    logging truck's battery.
  - Raid an RV at the lake for hoses, and siphon its fuel as dusk brings the
    wolves out.
- **The repair.** Fit it all:
  - battery and terminals
  - fuel line, then fill up
  - radiator hose, coolant, and bleed the air out with the valve panel
  - the ignition fuse grid
- **The descent.** Drive down in the dark with headlights. A rockslide
  closes the road, so you ford the creek on the logging track instead.
- **Optional extras** grade you higher:
  - a winch from the abandoned mine and a light bar from the fire lookout
  - three logs that start to explain who did this, and why

**Around it:**
- A title screen over a live 3D backdrop and a contract board.
- Graded results (S–D) based on time, vehicle condition, finds, extra work
  and injuries. Best grades are saved.
- Retry from checkpoint.
- Pause and full settings: video, audio, rebindable controls and
  accessibility (a wider torque band, reading Dispatch aloud, and toggles
  for head bob and shake).
- Sound: recorded foley plus a synthesized engine, ambience, a radio voice
  and a generative plucked score.

## How it plays

| | |
|---|---|
| **Look & E** | The prompt always says what E will do. A greyed-out prompt says why it can't yet. |
| **Hold E** | Hold actions: inspect, pump the jack, pour, pull a start cord. |
| **LMB on a bolt** | Wrench it. Loosening is a short hold. Tightening is a torque gauge: let go in the green, or it slips. |
| **Carrying** | Wheels and batteries go in your hands and slow you down. Tap **G** to drop, hold **G** to throw. Tools live on a 4-slot belt (**1–4**). |
| **Parts** | Seat a part in the glowing ghost slot, then bolt it down. |
| **Tab** | The job sheet: every system, what's wrong with it, and the next step. |
| **Vehicles** | **W/S** drive, **Space** handbrake, **V** chase/cockpit camera, **L** lights, **H** horn, **R** flip back over. |
| **Other** | **F** flashlight. Flares (**LMB** with one selected) keep wolves away. **Esc** pause. Gamepad works too. |

## Tech

- **TypeScript + Vite + three.js**, plus `postprocessing` and N8AO for the
  frame (AO, SMAA, bloom, colour grade, ACES).
- **Rapier** (WASM) for physics:
  - a heightfield terrain collider
  - a kinematic character controller for the player
  - raycast-vehicle suspension for the trucks and the quad
  - dynamic bodies for everything you drop or throw
- **A DOM-free simulation** (`src/sim/`). The same code runs in the browser
  and in the tests.
  - Machines are data: slots, bolts, covers, terminals, fluids, jacks and
    puzzle panels. The job sheet is derived from their state, never
    scripted.
  - Missions are beat lists with checkpoints.
- **Procedural art.**
  - Vehicles, buildings and props are built from bevelled primitives and
    profile extrusions.
  - One authored terrain grid feeds the collider, the mesh, the grass and
    the gameplay queries.
  - Stylized materials patch three's standard shader: wrap lighting, rim
    light, sun-tinted height fog and wind.
  - GPU grass, instanced foliage, depth-tinted water and a time-of-day sky.
- **Performance target:** 60 fps at the Medium preset on an RTX 5060-class
  GPU. Integrated graphics aren't a target; Low exists for them anyway.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # vitest: sim units + headless start-to-finish playthroughs of both levels
npm run typecheck
npm run build      # production build to dist/
npm run playtest   # browser tour of both levels and the menus, screenshots to screenshots/
npm run shot       # the same, as a quick smoke test (no screenshots)
```

Dev URLs:
- `?level=depot` or `?level=ridge` skips the menus.
- `?q=low|med|high` sets the quality preset.
- In dev builds, `window.__mech` exposes a debug bridge (teleport, time of
  day, camera, finish or fail).

## Layout

```
src/
  sim/        physics, player, items, machines (repair model), vehicles, world, grading
  content/    levels (depot, ridge + its terrain), vehicle/machine definitions, level kit
  client/     game session, app shell, input, settings, progress, cinematics
    render/   renderer, stylized materials, sky, terrain, grass, foliage, water,
              wolves, vehicles, props, highlight, camera rig, post
    ui/       HUD, menus, shell screens
    audio/    the mixer (samples + synthesis)
test/         unit specs + headless playthroughs (test/bot.ts drives the real input pipeline)
tools/        playtest.mjs (browser tour), shot.mjs (ad-hoc screenshots), probe-terrain.ts
public/audio/ Kenney CC0 foley (see CREDITS.md)
```

## Credits

Foley by [Kenney](https://kenney.nl) (CC0). Type: Barlow Condensed and Inter
(SIL OFL). Everything else is generated in code.
