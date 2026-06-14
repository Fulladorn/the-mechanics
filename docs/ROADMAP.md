# The Mechanics — Build Roadmap

**Version:** 1.0 (planning)
**Companion docs:** [`GAME_DESIGN.md`](GAME_DESIGN.md) · [`TECH_ARCHITECTURE.md`](TECH_ARCHITECTURE.md)

---

## Strategy

Build **one complete vertical slice first** — the Garage tutorial + **Level 1
(Summer Mountains)** playable start-to-exfil, in co-op — before replicating the
loop to Ocean and Moon. Because levels are **data-driven** and all gameplay lives
in the shared **deterministic sim**, biomes 2 and 3 are mostly *content + tuning*
on top of proven systems.

Every phase ends with **concrete acceptance criteria** and the **tests** that lock
it in. We don't move on until a phase is green (typecheck + unit + relevant tour).

```
P0 Foundation ─ P1 Movement ─ P2 Multiplayer ─ P3 Interact/Inventory ─ P4 Repair
      │                                                                     │
      └────────────── P7 = FIRST FULLY PLAYABLE LEVEL ◀── P6 Survive/Combat ┘
                              │                                 │
                              ▼                              P5 Drive
                 P8 Ocean ─ P9 Moon ─ P10 Meta/UX/Voice ─ P11 Polish/Ship
```

> **Milestone A — Vertical Slice:** end of **P7** (Garage + Mountains, co-op, full loop).
> **Milestone B — Content Complete:** end of **P9** (all three missions).
> **Milestone C — Ship v1:** end of **P11** (polish, audio, accessibility, deploy).

---

## Phase 0 — Foundation & scaffold
**Goal:** a running skeleton with the architecture's bones in place.

- Scaffold repo: `package.json`, `tsconfig`(+server), `vite.config.ts`, ESLint,
  `index.html`, dir structure from the tech doc.
- `src/shared/` constants + protocol stubs; seeded RNG.
- `src/sim/` empty `World` with fixed-timestep `step()` + snapshot; Rapier WASM
  boots headless (a body falls under gravity in a vitest).
- `src/client/main.ts` renders a Three.js scene (ground + a few boxes), pointer-
  lock camera, render loop interpolated to the sim.
- Docker Compose (postgres + server + client) builds; `JsonFileStore` default.
- **SessionStart hook + CI:** `npm ci && typecheck && test`.

**Acceptance:** `npm run dev` serves a scene you can look around in; `npm test`
passes incl. a Rapier "body falls" determinism check; `docker compose up` builds.
**Tests:** sim boot/determinism smoke; typecheck green.

## Phase 1 — Movement vertical slice (single-player feel)
**Goal:** the signature movement feels great offline.

- Kinematic FP character controller in `sim/movement.ts` (Rapier KCC).
- Walk/sprint/crouch/jump + air control; **bunny-hop/crouch-jump** accel model,
  speed cap, stamina; **hold-to-auto-hop** assist.
- Client prediction path runs the sim locally; render interpolation; basic HUD
  (vitals placeholder), reticle, FOV/sensitivity options.
- A grey-box playground with slopes, gaps, speed-gates to test hopping.

**Acceptance:** chaining crouch-jumps measurably exceeds sprint speed up to a cap;
mistimed hops bleed speed; feels responsive (no input lag thanks to prediction).
**Tests:** unit tests on the accel curve/cap/stamina; a tour that hops the gate
course and asserts traversal time.

## Phase 2 — Multiplayer foundation
**Goal:** two browsers, one authoritative world, smooth co-op presence.

- `ws` server + `session.ts` authoritative loop @30 Hz; intent protocol;
  snapshot assembly (quantized deltas).
- Client `net/`: send intent, reconcile local player, interpolate remotes.
- `lobby.ts`: create lobby → **join code**; party list; host start. Guest names
  (obscenity-filtered).
- Offline↔online switch in `main.ts`.

**Acceptance:** `tools/mp_browser.mjs` launches two clients in one server; each
sees the other move smoothly; local player has no perceptible input lag; killing/
restoring a socket recovers via reconciliation.
**Tests:** headless two-client sync test (positions converge); snapshot-hash
determinism across server vs client sim for the same intent log.

