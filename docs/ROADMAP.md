# The Mechanics: Roadmap

What's shipped, what's open, and what's next. Keep this short and current.
Playtest problems go in [gameplay-issues.md](gameplay-issues.md), by class.
Design ideas that aren't committed to are in
[GAME_DESIGN.md §9](GAME_DESIGN.md#9-not-built-ideas-for-later).

## Shipped (v1)

Single-player, in the browser, deployed to GitHub Pages from `main`.

- **Two levels**, playable start to finish:
  - *Orientation Day* (`depot`), the tutorial;
  - *The Ridge Job* (`ridge`), with checkpoints, side jobs, lore, and S–D
    grades.
- **Repair model:** machines as data (slots, bolts, covers, terminals,
  fluids, jacks, puzzle panels). Steps are derived from state, and donor
  vehicles can be salvaged.
- **Guidance:**
  - every step names its target, side and progress;
  - the waypoint sits on the part, which glows amber;
  - the rules for hands and rack are built in;
  - Guidance is a setting (auto / always / off).
- **Driving, survival and combat:** raycast vehicles, the quad's rack, cold,
  falls, wolves, flares; fail screens that name the cause and retry from a
  checkpoint.
- **Presentation:**
  - the painterly stylized art pass (materials, sky, grass, solid foliage,
    water, post);
  - the HUD and menus;
  - rebindable controls and gamepad support;
  - accessibility options;
  - foley and synth audio.
- **Browser safety:** no Ctrl binds (crouch is on C, with old saves
  migrated), a leave-page guard, and keyboard lock in fullscreen.
- **Verification:**
  - vitest: unit tests, headless playthroughs of both levels, and the
    guidance bot;
  - browser tools: target audit, player's-eye walkthrough, playtest tour,
    audio check.

## Open

| Item | Where |
|---|---|
| **Driving and travel steps** (issue class #10): routes signposted at junctions, arrival radius matches the waypoint, plus an automated check that every travel beat has a marker and a reachable completion radius | [gameplay-issues.md](gameplay-issues.md) |
| A unit test for the fuse-grid puzzle (currently only covered by playthroughs) | `test/puzzles.spec.ts` |
| Tests for the leave-page guard and keyboard lock (issue class #9 only tests the migration) | `src/client/main.ts` |
| Removing dead prototype constants (`KART_*`, `GATE_SPEED`) | `src/shared/constants.ts` |
| `walkthrough.mjs` for the Ridge after `start`, which needs driving | `tools/walkthrough.mjs` |

## Next (proposed, in order)

1. **Close issue class #10.** Add a driving bot, or a scripted route follower
   through `__mech.intent`, so the descent and the quad rides are checked the
   way the on-foot steps are.
2. **A human playtest round on both levels.** File every finding by class in
   `gameplay-issues.md`, and add a check for each new class.
3. **Performance pass on real hardware** (RTX 5060-class GPU at Medium).
   Record the fps and draw calls at the busiest Ridge views
   (`__mech.stats()`).
4. **Level 2.** Pick a concept from GAME_DESIGN §9 and write its beat list
   in the design doc before building. Reuse `LevelDef`, the machines and the
   guidance contract, and add the new level to the guidance bot and
   targetcheck from day one.

Co-op is a separate, much larger project: it needs a server and netcode that
don't exist today. Don't start it without a design and architecture update.
