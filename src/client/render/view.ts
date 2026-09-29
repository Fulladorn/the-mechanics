import * as THREE from 'three';
import { G } from '../../sim/physics';
import type { World } from '../../sim/world';
import type { LevelDef } from '../../content/levels/types';
import type { Settings } from '../settings';
import { Sky } from './sky';
import { SU, styl, MAT } from './stylized';
import { Biome, PALETTES } from './biome';
import { TerrainView, bakeGround, groundTextures } from './terrainView';
import { Grass, GRASS_QUALITY } from './grass';
import { CameraRig } from './cameraRig';
import { Highlight } from './highlight';
import { Viewmodel } from './viewmodel';
import { Post } from './post';
import { Particles, PARTICLE_SCALE } from './particles';
import { Water } from './water';
import { WolfPack } from './wolves';
import { MachineView } from './machineView';
import { itemModel } from './itemModels';
import { cyl, mesh, rbox } from './shapes';
import { buildModel, buildProp, type PropBuild } from './kit/registry';
import { Nature } from './foliage';
import { ITEM_DEFS } from '../../sim/items';
import type { SlotDef } from '../../sim/machine';

// The renderer for one mission. Owns the scene and every visual subsystem,
// and turns sim state (interpolated between fixed ticks) into a frame.

interface ItemVis {
  obj: THREE.Object3D;
  key: string;
  prevP: THREE.Vector3;
  curP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  curQ: THREE.Quaternion;
}

export interface FrameInput {
  yaw: number;
  pitch: number;
  vehicleCam: 'chase' | 'cockpit';
  /** Freeze the camera on a panel. */
  panelPose?: { pos: THREE.Vector3; quat: THREE.Quaternion } | null;
  /** A scripted camera (cinematics) overrides everything. */
  cine?: { pos: THREE.Vector3; quat: THREE.Quaternion } | null;
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sky: Sky;
  readonly rig: CameraRig;
  readonly vm: Viewmodel;
  readonly particles: Particles;
  private post: Post;
  private grass?: Grass;
  private highlight: Highlight;
  readonly machines = new Map<string, MachineView>();
  private items = new Map<number, ItemVis>();
  private props: PropBuild[] = [];
  private doors = new Map<string, THREE.Object3D>();
  private flares = new Map<object, { obj: THREE.Object3D; light: THREE.PointLight }>();
  private prevEye = new THREE.Vector3();
  private curEye = new THREE.Vector3();
  private settings: Settings;
  private baseFov: number;
  private fovKick = 0;
  private clock = 0;
  private shadeCheck = 0;
  private shade = 0;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector2();
  private water?: Water;
  private wolves?: WolfPack;
  private ambient = 1;