## Phase 3 — Interaction & inventory
**Goal:** the world is manipulable; the toolbelt works.

- `interaction.ts`: look-raycast, context prompts, **`E`** pickup/drop/throw,
  install-target detection.
- `inventory.ts`: 6-slot hotbar (select 1–6/scroll); **heavy carried parts**
  (physics-held, occupy your hands) vs stowable tools/consumables.
- World items spawn from `LevelDef`; networked pickup (server-auth, no dupes).
- HUD hotbar + carried-object indicator; throw physics (toss to a teammate).

**Acceptance:** in co-op, one player picks up a wrench (hotbar) and another carries
a heavy part across the map and drops it on a target; no item duplication; throws
arc believably.
**Tests:** inventory unit tests (slot limits, heavy-part rules); networked pickup
race test (two players grab one item → exactly one wins).

## Phase 4 — Repair core (the heart)
**Goal:** inspect → fix → vehicle becomes drivable.

- `vehicle.ts` **assembly FSM**: systems `MISSING|BROKEN|GO`, `critical` set →
  `drivable`; Repair Checklist HUD bound to FSM + events.
- **Interface puzzle framework** + first three puzzles (wire-match, bolt-torque,
  fuse-grid): seeded, deterministic, networked focus (one player solves, others
  play), colorblind-safe UI.
- **Physics repair steps:** carry-&-seat a part into a socket; brace-under-load
  (`RMB`); pump/crank. One **co-op hero step** with a slower solo substitute.

**Acceptance:** a stub vehicle with ~4 systems goes from broken to **drivable** by
completing puzzles + physics installs, in co-op and solo; checklist updates live
for all players.
**Tests:** FSM transition tests; each puzzle solvable-by-construction + win-check;
"vehicle becomes drivable iff all critical GO" property test.

## Phase 5 — Drive phase
**Goal:** get in, drive, reach exfil, win/lose.

- `vehicle.ts` driving dynamics (Rapier raycast vehicle): throttle/brake/steer,
  **integrity/damage** on impacts, passengers ride along.
- Enter/exit (`E`) → vehicle control scheme; first-person drive cam.
- **Exfil trigger** + win; vehicle-destroyed/team-wipe → lose; results screen
  (integrity %, time).

**Acceptance:** drive the repaired vehicle over grey-box terrain to an exfil
volume → win screen; destroy it → lose screen; passenger can ride.
**Tests:** integrity/damage math; exfil + fail-condition triggers; headless
"drive to exfil" run asserts a win.

## Phase 6 — Survival & combat & revive
**Goal:** stakes — hazards, downed/revive, the rare fight.

- `hazards.ts`: HP/stamina + one exposure meter wired to a biome (Cold for
  Mountains); damage/regen/medkit.
- **Down/revive:** 0 HP → incapacitated; shared countdown; teammate `E` revive;
  all-down/timer-expiry → mission fail.
- `combat.ts`: one enemy archetype (wolf) with telegraph→dodge/block→strike;
  improvised weapon pickup; co-op stagger. Enemy can harass the drive.

**Acceptance:** cold drains away from heat and is restored at a fire/vehicle; a
downed player is revived before the timer (or the team wipes); a wolf can be
fought solo (slow) and faster as a pair.
**Tests:** exposure drain/recover; down/revive/wipe state machine; combat window
math; headless "ignore hazards → eventually down → wipe" run.

## Phase 7 — Level 1 Mountains COMPLETE  ⟵ **Milestone A: Vertical Slice**
**Goal:** one mission, fully playable end-to-end, co-op, with cutscenes.

- Author `content/levels/mountains.ts`: switchback terrain, cliff-creep opener,
  cabins + cave (environmental puzzle → winch + first **lore log**), part/tool
  placements, wolf spawns, exfil lot.
- Garage **training level** (`garage.ts`) teaching every verb safely.
- **Insert/Extract cutscenes** (in-engine FP) + Dispatch VO (placeholder TTS ok) +
  subtitles; loading/narration screen; level select (unlock flow).
- First art pass on the Mountains biome + the 4×4 hero vehicle.

