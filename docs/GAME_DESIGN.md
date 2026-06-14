# The Mechanics — Game Design Document

**Version:** 1.0 (planning)
**Owners:** Aaron & Steven
**Status:** Design locked for v1; open items flagged `(future)`.

---

## 1. Vision & Pillars

**The Mechanics** is a first-person, 1–4 player co-op survival puzzle game. A
team of contracted mechanics is dropped into a hostile remote location to repair
a derelict vehicle and drive it to safety. Every mission is a self-contained
adventure with its own biome, vehicle, hazards, and a thread of an unfolding
mystery.

### Design pillars (every feature serves at least one)

1. **Tactile, wonky repair.** Fixing the vehicle is physical and hands-on —
   carrying awkward parts, holding things in place, and solving hands-on
   interface puzzles. Physics is intentionally a little janky and funny
   (Surgeon Simulator / Totally Reliable Delivery Service).
2. **Co-op by design, solo-possible.** The best moments need two pairs of hands
   (one holds, one bolts; one drives, one defends). Solo players get scaled
   assists, never a wall.
3. **Skill-rewarding movement.** Fast-paced traversal with a real skill ceiling:
   crouch-jump / bunny-hop chaining for speed. Mastery is optional but feels great.
4. **Readable pressure.** Survival systems and rare combat create stakes without
   becoming a hardcore survival sim. Clear timers, clear threats, clear recovery.
5. **Streamable & social.** Easy to host/join (share a URL + code), proximity
   voice, readable on stream, full of emergent comedy.

### What this game is NOT (scope guardrails for v1)

- Not an open world. Levels are bounded, handcrafted scenes.
- Not a deep crafting/economy sim. No money, no tech trees. Gather → fit → fix.
- Not a base-builder. You repair *a* vehicle, you don't build settlements.
- Not PvP. All conflict is co-op vs. environment/enemies.

---

## 2. Player Experience

### 2.1 Core loop

```
        ┌─────────────────────────────────────────────────────────┐
        │  INSERT (cutscene)  →  ASSESS  →  SCAVENGE  →  REPAIR     │
        │        ▲                                         │        │
        │        │                                         ▼        │
        │   next mission  ◀──  EXTRACT (cutscene)  ◀──  DRIVE       │
        └─────────────────────────────────────────────────────────┘
                    (DEFEND / SURVIVE runs underneath all phases)
```

1. **Insert.** Short first-person cutscene drops the team in. Narrator ("Dispatch")
   briefs the situation. Smoothly hands control to the player.
2. **Assess.** Inspect the broken vehicle. A **Repair Checklist** populates with
   the systems that are missing or broken.
3. **Scavenge.** Explore the bounded biome for compatible parts and tools. Solve
   optional **environmental puzzles** for bonus items/lore.
4. **Repair.** Install/fix each system via **interface puzzles** (mouse/keyboard
   minigames) and **physics challenges** (carry/align/hold). Some steps are
   co-op-gated.
5. **Drive.** Once all *critical* systems are GO, the vehicle is drivable.
   Navigate biome terrain to the **exfil point** with minimal damage.
6. **Extract.** Short outro cutscene. Results screen. Unlock next mission.

**Survive/Defend** is the connective tissue: environmental hazards and rare
enemy encounters threaten the team throughout. A downed teammate becomes the
group's most urgent objective.

### 2.2 Session shape

- Target **15–30 min** per mission. Assess+Scavenge+Repair is ~70% of the time;
  Drive is a tense ~20%; cutscenes/results ~10%.
- **No mid-mission save.** A mission is a contiguous sit-down. You resume at the
  *start* of your furthest-reached mission, not mid-run (see §11).

### 2.3 Fail & recovery

- **Down, not dead.** At 0 HP a player is **incapacitated** (ragdoll/crawl),
  not removed. A shared **revive countdown** appears to everyone.
- **Wipe condition.** If all players are down simultaneously, or the
  incapacitation timer expires with no living teammate, the mission **fails** and
  restarts from the insert cutscene (skippable on retry).
- **Vehicle destruction.** If the vehicle is destroyed (e.g., falls off the
  cliff in Mountains, sinks in Ocean), mission fails.

