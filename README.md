# The Mechanics

> You and your friends are an expert team of Mechanics. You get dropped into
> remote, hostile locations to repair a vehicle and drive it to safety. Gather,
> build, repair, survive — then get out.

**The Mechanics** is a 1–4 player co-op survival puzzle game that runs in the
browser. Each mission drops your team into a different environment (Summer
Mountains, Ocean, the Moon), where you scavenge parts, solve hands-on repair
puzzles with wonky physics, fend off the occasional threat, and then drive the
fixed-up vehicle to the exfil point — all while staying alive against the
elements.

Think **Surgeon Simulator**'s tactile chaos meets **Raft**'s co-op survival and
**The Long Drive**'s "fix it and go" loop, with the cartoony jank of **Totally
Reliable Delivery Service**.

---

## Status

🟢 **Playable: the Garage (training level).** A single-player vertical slice is
up and running — first-person movement with **bunny-hopping**, look-to-interact
**pickup + toolbelt**, a **wire-match repair puzzle**, **carry-and-install** an
engine, and **driving a go-kart** through a checkpoint loop, all tied together
with tutorial objectives and a "clock out" finish. Co-op netcode and the three
real missions come next, per the roadmap.

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — the complete game design document (what we're building)
- [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) — the engineering plan (how we build it)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased milestones, vertical slice first, with acceptance criteria

## The pitch in one screen

| | |
|---|---|
| **Genre** | Co-op survival puzzle (first-person) |
| **Players** | 1–4, drop-in via lobby join code (solo-playable, co-op-tuned) |
| **Session** | ~15–30 min per mission |
| **Audience** | Streamers & Discord groups — share a URL, share a code, play |
| **Loop** | Drop in → scavenge → repair (puzzles + physics) → defend → drive to exfil |
| **Hook** | Skill-based movement (bunny-hop/crouch-jump), tactile co-op repairs, a creeping mystery |
| **Style** | Colorful, cartoony, deliberately wonky physics |
| **Platform** | Web (TypeScript + Three.js); no install, no download |

## Tech at a glance

- **Client:** TypeScript + Vite + Three.js (procedural-first art)
- **Physics:** Rapier (WASM), shared deterministically by client & server
- **Server:** Authoritative Node.js + WebSockets, fixed-tick simulation
- **Shared core:** One DOM-free deterministic `sim/` runs on client (prediction), server (authority), and headless (tests/CI)
- **Voice:** WebRTC mesh with in-world proximity gating
- **Persistence:** Postgres (JSONB profiles); progression is level unlocks only — no mid-mission save
- **Verification:** vitest unit suite + Puppeteer headless multi-client E2E + screenshot tours

See [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md) for the full rationale.

## Quick start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
# open it, click CLOCK IN, and play the training bay
```

Other scripts:

```bash
npm test           # vitest: movement, puzzle, and a full headless playthrough
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
npm run shot       # headless screenshot smoke test (needs: npm i -D puppeteer)
```

**Controls:** `WASD` move · mouse look · `Space` jump (hold to bunny-hop) ·
`Shift` sprint · `Ctrl` crouch · `E` interact/pickup · `G` drop · `1–6`/scroll
toolbelt. Build speed by holding `Space` and air-strafing (`A`/`D` + mouse) to
open the speed gate.

## Repository layout

```
the-mechanics/
├── docs/            # design + engineering plan (start here)
├── src/
│   ├── shared/      # protocol, types, constants, math (no deps on client/server)
│   ├── sim/         # deterministic, DOM-free game core (the source of truth)
│   ├── client/      # Three.js renderer, input, netcode, UI, audio, voice
│   └── server/      # ws server, lobby, authoritative sim sessions, persistence
├── content/         # data-driven levels, parts catalog, narrative scripts
├── headless/        # headless sim runner for tests / automation
├── test/            # vitest specs + Puppeteer tours
└── tools/           # dev scripts (visual tour, multi-client harness)
```

## License

TBD. Third-party art assets retain their own licenses (tracked in
`content/assets/CREDITS.md` once added).
