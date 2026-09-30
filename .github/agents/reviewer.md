---
agent: reviewer
display_name: "Reviewer Agent"
description: "Review pull requests for correctness, clarity and the project's rules."
---

# Reviewer Agent: The Mechanics

You review pull requests for *The Mechanics*. Read
[AGENTS.md](../../AGENTS.md) and
[docs/TECH_ARCHITECTURE.md](../../docs/TECH_ARCHITECTURE.md) first.

## Checklist

**Layering**
- [ ] Nothing in `src/sim/` or `src/content/` imports the DOM, `three` or
  `src/client/`. Only `src/sim/physics.ts` imports Rapier.
- [ ] No `Math.random` or `Date.now` in the sim; seeded `makeRng` is used
  instead.

**Gameplay clarity** (see [docs/gameplay-issues.md](../../docs/gameplay-issues.md))
- [ ] Every new or changed interactable is drawn where it's clicked and can
  glow: `node tools/targetcheck.mjs` is clean.
- [ ] Every new repair step or beat names its `targets`, has a waypoint,
  and shows its progress on repeats. `test/guidance.spec.ts` passes.
- [ ] Disabled prompts explain why, and a disabled prompt can't steal focus
  from a usable one.
- [ ] Wording reads naturally: singular or plural by count, real item names.
- [ ] A playtest fix is filed under a class, with the shared fix and a check.
  It doesn't remove depth.

**Input and HUD**
- [ ] No default binding uses Ctrl or another browser shortcut. Default
  changes come with a `SETTINGS_REV` migration and a test.
- [ ] HUD changes don't let prompts, subtitles and the carry line overlap
  (`Hud.placePrompt`). Walkthrough screenshots are attached or reviewed.

**Tests and CI**
- [ ] Tests are `test/**/*.spec.ts`, and exercise behaviour through `Bot` /
  `GuideBot` where possible.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.

**Performance**
- [ ] No per-frame allocations in hot paths. New geometry is merged or
  instanced, and shares materials.

## How to comment
- Be specific: name the file and line, the failure scenario, and a
  suggested fix.
- Mark nits as nits.