---

## 3. Mechanics

### 3.1 Movement & feel

First-person. Movement is the most-used verb in the game and must feel crisp and
a little springy.

| Action | Default bind | Notes |
|---|---|---|
| Move | `W A S D` | Air control while jumping enables bunny-hop steering |
| Look | Mouse | FOV + sensitivity configurable; headbob toggle |
| Jump | `Space` | Hold-buffered; see bunny-hop below |
| Sprint | `Shift` | Drains stamina; not needed if you can bunny-hop |
| Crouch | `Ctrl` / `C` | Crouch-jump raises clearance & feeds hop speed |
| Use / Primary | `LMB` | Use held tool, operate puzzle, attack |
| Block / Secondary | `RMB` | Guard in combat; brace/steady a held object |
| Interact / Pickup | `E` | Single context button — pick up, install, enter vehicle |
| Flashlight | `F` | Toggle; matters in caves, night, moon shadow |
| Proximity voice | `V` (push) / `T` (toggle) | Spatialized to teammates nearby |
| Drop / Throw | `G` | Drop held item; hold to throw (physics fun) |
| Hotbar select | `1`–`6` / scroll | Toolbelt slots |
| Map / Objectives | `Tab` (hold) | Shows checklist, waypoint, teammates |
| Emote / Ping | `Q` | Contextual ping ("part here", "help", "go") |

**Bunny-hop / crouch-jump (signature mechanic).**
- Landing and immediately re-jumping preserves and slightly builds horizontal
  speed; steering mid-air with `A`/`D` + mouse converts to acceleration up to a
  cap. Mistimed hops bleed speed.
- This is **deterministic and server-validated** (see tech doc) so it's fair in
  co-op and can't be trivially cheated.
- **Biome modifiers** change the hop feel: ice = higher top speed + drift; moon =
  floaty, huge arcs, low gravity; ocean deck = cramped, wet, less reliable.
- Accessibility: a **"hold to auto-hop"** assist preserves the speed benefit for
  players who can't time it, keeping the skill *optional*.

### 3.2 Objects, inventory & the toolbelt

- **One interact button** (`E`) picks up world items into the **hotbar/toolbelt**
  — a small, always-visible row of slots (6). Deliberately tiny so choices matter.
- **Two-handed/heavy parts** (engine block, mast, rover battery) are **not**
  stowed — you physically **carry** them with wonky physics, blocking your other
  hands. This is the source of co-op carry comedy and "you hold, I bolt" moments.
- Items have **types**: tools (wrench, welder, jack, pump, flashlight), consumables
  (medkit, O2 canister, fuel), and **parts** (vehicle-specific). Parts only fit
  compatible sockets.
- **Dropping/throwing** is physical and encouraged (toss a wrench to a teammate on
  the cliff edge).

### 3.3 The repair system (the core verb)

Each vehicle is a **graph of systems**. A system is `MISSING`, `BROKEN`, or `GO`.
The vehicle becomes **drivable** when all systems tagged `critical` are `GO`;
`optional` systems improve the drive (speed, durability, lights).

**Resolving a system:**
- `MISSING` → find a **compatible part** in the biome and install it (carry +
  socket + fasten).
- `BROKEN` → repair in place via an **interface puzzle** and/or **physics step**.

**Interface puzzles** (diegetic minigames, mouse-led, some keyboard). v1 catalog:
1. **Wire-match** — connect colored leads to matching terminals without crossing.
2. **Bolt torque** — rotate each bolt to the green torque band; over/under fails.
3. **Fuse grid** — route power through a small node grid to light all loads.
4. **Valve balance** — drag sliders to balance pressure gauges into the safe zone.
5. **Alignment** — rotate/seat a part so keyed tabs line up (lockpick-ish).
6. **Fuel mix** — hit a target ratio under a wobbling needle.

Puzzles are **parameterized by difficulty** (terminal count, tolerance, time
pressure) and **seeded** so every player in a session sees the same puzzle.

