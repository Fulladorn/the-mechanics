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
| 1 | Drawn ≠ clickable | A target is exactly where its part is drawn, and everything you can use has a drawn part to highlight | `Machine.hubPose`, `slotPoint`, `boltPos`; the renderer reads the same pose; nuts hang off the hub; yawed slots place their bolts in slot space; every station and cover maps to a drawn object | `test/lugnuts.spec.ts`; `node tools/targetcheck.mjs` (every target in both levels, as found and opened up) | Fixed |
| 2 | Invisible / stale targets | Nothing invisible is clickable | A nut that's off a part being removed has no target | `test/lugnuts.spec.ts` | Fixed |
| 3 | Focus theft | A disabled prompt never beats a usable one under the crosshair | `DISABLED_PENALTY` in `pickFocus`; sticky focus while holding | `test/lugnuts.spec.ts` (wobble), guidance bot | Fixed |
| 4 | Steps without exact targets | Every step names its target(s), its side, and its progress | `Step.targets` from `Machine.nextStep` / `removeStep`; `BeatDef.targets`; the next-step glow | Guidance bot | Fixed for all machine steps, both levels' beats |
| 5 | Inventory dead-ends | One pair of hands: the game says what to do with what you're holding | `World.handsFor` (stow worthwhile parts on a nearby rack, else "put it down (G)"); the rack is a flatbed (take any part by looking at it); "Hands full" shown on the blocked prompt | Guidance bot (Ridge RV raid, battery swap) | Fixed |
| 6 | Multi-part progress | Every repeated action shows its count | Prompt suffix "· 3/5 off"; toast; step text "— 1/5 off"; a nut visibly drops | Guidance bot (stuck detection) | Fixed for bolts; check other repeats in P3-3 |
| 7 | Salvage without guidance | Taking parts off donors is guided like repairs | `Machine.removeStep` | Guidance bot | Fixed (pickup wheel, logging-truck battery) |
| 8 | Waypoint on the wrong spot | The waypoint sits on the next target (floats only when far) | Beat markers use `World.markerFor`; the HUD offset scales with distance | Guidance bot | Fixed (generator cord, station door, racked parts) |
| 9 | Browser shortcuts | No default binding collides with browser shortcuts | Crouch on C (migrated); leave-page confirm; keyboard lock in fullscreen | `test/settings.spec.ts` | Fixed |
| 10 | Driving / travel steps | Routes are signposted; arriving completes the step | — | Needs a driving bot or manual pass | Open |
| 11 | Puzzle panels | A puzzle explains its rule and shows progress | Rule text on open plus a live progress line ('6/9 fuses green', '2/3 gauges in the green — pull the lever') | Screenshot review | Fixed |
| 12 | Failure without recovery | Every fail state has a clear retry, a reason and a tip about what actually did it | Fail screens take `World.lastHurtBy` (wolf / fall / crash); checkpoint retry | Screenshot review | Fixed |
| 13 | HUD collisions | Prompts, subtitles and carry lines never cover each other or the part you're working on | `Hud.placePrompt()`: the prompt sits below the crosshair, rises above the subtitle and carry line, and flips above the crosshair when there's no room | `node tools/walkthrough.mjs <level>` (per-step screenshots) | Fixed |
| 14 | Wording | Step text reads naturally: singular/plural by count, 'hub' only for wheels | `plural()` in machine.ts | Walkthrough step list | Fixed |
| 15 | Stale hints | A hint never contradicts the current state ("look at the sawmill" when the part is already on your rack) | Empty-mount hints ask `MachineCtx.locate()` first; stow text uses real item names | `test/guidance.spec.ts` (hints stay true); walkthrough step list | Fixed |

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

## Found and fixed by the target audit (`tools/targetcheck.mjs`)
- The radiator-hose clamps were drawn 22 cm from where they're clicked (the
  hose slot is rotated; its bolt offsets weren't).
- The logging truck's battery box had no lid to see, highlight or open.
- The generator's pull cord, the RV's storage bin and fuel filler: usable, but
  not linked to anything drawn, so they couldn't glow.
- The mine's foreman's logbook was an invisible interaction. There's now a book
  on a crate by the lantern.

## Found by the player's-eye walkthrough (`tools/walkthrough.mjs`)
- The Dispatch subtitle covered the action prompt, and the waypoint diamond sat on top of it.
- "Fit the battery onto the battery hub"; "hold-down bolts — 0/1".
- "Strap the load to the quad's rack" (a placeholder name instead of the item's).
- An empty battery mount said "look in the logging truck at the sawmill" while the salvaged battery was already strapped to the quad.

## How to add to this
When a playtest turns up a problem, first ask which class it belongs to. If
it's a new class, add a row with its rule and a check before fixing the
instance.