  constructor(
    readonly world: World,
    readonly level: LevelDef,
    container: HTMLElement,
    settings: Settings,
  ) {
    this.settings = settings;
    this.baseFov = settings.video.fov;
    const q = settings.video.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'med' ? 1.5 : 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = settings.video.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(settings.video.fov, innerWidth / innerHeight, 0.05, 9000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const outdoor = level.env === 'mountain';
    this.sky = new Sky(this.scene, this.renderer, {
      sunsetBearing: level.sunset ?? 250,
      shadowMap: settings.video.shadows ? (q === 'high' ? 8192 : q === 'med' ? 4096 : 2048) : 0,
      shadowSpan: outdoor ? 48 : 34,
      scenery: true,
      seed: level.terrain.seed,
    });
    this.sky.setHour(world.hour);
    SU.uFogBase.value = 0;

    // Ground.
    const rules = level.ground ?? [];
    const biome = new Biome(world.terrain, PALETTES[outdoor ? 'alpine' : 'depot'], (x, z, out) => {
      for (const r of rules) {
        if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
        if (r.color !== undefined) out.color.setHex(r.color);
        out.grass = r.grass ?? 0;
        out.flowers = 0;
        return true;
      }
      return false;
    });
    const bake = bakeGround(world.terrain, biome);
    const tv = new TerrainView(world.terrain, bake, q);
    this.scene.add(tv.group);
    const tex = groundTextures(world.terrain, bake);
    this.grass = new Grass(world.terrain, tex, GRASS_QUALITY[q]);
    this.scene.add(this.grass.group);

    if (level.nature?.length) this.scene.add(new Nature(level.nature).group);
    if (level.terrain.waterLevel !== undefined) {
      this.water = new Water(world.terrain, level.terrain.waterLevel);
      this.scene.add(this.water.group);
    }
    if (world.wolves.length) {
      this.wolves = new WolfPack(world);
      this.scene.add(this.wolves.group);
    }

    // Static colliders that draw themselves as blocks.
    for (const s of level.statics) {
      if (!s.render) continue;
      const mat =
        s.render === 'crate'
          ? MAT.wood(s.color ?? 0xb5793c)
          : s.render === 'concrete'
            ? MAT.concrete(s.color)
            : s.render === 'metal'
              ? MAT.darkMetal(s.color)
              : styl({ color: s.color ?? 0xcccccc });
      if (s.shape === 'box') {
        const m = mesh(rbox(s.size.x * 2, s.size.y * 2, s.size.z * 2, 0.04), mat, s.pos.x, s.pos.y, s.pos.z);
        m.rotation.y = s.yaw ?? 0;
        this.scene.add(m);
      }
    }

    // Level dressing.
    for (const p of level.props) {
      const b = buildProp(p, world);
      if (!b) continue;
      this.scene.add(b.obj);
      this.props.push(b);
    }

    // Machines: vehicles and donors.
    for (const [key, pl] of world.placements) {
      const m = world.machines.get(key)!;
      const v = world.vehicles.get(key) ?? null;
      const built = buildModel(pl.model, pl.paint);
      const mv = new MachineView(m, v, built.vehicle, built.art);
      this.scene.add(mv.root);
      this.machines.set(key, mv);
    }

    // Doors.
    for (const [id, d] of world.doors) {
      const pivot = new THREE.Group();
      pivot.position.set(d.def.hinge.x, d.def.hinge.y, d.def.hinge.z);
      pivot.rotation.y = d.def.yaw;
      if (d.def.style === 'rollup') {
        // slatted door that rolls up into a drum under the lintel
        const slats = new THREE.Group();
        const n = Math.round(d.def.height / 0.22);
        const mat = styl({ color: 0xb8453c, rough: 0.5, metal: 0.35, noise: 0.08 });
        for (let i = 0; i < n; i++) slats.add(mesh(rbox(d.def.width, 0.2, 0.06, 0.03), mat, d.def.width / 2, 0.11 + i * 0.22, 0));
        slats.name = 'slats';
        pivot.add(slats);
        pivot.add(mesh(cyl(0.35, 0.35, d.def.width + 0.4, 16), styl({ color: 0x5a5f68, rough: 0.5, metal: 0.5 }), d.def.width / 2, d.def.height + 0.35, -0.3).rotateZ(Math.PI / 2));
        pivot.userData.rollup = true;
      } else {
        const leaf = mesh(rbox(d.def.width, d.def.height, 0.07, 0.02), MAT.wood(0x8a5a3a));
        leaf.position.set(d.def.width / 2, d.def.height / 2, 0);
        pivot.add(leaf);
        const knob = mesh(rbox(0.05, 0.05, 0.12, 0.02), MAT.metal(0xc9a24a));
        knob.position.set(d.def.width - 0.12, 1.0, 0);
        pivot.add(knob);
      }
      this.scene.add(pivot);
      this.doors.set(id, pivot);
    }

    this.particles = new Particles(this.scene, q, (x, z) => world.terrain.heightAt(x, z));
    this.highlight = new Highlight(this.scene);
    this.rig = new CameraRig(this.camera, world.terrain);
    this.rig.obstruct = (from, dir, len) => {
      const hit = world.phys.castRay({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z }, len, G.STATIC | G.DOOR);
      return hit ? hit.toi : null;
    };
    this.vm = new Viewmodel(innerWidth / innerHeight, settings.video.fov);
    this.scene.add(this.vm.flashlight, this.vm.flashlight.target);
    this.post = new Post(this.renderer, this.scene, this.camera, q, settings.video.postfx);
    this.post.setExposure(settings.video.brightness);

    const eye = world.player.eye();
    this.prevEye.set(eye.x, eye.y, eye.z);
    this.curEye.copy(this.prevEye);
    addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
    this.vm.setFov(this.camera.fov, this.camera.aspect);
  };

  dispose(): void {
    removeEventListener('resize', this.onResize);
    this.post.dispose();
    this.sky.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Snapshot sim transforms (call after each fixed step). */
  capture(): void {
    const e = this.world.player.eye();
    this.prevEye.copy(this.curEye);
    this.curEye.set(e.x, e.y, e.z);
    for (const mv of this.machines.values()) mv.capture();
    for (const it of this.world.items.list) {
      const v = this.items.get(it.id);
      if (!v) continue;
      v.prevP.copy(v.curP);
      v.prevQ.copy(v.curQ);
      v.curP.set(it.pos.x, it.pos.y, it.pos.z);
      v.curQ.set(it.rot.x, it.rot.y, it.rot.z, it.rot.w);
    }
  }

  // --- per frame ---------------------------------------------------------------------------

  frame(dt: number, alpha: number, input: FrameInput): void {
    const w = this.world;
    this.clock += dt;
    SU.uTime.value = this.clock;
    this.sky.setHour(w.hour);

    this.syncItems(alpha);
    for (const mv of this.machines.values()) mv.sync(w, dt, alpha, this.clock);
    for (const [id, pivot] of this.doors) {
      const d = w.doors.get(id)!;
      const e = d.swing * d.swing * (3 - 2 * d.swing);
      if (pivot.userData.rollup) {
        const slats = pivot.getObjectByName('slats')!;
        slats.children.forEach((s, i) => {
          const base = 0.11 + i * 0.22;
          const y = Math.min(d.def.height + 0.2, base + e * d.def.height);
          s.position.y = y;
          s.visible = y < d.def.height + 0.15;
        });
      } else pivot.rotation.y = d.def.yaw - e * 1.6;
    }
    // Indoors: the open sky stops contributing so much ambient light.
    let amb = 1;
    const cp = this.camera.position;
    for (const r of this.level.rooms ?? []) {
      if (cp.x > r.x0 && cp.x < r.x1 && cp.z > r.z0 && cp.z < r.z1 && cp.y < r.y1) amb = Math.min(amb, r.ambient);
    }
    this.ambient += (amb - this.ambient) * Math.min(1, dt * 2.5);
    this.sky.hemi.intensity *= this.ambient;
    this.scene.environmentIntensity = 0.55 * (0.35 + 0.65 * this.ambient);
    this.post.setExposure(this.settings.video.brightness * this.sky.exposure * (1 + (1 - this.ambient) * 0.22));
    for (const p of this.props) p.update?.(dt, this.clock, w);
    this.syncFlares(dt);
    this.water?.update(this.clock);
    this.wolves?.update(dt, this.sky.night);

    // --- camera -----------------------------------------------------------------
    const p = w.player;
    const driving = p.mode === 'drive' && p.vehicle;
    let speed = Math.hypot(p.vel.x, p.vel.z);
    if (input.cine) {
      this.rig.focus(input.cine, dt, 2.5);
    } else if (input.panelPose) {
      this.rig.focus(input.panelPose, dt, 5);
    } else if (driving) {
      const v = w.vehicles.get(p.vehicle!)!;
      const mv = this.machines.get(p.vehicle!)!;
      speed = Math.abs(v.speed);
      if (input.vehicleCam === 'cockpit') {
        mv.root.updateMatrixWorld();
        const seat = this.tmpV.set(v.def.seat.x, v.def.seat.y, v.def.seat.z).applyMatrix4(mv.root.matrixWorld);
        this.rig.cockpit(seat, mv.root.quaternion, input, dt);
      } else {
        this.rig.chase(mv.root.position, mv.root.quaternion, v.speed, input, dt, v.def.kind === 'atv' ? 4.6 : 6.4, v.def.kind === 'atv' ? 1.5 : 1.9);
      }
      const ext = mv.model?.exterior ?? [];
      for (const o of ext) o.visible = input.vehicleCam !== 'cockpit';
    } else {
      const eye = this.tmpV.lerpVectors(this.prevEye, this.curEye, alpha);
      this.rig.foot(eye, input.yaw, input.pitch, speed, p.onGround, dt, this.settings.accessibility.headbob);
      for (const mv of this.machines.values()) for (const o of mv.model?.exterior ?? []) o.visible = true;
    }
    const targetFov = this.baseFov + (driving ? Math.min(speed, 25) * 0.35 : Math.max(0, speed - 6) * 0.8) + this.fovKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();
    this.fovKick *= Math.exp(-dt * 6);
    this.camera.updateMatrixWorld();

    // Shadows, sky and grass follow the camera.
    const focusPt = driving ? this.machines.get(p.vehicle!)!.root.position : this.camera.position;
    this.sky.follow(focusPt);
    const pushers: { x: number; z: number; r: number; k: number }[] = [];
    if (!driving) pushers.push({ x: p.pos.x, z: p.pos.z, r: 0.7, k: 1 });
    for (const v of w.vehicles.values()) {
      pushers.push({ x: v.pos.x, z: v.pos.z, r: 1.6, k: 1 });
      if (pushers.length >= 4) break;
    }
    this.grass?.update(this.camera.position, pushers);

    // --- focus glow + ghosts -----------------------------------------------------------
    this.updateHighlight();

    // --- first person hands -----------------------------------------------------------
    const handsVisible = p.mode === 'foot' && !input.panelPose && !input.cine;
    this.vm.update(dt, w, input.yaw, input.pitch, this.settings.accessibility.headbob, handsVisible);
    this.shadeCheck -= dt;
    if (this.shadeCheck <= 0) {
      this.shadeCheck = 0.25;
      const e = w.player.eye();
      const hit = w.phys.castRay(e, { x: this.sky.keyDir.x, y: this.sky.keyDir.y, z: this.sky.keyDir.z }, 60, 0x0001 | 0x0010);
      this.shade = hit ? 1 : 0;
    }
    this.vm.light(this.sky.sun, this.sky.hemi, this.scene.environment, this.shade, this.camera.quaternion, this.sky.keyDir);
    const fl = this.vm.flashlight;
    fl.position.copy(this.camera.position).add(this.tmpV.set(0.2, -0.25, 0).applyQuaternion(this.camera.quaternion));
    fl.target.position.copy(this.camera.position).add(this.tmpV.set(0, 0, -6).applyQuaternion(this.camera.quaternion));
    fl.target.updateMatrixWorld();

    // --- vehicle lights ---------------------------------------------------------------
    for (const [key, mv] of this.machines) {
      const v = w.vehicles.get(key);
      if (!v || !mv.model) continue;
      const on = v.lights && (v.running || v.occupied);
      for (const b of mv.model.beams) b.intensity = on ? 60 : 0;
      for (const l of mv.model.headLamps) l.emissiveIntensity = on ? 3.5 : 0.1;
      const braking = v.occupied && v.brake > 1;
      for (const l of mv.model.tailLamps) l.emissiveIntensity = braking ? 3 : on ? 1.2 : 0.15;
      if (mv.model.steering) mv.model.steering.rotation.z = v.steer * 2.2;
      // exhaust puffs while running
      if (v.running && Math.random() < dt * (8 + Math.abs(v.speed))) {
        const pos = this.tmpV.set(0.58, -0.6, 2.45).applyMatrix4(mv.root.matrixWorld);
        this.particles.exhaust(pos, Math.min(1, 0.3 + v.load));
      }
      // dust from the wheels on dirt
      if (Math.abs(v.speed) > 4 && Math.random() < dt * Math.abs(v.speed) * 0.8) {
        const back = this.tmpV.set((Math.random() - 0.5) * 1.6, -0.85, 1.4).applyMatrix4(mv.root.matrixWorld);
        this.particles.dust(back, Math.min(1.4, Math.abs(v.speed) / 12));
      }
    }

    PARTICLE_SCALE.value = this.renderer.getDrawingBufferSize(this.tmpV2).y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.particles.update(dt);
    this.post.render(dt, this.scene, this.camera);
    this.renderHands();
  }

  private renderHands(): void {
    const r = this.renderer;
    this.vm.camera.position.set(0, 0, 0);
    this.vm.camera.quaternion.identity();
    const auto = r.autoClear;
    const tm = r.toneMapping;
    r.autoClear = false;
    r.clearDepth();
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.settings.video.brightness * this.sky.exposure;
    r.render(this.vm.scene, this.vm.camera);
    r.toneMapping = tm;
    r.autoClear = auto;
  }

  private syncItems(alpha: number): void {
    const w = this.world;
    for (const it of w.items.list) {
      const visible = (it.state === 'world' && !it.hiddenUntil) || it.state === 'racked';
      let v = this.items.get(it.id);
      const key = `${it.cond}:${Math.round(it.fill * 5)}:${it.variant ?? ''}`;
      if (!visible) {
        if (v) v.obj.visible = false;
        continue;
      }
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.obj);
        const obj = itemModel(it);
        this.scene.add(obj);
        const p = new THREE.Vector3(it.pos.x, it.pos.y, it.pos.z);
        const q = new THREE.Quaternion(it.rot.x, it.rot.y, it.rot.z, it.rot.w);
        v = { obj, key, prevP: p.clone(), curP: p.clone(), prevQ: q.clone(), curQ: q.clone() };
        this.items.set(it.id, v);
      }
      if (!v.obj.visible) {
        // just reappeared (dropped): snap, don't interpolate from where it was
        v.prevP.set(it.pos.x, it.pos.y, it.pos.z);
        v.curP.copy(v.prevP);
        v.prevQ.set(it.rot.x, it.rot.y, it.rot.z, it.rot.w);
        v.curQ.copy(v.prevQ);
      }
      v.obj.visible = true;
      if (it.state === 'racked') {
        v.obj.position.set(it.pos.x, it.pos.y, it.pos.z);
        v.obj.quaternion.set(it.rot.x, it.rot.y, it.rot.z, it.rot.w);
      } else {
        v.obj.position.lerpVectors(v.prevP, v.curP, alpha);
        v.obj.quaternion.slerpQuaternions(v.prevQ, v.curQ, alpha);
      }
    }
  }