**Physics challenges** (Surgeon-Simulator energy):
- **Carry & seat** a heavy part into its socket (awkward mass, momentum).
- **Jack & hold** — lift the vehicle/part; ideally one holds while another works
  (solo: a deployable prop stand, slower).
- **Brace under load** — `RMB` to steady a wobbling part while it's fastened.
- **Pump/crank** — rhythmic `LMB` to inflate/pressurize/wind.

**Co-op gating.** Some steps are *faster* with two players and a few *hero* steps
(e.g., lowering the Ocean mast, holding the Moon airlock) **require** a second
pair of hands — solo players get a slower mechanical substitute (a clamp, a prop)
so they're never hard-blocked, but co-op is clearly better.

### 3.4 The drive phase

- Entering the repaired vehicle (`E`) shifts to a **vehicle control scheme**
  (throttle/brake/steer; biome-specific: sail trim, rover thrusters).
- The vehicle has **damage/integrity**. Terrain, impacts, and hazards chip it;
  reaching exfil with more integrity scores higher (and is required above a floor —
  total destruction = fail).
- **Passengers** ride along, can lean out to repair-on-the-move, use the
  flashlight, shoot/defend, or call hazards. Driving is a team sport.
- Biome physics defines the challenge: mountain switchbacks & cliffs; sailing a
  current out of a whirlpool; low-grav rover hops across craters.

### 3.5 Survival systems

A small set of legible meters, **contextual per biome** (only the relevant ones
show):

- **Health (HP).** Damaged by falls, impacts, hazards, enemies. Regen slowly out
  of danger; medkits heal burst.
- **Stamina.** Sprint/climb/carry drain; gates spammy movement but bunny-hop is
  stamina-free (rewarding skill over sprint-holding).
- **Exposure (biome meter).**
  - *Mountains:* **Cold** at altitude/night; warm at fire/cabin/vehicle.
  - *Ocean:* **Breath** while underwater + **Wet/Cold**; the **whirlpool pull**
    drags loose objects and swimmers.
  - *Moon:* **Oxygen** (suit O2; refill at tanks/airlocks) + vacuum/temperature.
- **Incapacitation.** At 0 HP → downed, shared revive timer (default 60s,
  configurable `future`). Teammate holds `E` to revive; reduces your max HP
  briefly (discourages chain-downs).

### 3.6 Combat (rare, real-time, co-op)

Combat is the **spice, not the meal** — occasional, tense, and usually optional
to *seek* but sometimes forced (a guardian blocks a critical part; something
attacks the vehicle on the drive).

- **You need a weapon**, and you don't start with one — improvised (wrench, flare,
  harpoon on Ocean, welding torch) found in the biome.
- **Real-time reactions:** telegraphed enemy attacks you **dodge** (movement) or
  **block** (`RMB`); openings to strike (`LMB`).
- **Designed for teamwork:** enemies have stagger/weak points that are hard to
  exploit solo — one bait/blocks, another flanks. Solo encounters are tuned down
  but slower.
- **Enemy archetypes (v1):**
  - *Mountains:* territorial **wolves/boar** (pack pressure, hit-and-run).
  - *Ocean:* **shark** (lunges at swimmers & hull; harpoon to repel).
  - *Moon:* malfunctioning **maintenance drones** / the mystery's **constructs**
    (ranged zaps, shielded; tie into the story beat).

### 3.7 Tools & gadgets from "the Company"

The Company issues traversal/utility gear, introduced one per level so each biome
teaches a toy:
- **Mountains:** **dirt bike / scooter** (fast traversal, can carry one part on a rack).
- **Ocean:** **canoe / dinghy** (cross water between debris islands; can capsize).
- **Moon:** **grapple-tether or jetpack burst** (cross craters; low-grav synergy).

(These are *traversal aids*, distinct from the *mission vehicle* you repair.)

---

## 4. Story & Narrative

### 4.1 Premise

You're an elite contractor mechanic for **"the Company"** (call-sign *Dispatch*).
The job is simple and the questions are discouraged: go to the coordinates, fix
the vehicle, deliver it. No mention of *why* these vehicles are where they are,
or who left them.

### 4.2 The mystery thread (the hook under the comedy)

