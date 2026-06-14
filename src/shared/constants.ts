// Central tuning. Units are meters & seconds. Sim runs at a fixed timestep.

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// --- Player collider ---
export const PLAYER_RADIUS = 0.35;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.15;
export const EYE_DROP = 0.18; // eye sits this far below the collider top

// --- Movement feel (Quake/Source-style controller) ---
export const GRAVITY = 22;
export const JUMP_SPEED = 7.4;
export const WALK_SPEED = 6.0;
export const SPRINT_SPEED = 8.2;
export const CROUCH_SPEED = 2.6;
export const GROUND_ACCEL = 85;
export const GROUND_FRICTION = 8.5;
// Air control: a small wish-speed cap + high accel is what enables strafe-jump
// acceleration (the skill ceiling). Tuned so a clean hop chain clears GATE_SPEED.
export const AIR_ACCEL = 12;
export const AIR_WISH_CAP = 1.25;
export const SPEED_HARD_CAP = 18;

// Auto-hop: while the jump key is held, re-jump on landing without applying
// ground friction. Accessible bunny-hopping (the "hold to auto-hop" assist).
export const AUTOHOP = true;

// --- Interaction ---
export const INTERACT_RANGE = 3.2;
export const INTERACT_CONE = 0.55; // dot threshold (~57° half-angle)
export const CARRY_DISTANCE = 1.3; // how far in front a carried part floats

// --- Tutorial challenge ---
export const GATE_SPEED = 10.0; // must exceed this (m/s) to open the speed gate

// --- Go-kart (arcade model) ---
export const KART_ACCEL = 16;
export const KART_MAX_SPEED = 17;
export const KART_REVERSE_SPEED = 6;
export const KART_FRICTION = 4;
export const KART_BRAKE = 26;
export const KART_TURN_RATE = 2.2; // rad/s, scaled by current speed
export const CHECKPOINT_RADIUS = 3.0;