  private syncFlares(dt: number): void {
    const live = new Set<object>();
    for (const f of this.world.flares) {
      live.add(f);
      let v = this.flares.get(f);
      if (!v) {
        const obj = itemModel({ kind: 'flare', cond: 'good', fill: 0 });
        obj.position.set(f.pos.x, f.pos.y + 0.03, f.pos.z);
        obj.rotation.y = Math.random() * 6;
        const light = new THREE.PointLight(0xff4a2a, 12, 16, 1.6);
        light.position.set(f.pos.x, f.pos.y + 0.4, f.pos.z);
        this.scene.add(obj, light);
        v = { obj, light };
        this.flares.set(f, v);
      }
      v.light.intensity = (10 + Math.sin(this.clock * 30) * 3 + Math.random() * 3) * Math.min(1, f.ttl / 3);
      if (Math.random() < dt * 40) {
        this.particles.emit({ x: f.pos.x, y: f.pos.y + 0.1, z: f.pos.z }, { count: 1, speed: 0.8, spread: 0.4, up: 1.5, gravity: -0.5, size: 10, ttl: 0.6, color: [1, 0.45, 0.2] });
        this.particles.emitSmoke({ x: f.pos.x, y: f.pos.y + 0.2, z: f.pos.z }, { count: 1, speed: 0.2, spread: 0.2, up: 0.8, gravity: -0.3, size: 26, ttl: 2.2, color: [0.8, 0.45, 0.4], grow: 2, drag: 1 });
      }
    }
    for (const [f, v] of this.flares) {
      if (live.has(f)) continue;
      this.scene.remove(v.obj, v.light);
      this.flares.delete(f);
    }
  }