Across the three missions, environmental details imply you're not the first team
here, and the Company isn't telling you everything: pre-cut wires that look
*sabotaged*, a hidden cave door in the Mountains, salvaged tech on the Ocean wreck
that shouldn't exist, and on the Moon, **degraded comms** and automated
**constructs** guarding the site. Optional environmental puzzles reward lore
fragments ("recovered logs") that slowly reveal an unseen **Entity/Group** — the
real owners of these vehicles. v1 *teases* the reveal; full payoff is `future`
content. This gives streamers theory-craft fuel and justifies the escalating
weirdness Mountains → Ocean → Moon.

### 4.3 Tone

Comedic-competent. Dispatch is dry, a little shady, and increasingly evasive when
you ask about the weird stuff. The team banters (proximity voice does most of this
organically). Danger is real but the physics are funny.

### 4.4 Cast

- **The Mechanics (players).** Customizable contractors in colored jumpsuits +
  hard hats; exaggerated proportions, ragdoll-prone. Cosmetic-only differences.
- **Dispatch (the Narrator).** Voice-only handler over the headset. Guides via
  VO, reacts to events, deflects questions about the mystery. Degrades on the Moon.
- **The Entity / "the Others" (`future` reveal).** Unseen owners of the vehicles.
  Presence felt via environment (hidden doors, sabotage, constructs), never shown
  in v1.
- **Hazard fauna/constructs.** Per-biome enemies (§3.6), low on personality, high
  on threat.

### 4.5 Cutscenes (in-engine, first-person)

All cutscenes are **in-engine, first-person**, transitioning seamlessly into
gameplay (no camera cut to a different rig). Skippable after first view.

- **Insert (~≤30s):** establish biome + immediate stakes, then hand over control.
- **Extract (~≤15s):** congratulations from Dispatch, light transition, results.

Per-level scripts and storyboards live in §6 and `content/narrative.ts`.

---

## 5. Game World

### 5.1 Structure

Three discrete, handcrafted **missions** (levels), each a bounded scene with a
loading screen + narrated transition between them. No shared overworld; the
"world" is the set of jobs the Company sends you on.

| # | Mission | Vehicle to repair | Biome hazard | Traversal toy | Mood |
|---|---|---|---|---|---|
| 0 | **Garage (training)** | A go-kart / the van | none (safe) | — | tutorial, cozy |
| 1 | **Summer Mountains** | Off-road 4×4 on a cliff edge | cold, falls, wolves | dirt bike | bright, vertiginous |
| 2 | **Ocean** | Sailboat wrecked on a rock | drowning, whirlpool, shark | canoe | tense, wet |
| 3 | **Moon** | Lunar rover / ascent craft | oxygen, low-grav, constructs | grapple/jetpack | eerie, mysterious |

### 5.2 Training level — "The Garage"

A safe, enclosed Company garage. Teaches: move/look, **bunny-hop lane** (speed
gates that reward hopping), interact/pickup, hotbar, one of each puzzle type on a
practice bench, carry-a-part, and "enter & drive" a go-kart around a short loop.
No fail state. Co-op tutorialization: a two-person lift station. Ends by "clocking
in" → mission select.

---

## 6. Levels (detailed)

> Each level is **data-driven** (`content/levels/*.ts`): spawn, terrain ref,
> part/tool placements, puzzle seeds, hazard zones, enemy spawns, exfil trigger,
> cutscene script. Maps below are design intent; exact layouts iterate in-engine.

### 6.1 Level 1 — Summer Mountains

**Synopsis.** The team rides in the back of a Company van up a mountain switchback.
Dispatch briefs them: a client's classic **4×4 is rolling toward a cliff edge** and
must be recovered. The van doors swing open *for* you and the cutscene hands over
control with the 4×4 right there, parking brake failing.

**Intro material & how delivered.** Insert cutscene (van interior → doors open →
reveal). Dispatch VO sets the goal. The Repair Checklist appears on first
inspection of the 4×4.

**Objectives.**
1. **Stabilize** the 4×4 so it stops creeping toward the edge (urgent physics
   step: chock the wheels / winch to a tree — a timed co-op-friendly opener).