**Acceptance:** from Main Menu → Garage teaches controls → host+join Mountains →
insert cutscene → stabilize/scavenge/repair (puzzles+physics) → drive switchbacks
(wolves harass) → exfil → extract cutscene → results → Mountains marked complete,
Ocean unlocked. Solo and 2–4p both completable.
**Tests:** full headless mission run (start→exfil win); tour screenshots of each
phase; unlock persists in `Store`.

## Phase 8 — Level 2 Ocean
**Goal:** second biome on proven systems (content + new hazards).

- `content/levels/ocean.ts`: wreck-on-rock, debris islands, **whirlpool pull**,
  rising-water hull race, canoe traversal.
- New hazard wiring: **Breath/Wet** swimming + whirlpool force; **shark** enemy
  (defensive, harpoon); **mast hero-lift** co-op step; second **lore log** (salvage
  tech). Add valve-balance/alignment/fuel-mix puzzles as needed.
- Ocean art pass + sailboat hero vehicle + sailing drive (ride the current out).

**Acceptance:** Ocean completable solo & co-op; whirlpool/shark/hull-race read
clearly; sailing-out drive works; Moon unlocks on completion.
**Tests:** ocean headless run; whirlpool force + breath drain units; shark
encounter; tour screenshots.

## Phase 9 — Level 3 Moon  ⟵ **Milestone B: Content Complete**
**Goal:** third biome + the mystery tease payoff.

- `content/levels/moon.ts`: low-gravity tuning, oxygen economy + refill tanks,
  airlock egress (co-op hero / solo override), crater field, nav-site.
- **Construct** enemy (shielded combat puzzle) bearing the **mystery symbol**;
  hidden buried structure → final v1 **lore log** + sequel hook; **degraded
  Dispatch VO**. Low-grav supercharges bunny-hop (traversal reward).
- Moon art pass + rover/ascent hero vehicle + low-grav drive/launch to pad.

**Acceptance:** Moon completable solo & co-op; oxygen pressure + low-grav feel
right; constructs fightable; full mystery breadcrumb (symbol across all 3 levels)
pays off into the sequel tease; all-levels-complete → free replay any order.
**Tests:** moon headless run; oxygen drain/refill + low-grav movement units;
construct combat; lore-collection unlock.

## Phase 10 — Meta, UX & voice
**Goal:** the connective tissue and social layer.

- Full **menu/screen flow**, pause, settings (Video/Audio/**Controls remap**/
  **Accessibility**: colorblind, auto-hop, FOV, headbob, aim assist, subtitles).
- **Postgres profiles**: accounts (scrypt + bearer) or guest profiles; unlocks +
  cosmetics persisted; level select gating.
- **Proximity voice** (WebRTC mesh) with push-to-talk/toggle + spatial gain;
  ping/emote wheel.
- Drop-in between missions; host migration not required (dedicated server).

**Acceptance:** rebind keys & toggle accessibility and it sticks; progression
persists across sessions/devices via account; nearby teammates hear each other
spatially; a friend joins a lobby by code from a shared link.
**Tests:** settings persistence; lobby join-by-code E2E; voice signaling unit
(gain vs distance); profile store CRUD.

## Phase 11 — Polish & ship  ⟵ **Milestone C: v1**
**Goal:** make it sing and put it online.

- Art/juice pass (VFX, screenshake, squash, "system GO" feedback), audio pass
  (adaptive music, full SFX families, Dispatch VO), performance pass to 60 fps
  budget (instancing, merged geo, draw-call audit, snapshot bandwidth).
- Balance pass across all missions (solo & 4p); bug bash via tours + soak runs.
- Deploy: production Docker (client static + server + Postgres) behind the chosen
  web network policy; real join-by-link.

**Acceptance:** 60 fps on a mid laptop; clean run of full test suite + all tours +
multi-mission soak; a stranger can open the URL, party up by code, and finish all
three missions. Ship.

---

## Cross-cutting (every phase)
- **Determinism guard** (snapshot-hash test) stays green — it protects the whole
  architecture.
- **Headless run + tour** added/updated for new content so the verify loop always
  covers the latest.
- **Solo substitute** exists for any co-op-gated step.
- Typecheck + lint + unit green before a phase is "done."

## Suggested immediate next step
Execute **Phase 0** (scaffold) and **Phase 1** (movement) to stand up a thing you
can run around in this week, then demo the feel before investing in netcode.
