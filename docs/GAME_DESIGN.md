# The Mechanics: Game Design

**Status:** v1 is shipped: the tutorial plus Level 1, single-player, in the
browser. This document describes what's built. Ideas that aren't built are
collected in §9 and marked as such; don't treat them as requirements. For
how the code works, see [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md).

---

## 1. Vision and pillars

A first-person game about fixing things in bad places. You're the Company's
newest mechanic, sent to broken vehicles in remote spots to get them running
and drive them out.

1. **Real, tactile repair. Depth is the point.** Bolts are undone one by one,
   and axles are jacked before wheels come off. The black terminal comes off
   first. Hoses are clamped, then the coolant is bled. We never simplify a
   job to make it easier: five lug nuts stay five lug nuts.
2. **Clarity is the game's job, not the player's.** Every step says *what*
   to do, *where*, and *how*, and shows its progress. The prompt names the
   exact action, a greyed prompt says why it can't happen yet, and the
   waypoint and the amber glow show the exact part. When a player gets stuck,
   that's a bug in the game's communication. It gets fixed by class; see
   [gameplay-issues.md](gameplay-issues.md).
3. **Pressure you can read.** The cliff edge, dusk, the cold and wolves
   create stakes. Every threat is telegraphed, and every failure says what
   did it and lets you retry from a checkpoint.
4. **Movement that feels good.** A springy first-person controller with a
   skill ceiling (bunny-hop, crouch-jump) that's optional; autohop is an
   accessibility setting.
5. **A place worth being in.** The art is painterly and stylized: warm sun,
   violet shadows, wind in the grass, chunky characterful vehicles.

**Scope guardrails:** bounded, handcrafted levels (not open world); no
economy, crafting or tech tree; no PvP.

## 2. Core loop

```
BRIEFING → ASSESS (inspect: the job sheet fills in) → SCAVENGE (donors, stations, puzzles)
        → REPAIR (step by step, per system) → START HER UP → DRIVE OUT → RESULTS (S–D)
                 hazards (cold, falls, wolves at dusk) run under all of it
```

- **Session length:** about 8 minutes for the tutorial, and 20–30 minutes for
  a mission.
- **Checkpoints** sit at key beats, and retry restores that checkpoint's
  world state.
- **Progress** unlocks the next contract and records best grades and times.

## 3. Systems

### 3.1 Repair model
- Each vehicle is a machine made of **systems**, such as tyre, battery, fuel,
  coolant and ignition. Each system is built from components:
  - **slots** (mounts with bolts);
  - **covers**;
  - **battery terminals**;
  - **fluids**;
  - **puzzle panels**;
  - **jacks**.
- A system is GO when all its components are OK. The vehicle cranks when
  every critical system is GO. Optional systems (a winch, a light bar) add to
  the grade.
- **The job sheet (Tab) is derived from state, never scripted.** Each system
  shows its next step, and the steps come out in the real order:
  1. open the cover;
  2. negative terminal off first;
  3. loosen the bolts (with a count);
  4. jack it up;
  5. swap the part;
  6. torque the bolts: release in the green band, or the bolt slips;
  7. fill fluids;
  8. solve the panel;
  9. close up and lower.
- **Salvage** from donor vehicles is guided the same way, in reverse.
- **The rules bite.** Touch the positive terminal while the negative is on
  and you get a zap. A wheel won't come off an axle that isn't jacked.
  Over-torque, and the bolt slips.
- **Puzzles:**
  - The **fuse grid** is lights-out style: toggling a fuse flips its
    neighbours. The rule is shown when you open it, with a live
    "6/9 fuses green" line.
  - The **valve balance** has coupled gauges. Get all of them into the green,
    then pull the lever.

### 3.2 Hands, belt, rack
- **One pair of hands.** Wheels, batteries, hoses and cans are carried, and
  heavy parts slow you and stop you sprinting. G drops, holding G throws.
- **Tool belt:** four slots for the wrench, flashlight, flares and medkit
  (keys to 1–4, or the mouse wheel). Keys go in your pocket.
