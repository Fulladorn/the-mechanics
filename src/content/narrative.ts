import type { ObjectiveId } from '../sim/objectives';

// Dispatch (the handler) — data-only voice lines. Dry, a little shady.
export const DISPATCH = {
  intro: "Welcome to the training bay, rookie. Let's see if you've got the hands for this job.",
  objectives: {
    move: 'Good. Get a feel for those legs.',
    bhop: "Nice hops. Speed keeps you alive out in the field.",
    pickup: "Grab that wrench. Never show up to a job empty-handed.",
    puzzle: "Circuit's live. Match the wires and try not to fry yourself.",
    carry: 'Heavy, right? Drop the block in the bay and bolt it down.',
    drive: 'Take her around the cones. Mind the paint.',
    clockin: '',
  } as Record<ObjectiveId, string>,
  lore: "Huh. That symbol on the crate... ignore it. Above your pay grade.",
  outro: "Clean work. You'll do. Pack up — real jobs start soon, and they're not all this friendly.",
};