2. Repair critical systems: **wheel** (missing — find spare), **battery** (broken
   — fuse-grid puzzle), **fuel line** (broken — valve-balance + carry a jerry can),
   **brakes** (broken — bolt-torque, the obvious thematic must-fix).
3. Optional: **winch** & **roof lights** (optional systems; help the drive).
4. **Drive** down the switchbacks to the extraction lot without going over an edge.

**Details / beats.**
- Hidden **cabins** hold tools (the welder, a medkit) and a **spare wheel**.
- A **cave** (flashlight) hides the level's **environmental puzzle** → reward:
  the **winch part** + first **lore log** (a previous team's note + an *odd* symbol).
  This is the first whisper of the mystery.
- **Wolves** roam the treeline; they harass solo scavengers and can attack the
  vehicle during the drive (a passenger with the found **flare/wrench** repels them).
- **Cold** rises near the peak/at dusk; cabins & the van are warm-up points.

**Map (intent).** A descending series of switchback roads hugging cliffs; the 4×4
near the top edge; cabins/cave as off-path detours; extraction lot at the bottom.

**Critical path.** Stabilize → gather wheel + fuel → fix battery/fuel/brakes →
drive down → exfil. (Winch/cave/lights optional but recommended.)

**Encounters.** *Important:* the cliff-creep opener; the cave puzzle; wolf
ambush on the lower road during the drive. *Incidental:* scenic falls hazards,
loose-rock physics gags.

### 6.2 Level 2 — Ocean

**Synopsis.** A helicopter circles a churning **whirlpool**; at its center a
**sailboat** is impaled on a rock. Dispatch explains the client wants the boat —
and its "cargo" — recovered before the vortex claims it. The team fast-ropes onto
the pitching deck.

**Intro material.** Insert cutscene (heli circling → drop to deck). Whirlpool pull
and **Breath/Wet** meters introduced by VO + first swim.

**Objectives.**
1. **Stop the sinking:** patch the **hull breach** (carry a board + pump-puzzle to
   bail; brace under load) before water rises too far — soft timer via rising water.
2. Repair critical systems: **mast/rigging** (missing boom + alignment puzzle — a
   co-op hero lift), **sail** (broken — wire-match-style rigging/knots), **rudder**
   (broken — bolt-torque underwater, manage Breath), **bilge pump** (valve balance).
3. Optional: **motor** (lets you fight the current faster on the drive).
4. **Sail** out along the **current spiral** to the waiting heli/rescue ship —
   reading the whirlpool's flow is the drive challenge.

**Details / beats.**
- Floating **debris islands** (Raft-like) around the wreck hold parts/tools; the
  **canoe** ferries you between them across shark water.
- A **shark** stalks swimmers and rams the hull; a salvaged **harpoon** (found on a
  debris island) repels it — combat is mostly *defensive*.
- The wreck's hold contains **salvage tech that shouldn't be there** → second
  **lore log**, deepening the mystery (the same odd symbol, now on machined metal).
- **Whirlpool pull** scales toward the center: dropped parts drift, swimmers get
  tugged — keep critical parts on deck.

**Map (intent).** Central rock+wreck; concentric ring of debris islands; an outer
calmer band where the current can be ridden out; shark roams the mid-band.

**Critical path.** Patch hull → ferry/gather mast+rudder parts → fix mast/sail/
rudder/pump → ride the current out → exfil. (Motor optional.)

**Encounters.** *Important:* rising-water hull race; shark vs. swimmers/hull; the
mast hero-lift. *Incidental:* capsizing the canoe, slippery-deck physics gags.

### 6.3 Level 3 — Moon

**Synopsis.** The team wakes **inside an unfamiliar pressurized vehicle** on the
lunar surface, other players visible across the cabin. Dispatch's briefing comes
through **degraded and glitching** — something's interfering. The cutscene ends
with the team *still aboard*: **you** have to work the airlock to get out.

**Intro material.** Insert cutscene (cabin interior, garbled VO). **Oxygen** &
**low-gravity** taught immediately; the very first interaction is the **airlock**
(a co-op-hero hold-and-cycle, solo: slow manual override).

**Objectives.**
1. **Egress:** cycle the airlock (intro physics/co-op beat).
2. Repair critical systems on the **rover/ascent craft**: **O2 scrubber** (missing
   canister + valve balance — also your survival lifeline), **power cell** (broken —
   fuse grid), **thruster/wheel assembly** (alignment + heavy carry in low-g),
   **nav computer** (wire-match, glitchy — ties to the interference).
2b. **Manage Oxygen** the entire time: O2 tanks/airlocks are refill points; running
    out starts HP drain.
3. Optional: **lights/comms booster** (cuts through interference → cleaner Dispatch).
4. **Drive/launch** across cratered terrain to the **extraction pad** (or trigger
   the ascent) — low-grav rover hops over craters, manage fuel/integrity.

**Details / beats.**
- Low gravity supercharges **bunny-hop** (huge floaty arcs) — traversal feels great
  and is the mechanical reward for mastering hops earlier.
- **Maintenance/alien constructs** guard a key part and patrol the nav site;
  they're shielded (combat puzzle — break shield, then strike) and tie directly to
  the mystery — the **constructs bear the same symbol** from Levels 1–2.
- A **buried structure / hidden door** (the environmental puzzle, callback to the
  Mountains cave) yields the final v1 **lore log**: enough to confirm the Company
  has been sending teams to recover **the Entity's** vehicles — and to tease that
  the *next* job is different. (Sequel hook; v1 ends here.)
- **Oxygen + vacuum** make every detour a resource decision; co-op can share O2.

**Map (intent).** Landing site (start craft) → crater field with refill tanks →
nav-site (constructs + hidden structure) → extraction pad. Mostly static moonscape,
dramatic Earth on the horizon.

**Critical path.** Egress → gather O2/power/thruster parts (fight/avoid constructs)
→ fix scrubber/power/thruster/nav → cross craters → exfil/launch.

**Encounters.** *Important:* airlock egress; construct guardian fight; the hidden
structure reveal. *Incidental:* low-grav overshoot comedy, oxygen scares.

---

## 7. Interface & UX

### 7.1 HUD (diegetic-leaning, minimal)

- **Toolbelt/hotbar** (bottom center): 6 slots, selected highlighted, held-item icon.
- **Vitals** (bottom left): HP ring; Stamina arc; contextual Exposure meter
  (Cold/Breath/Oxygen) only when relevant.
- **Repair Checklist** (top right, collapsible): systems with `MISSING/BROKEN/GO`
  state and part hints; expands on `Tab`.
- **Teammate strip** (top left): each ally's name, HP, downed timer, ping/voice
  indicator.
- **Context prompt** (center): "`E` Pick up Spare Wheel", "`E` Install", etc.
- **Reticle** changes by context (look/use/grab/repair).
- **Objective banner & waypoint:** current goal + compass marker to next critical
  thing / exfil.
- **Subtitles** for all VO (on by default).

### 7.2 Puzzle UI

Interface puzzles open a **focused diegetic panel** (the open fuse box, the wiring
loom) — cursor unlocks, movement pauses for that player (others keep playing — so
co-op covers/defends while one wrenches). `Esc` backs out (progress on partial
puzzles persists where it makes sense). Colorblind-safe coding: never color alone
— always shapes/labels too.

### 7.3 Screen flow

```
Boot/Splash
   └─> Main Menu ──> Settings (Video / Audio / Controls / Accessibility)
        │            Credits
        │
        ├─> Play (Solo)        ─┐
        └─> Co-op ──> Lobby ────┤  host creates code / join by code
                                │  party list, level select (unlocked only),
                                │  ready-up, host starts
                                ▼
                       Loading + Narration (mission insert text/anim)
                                ▼
                       Insert Cutscene (in-engine)
                                ▼
                          GAMEPLAY  ⇄  Pause Menu (Resume/Settings/Leave)
                                ▼
                       Extract Cutscene
                                ▼
                       Results (integrity %, time, bonuses, lore found)
                                ▼
                    back to Lobby / Level Select  (next mission unlocked)
```

### 7.4 Camera

First-person throughout (incl. cutscenes & driving, with a configurable optional
chase cam for vehicles `future`). FOV slider, headbob/screenshake toggles, motion-
sickness comfort options.

### 7.5 Controls — see §3.1 for the full bind table. All binds remappable.

---

## 8. Art Direction

- **Style:** colorful, cartoony, slightly exaggerated proportions; soft shadows;
  readable silhouettes; physics that look a touch rubbery on purpose. Reference:
  *Surgeon Simulator*, *Totally Reliable Delivery Service*, *Raft*.
- **Characters:** chunky jumpsuited mechanics, hard hats, big gloves (sells the
  tactile carry). Ragdoll on down/impact for comedy.
- **Vehicles:** the hero props per level — characterful, clearly "broken→fixed"
  readable, with visible part sockets.
- **Procedural-first assets:** runtime-generated textures and code-built props/rigs
  (matches the proven pipeline), with **curated open-source glTF** for hero models
  (vehicles) and **HDRIs** for skies, optimized via `@gltf-transform/cli`.
- **Biome palettes:** Mountains = warm greens/blues + golden hour; Ocean = teal/
  grey storm + foam; Moon = monochrome greys + black sky + blue Earth + eerie
  construct glow.
- **Juice:** impact pops, dust/sparks/water VFX, squashy part-seating feedback,
  satisfying "system GO" chimes.

## 9. Audio

- **Positional audio** (Three.js `PositionalAudio`) for world SFX; **proximity
  voice** (WebRTC) spatialized to in-world distance with push-to-talk/toggle.
- **Narrator (Dispatch) VO** per mission — pre-recorded lines (placeholder TTS in
  dev), with the **Moon set deliberately degraded/filtered**.
- **Adaptive music:** ambient bed per biome; tension stinger on enemy/hazard;
  triumphant sting on "system GO" and exfil.
- **SFX families:** tools (wrench clinks, welder hiss, pump), physics (clonks,
  splashes, ragdoll), UI, biome ambience (wind, surf, vacuum silence + suit
  breathing).
- **Accessibility:** master/music/SFX/voice sliders; mono toggle; subtitles &
  captioned key SFX.

## 10. Accessibility & Options

- **Video:** resolution scale, quality preset, FOV, headbob/shake toggles,
  brightness, colorblind modes.
- **Audio:** category sliders, subtitles, mono, visualized callouts.
- **Controls:** full remap, mouse sensitivity, **hold-to-auto-hop** assist, toggle
  vs. hold for crouch/sprint/voice, aim assist for combat.
- **No difficulty setting at launch** (single tuned experience); architecture
  leaves room for difficulty modifiers (revive timer, hazard rate, enemy HP) as
  `future`.

## 11. Progression, Saving & Multiplayer Social

- **Unlock-based progression:** completing mission *N* unlocks *N+1*. Once all are
  beaten, **any** mission is replayable in any order.
- **No mid-mission save.** You start from the beginning of your furthest-reached
  (or any unlocked) mission.
- **Host & party:** a host opens a lobby with a **join code** (Discord-friendly);
  invited players continue from the **start of the host's selected unlocked
  mission**. Progress is tracked per-account (or per-guest-profile locally).
- **Drop-in/-out:** players can join an in-progress lobby between missions; mid-
  mission join is `future` (spectate-then-spawn at next checkpoint).
- **Cosmetic unlocks** (jumpsuit colors, hard-hat decals) for completing missions /
  finding all lore — purely visual, no power. No money/economy (per design).

## 12. Open Questions & Future Work

- Mid-mission drop-in spawning rules.
- Difficulty modifiers / a "Pro" mode (timer, permadeath-of-mission).
- Full mystery payoff & a 4th "different" mission (sequel hook planted in Moon).
- Photo mode / spectator for streamers.
- Level editor / Steam-or-native wrapper (`future`, web-first for now).

---

*This GDD is the “what.” See [`TECH_ARCHITECTURE.md`](TECH_ARCHITECTURE.md) for the
“how” and [`ROADMAP.md`](ROADMAP.md) for the build order.*