- **The quad's rack** holds four parts. It's a flatbed: take back any part by
  looking at it.
- If your hands are full and the step needs something else, the step tells
  you what to do with what you're holding: strap it to a nearby rack if it's
  worth keeping, otherwise put it down.

### 3.3 Guidance
- **Objective card:** the beat text, plus a detail line.
- **Waypoint:** it sits on the next target (the part to fetch, or the rack
  it's on) and steps aside once you're there.
- **Prompt under the crosshair:** the verb plus the object, with progress
  ("Loosen lug nut · 3/5 off").
- **Next-step glow:** the exact part to use breathes amber. It's always on in
  the tutorial. In missions it appears after 20 s on a step. The setting is
  auto / always / off.
- **Dispatch hints:** timed radio nudges while you're stuck on a beat.

### 3.4 Driving
- Raycast-vehicle trucks and a quad bike. There are chase and cockpit cameras
  (V), headlights (L), horn (H), and unflip (R).
- **Damage:** hard impacts cost vehicle condition, which affects the grade.
  Wrecking the car or losing it off a cliff fails the mission.

### 3.5 Survival
- **Health:**
  - fall damage;
  - regen after a few seconds out of danger;
  - medkits;
  - being downed fails the mission.
- **Cold:** above a set altitude, or at night. Warmth sources (a campfire)
  restore you.
- **Wolves** (Ridge, from dusk):
  - they stalk, telegraph, then lunge, one at a time;
  - block with the right mouse button, swing the wrench, or light a flare to
    scare them off within about 13 m.
- **Fail screens** name the actual cause (wolf, fall, crash, cold), give a
  tip, and offer a retry from the last checkpoint.
- **The tutorial is safe:** it can't be failed.

### 3.6 Movement
Walk, sprint (stamina), crouch (C), jump, bunny-hop and crouch-jump. Autohop
is an accessibility option.

### 3.7 Grading
S–D grades, from:
- time against par (480 s for Depot, 1320 s for the Ridge);
- vehicle condition;
- lore found;
- side jobs;
- injuries.

## 4. Story

- **Premise.** The Company (voice-only, call sign *Dispatch*) sends you to
  coordinates. You fix the vehicle and deliver it, and questions are
  discouraged.
- **The thread.** Someone is sabotaging these vehicles on purpose. Found
  documents point at a "broken ring" crate and the Company itself:
  - **Depot:** a sealed crate that's on no manifest.
  - **Ridge:** the foreman's logbook in the mine, the lookout's journal in
    the fire tower, and the Company manifest in the crashed van.
- **Tone.** Comedic but competent. Dispatch is dry, a little shady, and
  evasive about the weird stuff. The danger is real.

## 5. Levels

### 5.0 Orientation Day (`depot`, the tutorial)
Company Depot, Bay 3. The vehicle is **Betsy**, the practice pickup.

| Beat | What happens |
|---|---|
| `clockin` | Punch the time clock |
| `gear` | Open your locker: wrench, flashlight |
| `inspect` | Hold E on Betsy: the job sheet fills in |
| `tire` | Jack up, loosen five lug nuts, swap the flat, torque, lower |
| `battery` | Negative terminal off first, swap the battery, reconnect |
| `fuses` | Fuse-grid puzzle |
| `fuel` | Fill the tank |
| `start` | Crank her over |
| `course` | Drive the cone course |
| `park` | Park in the bay |

Guidance is always on here, and the level can't be failed. Side content:
- a hidden crate (lore);
- a clean cone run;
- secrets behind the hall for climbers.

### 5.1 The Ridge Job (`ridge`, Level 1)
Kestrel Ridge, for a private client. The vehicle is the **Ridgeback** 4×4.
The critical systems are wheel, battery, fuel, coolant and ignition; winch
and lights are optional.

| Beat | What happens |
|---|---|
| `chock`★ | Cold open: the 4×4 is rolling toward the drop. Chock it. |
| `inspect` | Diagnose the sabotage: a shredded tyre, a cracked battery, split hoses, an empty tank, scrambled fuses |
| `jack` | "Find a new wheel": walk down the switchbacks to the ranger station |
| `station` | Get into the ranger station |
| `map` | Read the map board (this reveals the side jobs) |
| `wheel` | Salvage a wheel from the ranger's pickup, which is up on blocks |
| `ride` | Take the ranger's quad back with the wheel on its rack |
| `fitwheel` | Swap the front-left wheel: jack, nuts off, wheel off, new wheel on, torque, lower |
| `wheeldone`★ | Wheel done |
| `sawmill` | Ride to the old sawmill |
| `power` | Fuel the generator and pull its cord to open the shed |
| `battery` | Pull the logging truck's battery |
| `camp` | Ride to the lakeside RV camp; dusk falls and wolves come out |
| `hoses` | Take hoses from the RV bin and siphon fuel |
| `fitbattery` | Fit the battery |
| `fitfuel` | Fit the fuel line and fill up |
| `fitcoolant` | Fit the radiator hose, fill, and bleed on the valve panel |
| `fitignition` | Fuse-grid puzzle |
| `start`★ | Start her up |
| `descent` | Drive down in the dark. A rockslide closes the road, so ford the creek on the logging track. |
| `park` | Park it by the Company flatbed at the lot |

★ marks a checkpoint.

**Side jobs:**
- the winch, from the abandoned mine (bring your flashlight);
- the light bar, from the fire lookout.

**Lore:** the mine logbook, the tower journal and the van manifest.

## 6. Interface

- **HUD:**
  - the objective card;
  - a waypoint diamond with distance;
  - the crosshair prompt, placed so it never overlaps the subtitle or carry
    line;
  - the radio subtitle;
  - the carry line;
  - the belt;
  - health, cold and stamina;
  - toasts and stamps ("BATTERY — GO").
- **Screens:**
  - the title screen, over a live 3D backdrop;
  - the contract board;
  - the briefing;
  - pause and settings;
  - results, with the grade breakdown;
  - failed, with its cause, a tip and retry.
- **Settings:**
  - **video:** quality preset, FOV, vehicle camera;
  - **audio:** sliders;
  - **controls:** everything rebindable, plus sensitivity and gamepad;
  - **accessibility:** guidance, a wider torque band, autohop, head bob,
    screen shake, subtitles, colour-blind mode, reading Dispatch aloud.
- **Browser safety:** no default binding uses Ctrl. Leaving mid-job asks
  first. In fullscreen, the keyboard is locked so browser shortcuts stay in
  the game.

## 7. Art direction

- The style is painterly and stylized:
  - warm key light and violet shadows;
  - rim light;
  - sun-tinted height fog;
  - wind in the grass and trees;
  - soft, puffy clouds and a time-of-day sky.
- Everything is procedural, built in code:
  - vehicles and props from bevelled primitives and extrusions;
  - trees with closed, solid canopies;
  - GPU grass;
  - depth-tinted water.
- Vehicles are chunky and characterful, and broken parts read at a glance.
- **Performance target:** 60 fps at Medium on an RTX 5060-class GPU. Low
  exists for weaker machines.

## 8. Audio

- Recorded foley (Kenney, CC0) for tools, parts, steps and doors.
- Synthesized:
  - the engine;
  - ambience (wind, birds, water);
  - the radio voice treatment;
  - a generative plucked score.
- Dispatch lines appear as subtitles, and can optionally be read aloud with
  speech synthesis.

## 9. Not built: ideas for later

**None of this exists in code.** It's recorded so the ideas aren't lost.
Promote an item to the roadmap before building it.

- **Co-op (2–4 players)** with a server, proximity voice, and two-person jobs
  like "you hold, I bolt". This would need a netcode layer. Today's
  architecture is single-player, client-only.
- **More missions**, for example:
  - a storm-hit boat (flooding, bilge pumps, rigging);
  - a lunar rover (O₂, low gravity, constructs).
  
  Each would continue the "broken ring" thread.
- Driving guidance: route signposts, and arrival that reliably completes the
  step (issue class #10).
- A photo mode, a harder "Pro" difficulty, and a level editor.