  /** Map a focus target id to the object to outline. */
  private resolveTarget(target: string | undefined): THREE.Object3D | null {
    if (!target) return null;
    if (target.startsWith('item:')) return this.items.get(Number(target.slice(5)))?.obj ?? null;
    if (target.startsWith('machine:')) {
      const [, key, kind, id] = target.split(':');
      const mv = this.machines.get(key);
      return mv ? mv.targetObject(kind, id) : null;
    }
    if (target.startsWith('vehicle:')) {
      const [, key, part] = target.split(':');
      const mv = this.machines.get(key);
      if (!mv) return null;
      return part === 'rack' ? mv.targetObject('rack', '') : (mv.model?.root ?? mv.root);
    }
    if (target.startsWith('door:')) return this.doors.get(target.slice(5)) ?? null;
    for (const p of this.props) {
      const o = p.targets?.get(target);
      if (o) return o;
    }
    return null;
  }

  private updateHighlight(): void {
    const w = this.world;
    const f = w.player.mode === 'foot' ? w.focus : null;
    // Big fallback targets (the whole truck, a door) don't get the glow — it
    // would outline half the screen; the prompt is enough.
    const big = !!f && (f.priority ?? 0) < 0;
    this.highlight.focus(f && !big ? this.resolveTarget(f.target) : null, !!f?.disabled);

    // Ghost the carried part into every slot it fits (nearby), strongest on
    // the one under the crosshair.
    const held = w.heldItem();
    if (held && w.player.mode === 'foot') {
      for (const [key, mv] of this.machines) {
        const m = mv.machine;
        if (Math.hypot(m.pos.x - w.player.pos.x, m.pos.z - w.player.pos.z) > 9) continue;
        for (const c of m.def.components) {
          if (c.t === 'slot' && c.accepts === held.kind && !m.state.slots[c.id]) {
            const mtx = mv.slotMatrix(c as SlotDef);
            const ok = !c.lift || m.jackRaised(c.lift);
            this.highlight.ghost(`${key}:${c.id}:${held.id}`, () => mv.ghostModel(c as SlotDef, held), mtx, ok, this.scene);
          }
          if (c.t === 'jack' && held.kind === 'jack' && m.state.jacks[c.id].state === 'none') {
            const mtx = mv.jackMatrix(c.id);
            this.highlight.ghost(`${key}:${c.id}:jack`, () => itemModel(held), mtx, true, this.scene);
          }
        }
      }
    }
    this.highlight.update(1 / 60);
  }

