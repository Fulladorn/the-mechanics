import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { makeMountains } from '../src/content/levels/mountains';
import { isDrivable, socketState } from '../src/sim/vehicle';
import { makeIntent } from '../src/shared/types';
import { DT } from '../src/shared/constants';
import type { Vec3 } from '../src/shared/math';

// Headless proof that Summer Mountains is completable start → exfil. Movement
// itself is covered by movement.spec; here we teleport between beats so the
// test exercises mission logic (creep, repairs, puzzles, exfil) rather than
// pathfinding down two kilometres of switchback.

const faceYaw = (from: Vec3, to: Vec3): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));

function standAt(w: World, target: Vec3, back = 1.6): void {
  // Stand `back` metres short of the target. Drop in from above and let the sim
  // settle us onto whatever surface is actually there — teleporting straight to
  // terrain height can land us inside a cabin deck and get shoved out.
  const yaw = faceYaw(w.player.pos, target);
  const x = target.x + Math.sin(yaw) * back;
  const z = target.z + Math.cos(yaw) * back;
  w.player.pos = { x, y: w.groundHeight(x, z) + 1.5, z };
  w.player.vel = { x: 0, y: 0, z: 0 };
  w.player.onGround = false;
  const idle = makeIntent();
  idle.yaw = yaw;
  for (let i = 0; i < 60 && !w.player.onGround; i++) w.step(idle, DT);
  // Re-aim from wherever we actually ended up, then let the yaw take effect.
  idle.yaw = faceYaw(w.player.pos, target);
  w.step(idle, DT);
}

function interactAt(w: World, target: Vec3, back = 1.6): void {
  standAt(w, target, back);
  w.command({ t: 'interact' });
}

describe('Summer Mountains (headless)', () => {
  it('the 4x4 creeps toward the edge until it is chocked', () => {
    const w = new World(makeMountains());
    const before = { ...w.kart.pos };
    for (let i = 0; i < 60; i++) w.step(makeIntent(), DT);
    expect(Math.hypot(w.kart.pos.x - before.x, w.kart.pos.z - before.z)).toBeGreaterThan(0.1);

    const chock = w.level.stations.find((s) => s.kind === 'chock')!;
    interactAt(w, chock.pos);
    expect(w.chocked).toBe(true);
    expect(w.objectives.isDone('stabilize')).toBe(true);

    const parked = { ...w.kart.pos };
    for (let i = 0; i < 120; i++) w.step(makeIntent(), DT);
    expect(Math.hypot(w.kart.pos.x - parked.x, w.kart.pos.z - parked.z)).toBeLessThan(0.05);
  });

  it('fails the contract if the vehicle is never chocked', () => {
    const w = new World(makeMountains());
    for (let i = 0; i < 60 * 60; i++) {
      w.step(makeIntent(), DT);
      if (w.failed) break;
    }
    expect(w.failed).toBe('creep');
  });

  it('completes every critical system and reaches exfil', () => {
    const w = new World(makeMountains());
    const lvl = w.level;

    interactAt(w, lvl.stations.find((s) => s.kind === 'chock')!.pos);
    expect(w.chocked).toBe(true);

    // Every MISSING system has a matching part somewhere on the mountain.
    const missing = w.vehicle.sockets.filter((s) => s.required && socketState(s) === 'MISSING');
    expect(missing.length).toBeGreaterThan(0);
    for (const s of missing) {
      const item = w.items.find((i) => i.kind === s.accepts && !i.picked && !i.lockedUntil);
      expect(item, `no world item for socket ${s.id}`).toBeTruthy();
      interactAt(w, item!.pos, 1.2);
      expect(w.player.carrying).toBe(s.accepts);

      const anchor = s.anchor;
      const socketPos = {
        x: w.kart.pos.x + anchor.x,
        y: w.kart.pos.y - w.kart.half.y + anchor.y,
        z: w.kart.pos.z + anchor.z,
      };
      interactAt(w, socketPos, 1.3);
      expect(w.player.carrying, `failed to install ${s.id}`).toBeNull();
    }

    // Every BROKEN system opens a puzzle, and solving it clears the fault.
    const broken = w.vehicle.sockets.filter((s) => s.broken);
    expect(broken.length).toBe(3); // fuse, bolt, valve — one of each
    for (const s of broken) {
      const socketPos = {
        x: w.kart.pos.x + s.anchor.x,
        y: w.kart.pos.y - w.kart.half.y + s.anchor.y,
        z: w.kart.pos.z + s.anchor.z,
      };
      interactAt(w, socketPos, 1.3);
      expect(w.activePuzzle?.socketId, `repair prompt missing for ${s.id}`).toBe(s.id);
      w.command({ t: 'solvePuzzle', socketId: s.id });
      expect(socketState(s)).toBe('GO');
    }

    expect(isDrivable(w.vehicle)).toBe(true);
    expect(w.objectives.isDone('repair')).toBe(true);
    expect(w.objectives.readyToFinish()).toBe(true);

    // Drive: put the player in the 4x4 and roll it into the extraction volume.
    standAt(w, w.kart.pos, 2.2);
    w.command({ t: 'interact' });
    expect(w.player.mode).toBe('kart');

    const exfil = lvl.exfil!;
    for (let i = 0; i < 60 * 240 && !w.won; i++) {
      const it = makeIntent();
      it.fwd = true;
      // steer straight at the pad; the terrain does the rest
      it.yaw = faceYaw(w.kart.pos, exfil.pos);
      const want = it.yaw;
      let d = ((want - w.kart.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      if (d > 0.04) it.left = true;
      else if (d < -0.04) it.right = true;
      w.step(it, DT);
      // Nudge past terrain snags so the test measures mission logic, not driving.
      if (i % 240 === 239 && Math.abs(w.kart.speed) < 0.5) {
        const t = Math.min(1, i / (60 * 240) + 0.05);
        const p = w.terrain!.roadPoint(t);
        w.kart.pos = { x: p.x, y: p.y + w.kart.half.y, z: p.z };
      }
    }

    expect(w.won, 'never reached the extraction lot').toBe(true);
    expect(w.objectives.isDone('exfil')).toBe(true);
  });

  it('the cave reward stays hidden until the log is recovered', () => {
    const w = new World(makeMountains());
    expect(w.activeItems().some((i) => i.kind === 'winch')).toBe(false);
    w.command({ t: 'solveLore' });
    expect(w.loreFound).toBe(true);
    expect(w.activeItems().some((i) => i.kind === 'winch')).toBe(true);
  });
});
