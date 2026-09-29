# Gameplay issues — tracked by class

Playtest problems are rarely one-offs: "I couldn't loosen the lug nuts" turned
out to be three different *kinds* of fault that also broke other jobs. So each
problem is filed under a class. Each class has a rule the game follows, a
shared fix (not a per-object patch), and an automated check so it can't come
back quietly. Nothing is fixed by removing depth: five lug nuts stay five lug
nuts. What changes is that the game always makes clear what to do, where, and
how, and that doing it works reliably.

**The main check** is `test/guidance.spec.ts`. A bot plays both levels using
only what a player sees: the waypoint, the next-step glow and the prompt text,
never internal ids. When it gets stuck, the failure names the step. Most of the
problems below were found by it.

| # | Class | Rule | Shared fix | Check | Status |
|---|---|---|---|---|---|
| 1 | Drawn ≠ clickable | A target is exactly where its part is drawn | `Machine.hubPose`, `slotPoint`, `boltPos`; the renderer reads the same pose; nuts hang off the hub, not the rolling tyre | `test/lugnuts.spec.ts`; browser real-mouse check | Fixed (wheels). Other animated parts: audit in P3-3 |
| 2 | Invisible / stale targets | Nothing invisible is clickable | A nut that's off a part being removed has no target | `test/lugnuts.spec.ts` | Fixed |
| 3 | Focus theft | A disabled prompt never beats a usable one under the crosshair | `DISABLED_PENALTY` in `pickFocus`; sticky focus while holding | `test/lugnuts.spec.ts` (wobble), guidance bot | Fixed |
| 4 | Steps without exact targets | Every step names its target(s), its side, and its progress | `Step.targets` from `Machine.nextStep` / `removeStep`; `BeatDef.targets`; the next-step glow | Guidance bot | Fixed for all machine steps, both levels' beats |
| 5 | Inventory dead-ends | One pair of hands: the game says what to do with what you're holding | `World.handsFor` (stow worthwhile parts on a nearby rack, else "put it down (G)"); the rack is a flatbed (take any part by looking at it); "Hands full" shown on the blocked prompt | Guidance bot (Ridge RV raid, battery swap) | Fixed |
| 6 | Multi-part progress | Every repeated action shows its count | Prompt suffix "· 3/5 off"; toast; step text "— 1/5 off"; a nut visibly drops | Guidance bot (stuck detection) | Fixed for bolts; check other repeats in P3-3 |
| 7 | Salvage without guidance | Taking parts off donors is guided like repairs | `Machine.removeStep` | Guidance bot | Fixed (pickup wheel, logging-truck battery) |
| 8 | Waypoint on the wrong spot | The waypoint sits on the next target (floats only when far) | Beat markers use `World.markerFor`; the HUD offset scales with distance | Guidance bot | Fixed (generator cord, station door, racked parts) |
| 9 | Browser shortcuts | No default binding collides with browser shortcuts | Crouch on C (migrated); leave-page confirm; keyboard lock in fullscreen | `test/settings.spec.ts` | Fixed |
| 10 | Driving / travel steps | Routes are signposted; arriving completes the step | — | Needs a driving bot or manual pass | Open |
| 11 | Puzzle panels | A puzzle explains its rule and shows progress | — | Screenshot review | Open (P3-3) |
| 12 | Failure without recovery | Every fail state has a clear retry and a reason | — | Screenshot review | Open (P3-3) |

## Found and fixed by the guidance bot (so far)
- "Inspect" beats had nothing to point at (both levels).
- Jack steps pointed at the wrong interactable ids (pump, lower and pull out).
- "Take off the battery" silently vanished while your hands were full.
- The station-door step's waypoint sat beside the door, not on it.
- Salvaging the pickup wheel showed no progress ("just undo the lug nuts").
- The generator's "pull the cord" waypoint sat on the fuel cap.
- The RV raid looped: two hoses plus a can with one pair of hands, junk
  filling the rack, and the empty can left 400 m away at the sawmill. Fixed
  with haul guidance, "worth keeping" stowing and a spare can at the RV.
- The rack was last-in-first-out, so the part you needed could be buried under
  others.

## How to add to this
When a playtest turns up a problem, first ask which class it belongs to. If
it's a new class, add a row with its rule and a check before fixing the
instance.