  // --- effects hooks (called from the game's event loop) ------------------------------------

  kick(fov: number, shake: number): void {
    this.fovKick += fov;
    if (this.settings.accessibility.screenshake) this.rig.shake += shake;
  }

  landed(speed: number): void {
    this.rig.land(speed / 8);
    const p = this.world.player.pos;
    this.particles.dust({ x: p.x, y: p.y + 0.05, z: p.z }, Math.min(1.3, speed / 9));
  }

  footstep(): void {
    const p = this.world.player.pos;
    this.particles.dust({ x: p.x, y: p.y + 0.04, z: p.z }, 0.25);
  }

  pickup(): void {
    this.vm.bump();
  }

  partOn(machine: string, slot: string): void {
    const mv = this.machines.get(machine);
    if (!mv) return;
    const from = this.camera.position.clone().add(this.tmpV.set(0, -0.4, -0.6).applyQuaternion(this.camera.quaternion));
    mv.arrive(slot, from);
    this.vm.bump();
    this.kick(1.2, 0.12);
  }

  sparks(pos: { x: number; y: number; z: number }, big = false): void {
    this.particles.sparks(pos, big ? 1.4 : 0.6);
  }

  impact(pos: { x: number; y: number; z: number }, severity: number): void {
    this.particles.impact(pos, Math.min(1.5, severity * 3));
    this.kick(-2, Math.min(0.6, 0.15 + severity));
  }

  swing(): void {
    this.vm.swingFx();
  }

  /** Where to put the camera to work on a panel. */
  panelPose(machine: string, panel: string): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const mv = this.machines.get(machine);
    const pv = mv?.panel(panel);
    if (!mv || !pv) return null;
    pv.group.updateWorldMatrix(true, false);
    const c = new THREE.Vector3().setFromMatrixPosition(pv.group.matrixWorld);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(pv.group.getWorldQuaternion(new THREE.Quaternion()));
    const from = c.clone().addScaledVector(n, 0.5);
    // keep "up" sensible when the panel faces the sky
    const pose = CameraRig.pose(from, c);
    if (Math.abs(n.y) > 0.8) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mv.root.quaternion);
      from.copy(c).addScaledVector(n, 0.48).addScaledVector(fwd, -0.12);
      const m = new THREE.Matrix4().lookAt(from, c, fwd);
      pose.pos.copy(from);
      pose.quat.setFromRotationMatrix(m);
    }
    return pose;
  }

  /** Raycast a screen point into the open panel's clickable parts. */
  pickPanel(machine: string, panel: string, clientX: number, clientY: number): THREE.Object3D | null {
    const pv = this.machines.get(machine)?.panel(panel);
    if (!pv) return null;
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = rc.intersectObjects(pv.hits, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.kind) o = o.parent;
    return o;
  }

  /** Project a world point for HUD markers. Returns null when behind the camera. */
  project(p: { x: number; y: number; z: number }): { x: number; y: number; behind: boolean } {
    const v = this.tmpV.set(p.x, p.y, p.z).project(this.camera);
    const behind = v.z > 1;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind };
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.baseFov = s.video.fov;
    this.renderer.shadowMap.enabled = s.video.shadows;
    this.post.setExposure(s.video.brightness);
  }

  /** Is this item kind carried as heavy? (HUD helper) */
  static heavy(kind: keyof typeof ITEM_DEFS): boolean {
    return ITEM_DEFS[kind].heavy;
  }
}
