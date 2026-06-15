import * as THREE from 'three';
import { lerp, lerpAngle, type Vec3 } from '../../shared/math';
import { CHECKPOINT_RADIUS } from '../../shared/constants';
import type { World } from '../../sim/world';
import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import {
  floorTexture,
  stripeTexture,
  chevronTexture,
  wallPanelTexture,
  doorTexture,
  metalTexture,
  tireTexture,
  posterTexture,
  skyTexture,
} from './textures';
import type { Prop } from '../../content/levels/garage';
import type { Settings } from '../settings';
import { Post } from './post';
import { Particles } from './particles';
import { buildHands } from './viewmodel';

const closedGateY = (b: { center: Vec3 }) => b.center.y;

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private world: World;

  private gateMesh!: THREE.Mesh;
  private gateAnim = 0;
  private itemMeshes = new Map<number, THREE.Object3D>();
  private kartGroup!: THREE.Group;
  private kartEngine!: THREE.Object3D;
  private checkpointMeshes: THREE.Mesh[] = [];
  private clockScreen!: THREE.Mesh;
  private heldEngine!: THREE.Object3D;
  private heldTools = new Map<ItemKind, THREE.Object3D>();
  private settings: Settings;
  private post!: Post;
  private particles!: Particles;
  private vmPivot!: THREE.Group;
  private baseFov: number;
  private fovPulse = 0;
  private shake = 0;
  private vmTime = 0;

  // interpolation state
  private prevEye: Vec3;
  private curEye: Vec3;
  private prevKart: { pos: Vec3; heading: number };
  private curKart: { pos: Vec3; heading: number };

  constructor(world: World, container: HTMLElement, settings: Settings) {
    this.world = world;
    this.settings = settings;
    this.baseFov = settings.video.fov;
    const lvl = world.level;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = settings.video.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.video.brightness;
    container.appendChild(this.renderer.domElement);

    const ext = world.level.exterior;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(ext.fogColor);
    this.scene.fog = new THREE.Fog(ext.fogColor, ext.fogNear, ext.fogFar);

    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x53483a, 1.3);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(14, 28, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    const s = 40;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    this.scene.add(sun);

    // interior fill so the workshop isn't gloomy (shadowless = cheap)
    for (const [z, intensity] of [[-20, 80] as const, [-10, 120] as const, [9, 95] as const]) {
      const fill = new THREE.PointLight(0xfff0d0, intensity, 46, 2);
      fill.position.set(0, 4.6, z);
      this.scene.add(fill);
    }

    this.camera = new THREE.PerspectiveCamera(settings.video.fov, innerWidth / innerHeight, 0.05, 250);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.buildSky();
    this.buildExterior();
    this.buildStatics();
    this.buildProps();
    this.buildGate();
    this.buildLaneDeco();
    this.buildItems();
    this.buildKart();
    this.buildCheckpoints();
    this.buildClockIn();
    this.buildHeld();

    this.particles = new Particles(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera, settings.video.quality, settings.video.postfx);

    const eye = world.eyePos();
    this.prevEye = { ...eye };
    this.curEye = { ...eye };
    this.prevKart = { pos: { ...world.kart.pos }, heading: world.kart.heading };
    this.curKart = { pos: { ...world.kart.pos }, heading: world.kart.heading };

    addEventListener('resize', this.onResize);
    void lvl;
  }

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight);
  };

  private addBox(b: { center: Vec3; half: Vec3 }, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BoxGeometry(b.half.x * 2, b.half.y * 2, b.half.z * 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(b.center.x, b.center.y, b.center.z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private buildStatics(): void {
    const floorTex = floorTexture();
    const wallTex = wallPanelTexture();
    const doorMat = new THREE.MeshStandardMaterial({
      map: metalTexture('#2a2f3a'),
      metalness: 0.6,
      roughness: 0.4,
    });
    for (const s of this.world.level.solids) {
      if (s.hidden) continue;
      let mat: THREE.Material;
      if (s.tag === 'floor') {
        floorTex.repeat.set(s.box.half.x, s.box.half.z);
        mat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96 });
      } else if (s.tag === 'wall' || s.tag === 'divider') {
        const t = wallTex.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(s.box.half.x, s.box.half.z) / 2, Math.max(s.box.half.y, 1) / 1.5);
        mat = new THREE.MeshStandardMaterial({ map: t, color: s.color, roughness: 0.85, metalness: 0.12 });
      } else if (s.tag === 'door') {
        mat = doorMat;
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: s.color,
          roughness: 0.6,
          metalness: s.tag === 'cabinet' || s.tag === 'pallet' ? 0.4 : 0.05,
        });
      }
      this.addBox(s.box, mat);
    }
  }

  private buildGate(): void {
    const g = this.world.level.gate;
    const tex = stripeTexture();
    tex.repeat.set(3, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0x442f00, emissiveIntensity: 0.4 });
    this.gateMesh = this.addBox(g, mat);
    // posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x20242e, metalness: 0.6, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.6), postMat);
      post.position.set(g.center.x + sx * (g.half.x + 0.2), 3, g.center.z);
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  private buildLaneDeco(): void {
    const tex = chevronTexture();
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.02, 11 - i * 2.4);
      this.scene.add(m);
    }
  }

  private makeItemMesh(kind: ItemKind): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'wrench') {
      const steel = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 0.8, roughness: 0.3 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), steel);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.08), steel);
      head.position.y = 0.28;
      g.add(handle, head);
    } else if (kind === 'flashlight') {
      const body = new THREE.MeshStandardMaterial({ color: 0xffcf3f, metalness: 0.3, roughness: 0.5 });
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), body);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.07, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c0, emissiveIntensity: 0.5 }),
      );
      lens.position.y = 0.2;
      g.add(tube, lens);
    } else {
      g.add(this.makeEngineMesh());
    }
    return g;
  }

  private makeEngineMesh(): THREE.Object3D {
    const g = new THREE.Group();
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.7, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x3b6ea5, metalness: 0.6, roughness: 0.4 }),
    );
    block.castShadow = true;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.25, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x5a6473, metalness: 0.7, roughness: 0.3 }),
    );
    top.position.y = 0.46;
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xb5793c, metalness: 0.8, roughness: 0.3 }),
      );
      pipe.position.set(-0.2 + i * 0.2, 0.2, 0.56);
      pipe.rotation.x = Math.PI / 2;
      g.add(pipe);
    }
    g.add(block, top);
    return g;
  }

  private buildItems(): void {
    for (const it of this.world.items) {
      const m = this.makeItemMesh(it.kind);
      m.position.set(it.pos.x, it.pos.y, it.pos.z);
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.scene.add(m);
      this.itemMeshes.set(it.id, m);
    }
  }

  private buildKart(): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.5, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xe5484d, metalness: 0.3, roughness: 0.5 }),
    );
    body.position.y = 0.55;
    body.castShadow = true;
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x222831 }),
    );
    seat.position.set(0, 0.95, 0.2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.8 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * 0.85, 0.4, sz * 0.85);
        w.castShadow = true;
        g.add(w);
      }
    }
    this.kartEngine = this.makeEngineMesh();
    this.kartEngine.scale.setScalar(0.7);
    this.kartEngine.position.set(0, 0.95, -0.85);
    this.kartEngine.visible = false;
    g.add(body, seat, this.kartEngine);
    this.scene.add(g);
    this.kartGroup = g;
  }

  private buildCheckpoints(): void {
    for (const cp of this.world.level.checkpoints) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(CHECKPOINT_RADIUS * 0.7, 0.18, 10, 28),
        new THREE.MeshStandardMaterial({ color: 0x38e0c8, emissive: 0x0a3530, emissiveIntensity: 0.6 }),
      );
      ring.position.set(cp.x, 1.6, cp.z);
      this.scene.add(ring);
      this.checkpointMeshes.push(ring);
    }
  }

  private buildClockIn(): void {
    const p = this.world.level.clockInPos;
    this.clockScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x0a141f, emissive: 0x123, emissiveIntensity: 0.5 }),
    );
    this.clockScreen.position.set(p.x, 1.5, p.z + 0.42);
    this.scene.add(this.clockScreen);
  }

  private buildHeld(): void {
    this.vmPivot = new THREE.Group();
    this.camera.add(this.vmPivot);
    this.vmPivot.add(buildHands());

    this.heldEngine = this.makeEngineMesh();
    this.heldEngine.scale.setScalar(0.55);
    this.heldEngine.position.set(0, -0.5, -1.1);
    this.heldEngine.visible = false;
    this.vmPivot.add(this.heldEngine);

    for (const kind of ['wrench', 'flashlight'] as ItemKind[]) {
      const tool = this.makeItemMesh(kind);
      tool.scale.setScalar(0.8);
      tool.position.set(0.26, -0.3, -0.55);
      tool.rotation.set(0.3, -0.3, 0.2);
      tool.visible = false;
      this.vmPivot.add(tool);
      this.heldTools.set(kind, tool);
    }
  }

  // ---- small mesh helpers for procedural props ----
  private mat(color: number, metalness = 0.3, roughness = 0.6, emissive = 0x000000, ei = 0) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: ei });
  }
  private bx(w: number, h: number, d: number, color: number, metalness = 0.3, roughness = 0.6): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color, metalness, roughness));
    m.receiveShadow = true;
    return m;
  }
  private cy(rt: number, rb: number, h: number, color: number, seg = 14, metalness = 0.4, roughness = 0.5): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(color, metalness, roughness));
    m.receiveShadow = true;
    return m;
  }

  private buildSky(): void {
    const ext = this.world.level.exterior;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(ext.skyTop, ext.skyHorizon), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.scene.add(dome);
  }

  private buildExterior(): void {
    const ext = this.world.level.exterior;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 380),
      new THREE.MeshStandardMaterial({ color: ext.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, 130);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // a rolled-up door bundle tucked under the lintel
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.7, 0.5),
      new THREE.MeshStandardMaterial({ map: doorTexture(), metalness: 0.3, roughness: 0.6 }),
    );
    door.position.set(0, 4.35, 20.35);
    this.scene.add(door);
  }

  private buildProps(): void {
    const props = this.world.level.props;
    // instanced (repeated) kinds for flat draw-call cost
    this.instanceProps(
      props.filter((p) => p.kind === 'ceilingLight'),
      new THREE.BoxGeometry(2.4, 0.14, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0cf, emissiveIntensity: 1.4 }),
      0,
    );
    this.instanceProps(
      props.filter((p) => p.kind === 'window'),
      new THREE.PlaneGeometry(2.6, 1.7),
      new THREE.MeshStandardMaterial({ color: 0xa9cdef, emissive: 0x9ec4ec, emissiveIntensity: 0.85, side: THREE.DoubleSide }),
      0,
    );
    this.instanceProps(
      props.filter((p) => p.kind === 'fence'),
      new THREE.BoxGeometry(0.1, 1.5, 0.1),
      this.mat(0x6a7180, 0.6, 0.5),
      0.75,
    );
    const inst = new Set(['ceilingLight', 'window', 'fence']);
    for (const p of props) {
      if (inst.has(p.kind)) continue;
      const o = this.buildProp(p);
      if (!o) continue;
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.rot) o.rotation.y = p.rot;
      if (p.scale && p.scale !== 1) o.scale.setScalar(p.scale);
      this.scene.add(o);
    }
  }

  private instanceProps(list: Prop[], geo: THREE.BufferGeometry, material: THREE.Material, yOff: number): void {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    list.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(0, p.rot ?? 0, 0));
      s.setScalar(p.scale ?? 1);
      m.compose(new THREE.Vector3(p.pos.x, p.pos.y + yOff, p.pos.z), q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    this.scene.add(im);
  }

  private buildProp(p: Prop): THREE.Object3D | null {
    switch (p.kind) {
      case 'barrel':
        return this.makeBarrel(p.color ?? 0x3f7d4f);
      case 'tire':
        return this.makeTireStack();
      case 'toolbox':
        return this.makeToolbox(p.color ?? 0xd14b3a);
      case 'jackstand':
        return this.makeJackstand();
      case 'hoist':
        return this.makeHoist();
      case 'shelf':
        return this.makeShelf();
      case 'toolwall':
        return this.makeToolwall();
      case 'poster':
        return this.makePoster(false);
      case 'posterSymbol':
        return this.makePoster(true);
      case 'pipe':
        return this.makePipe(p.scale ?? 1);
      case 'cone':
        return this.makeCone();
      case 'parkingLine':
        return this.makeParkingLines();
      case 'van':
        return this.makeVan(p.color ?? 0x394b6b);
      case 'yardLight':
        return this.makeYardLight();
      case 'silhouette':
        return this.makeSilhouette(p.color ?? 0x2c3550);
      default:
        return null;
    }
  }

  private makeBarrel(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.0, 16), new THREE.MeshStandardMaterial({ map: metalTexture('#888'), color, metalness: 0.5, roughness: 0.5 }));
    body.position.y = 0.5;
    body.castShadow = true;
    const top = this.cy(0.36, 0.36, 0.07, 0x202225, 16);
    top.position.y = 1.0;
    const rim = this.cy(0.36, 0.36, 0.05, 0x202225, 16);
    rim.position.y = 0.55;
    g.add(body, top, rim);
    return g;
  }

  private makeTireStack(): THREE.Group {
    const g = new THREE.Group();
    const tex = tireTexture();
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18), new THREE.MeshStandardMaterial({ map: tex, color: 0x20232a, roughness: 0.9 }));
      t.position.y = 0.16 + i * 0.32;
      t.castShadow = true;
      g.add(t);
    }
    return g;
  }

  private makeToolbox(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = this.bx(0.7, 0.36, 0.42, color, 0.3, 0.5);
    body.position.y = 0.18;
    body.castShadow = true;
    const lid = this.bx(0.74, 0.1, 0.46, color, 0.3, 0.5);
    lid.position.y = 0.4;
    const handle = this.bx(0.3, 0.05, 0.05, 0x222222);
    handle.position.y = 0.5;
    g.add(body, lid, handle);
    return g;
  }

  private makeJackstand(): THREE.Group {
    const g = new THREE.Group();
    const base = this.cy(0.26, 0.32, 0.1, 0x9aa0aa, 4);
    base.position.y = 0.05;
    const post = this.bx(0.08, 0.5, 0.08, 0xb6bcc6, 0.6, 0.4);
    post.position.y = 0.32;
    const saddle = this.bx(0.2, 0.08, 0.12, 0xb6bcc6, 0.6, 0.4);
    saddle.position.y = 0.58;
    g.add(base, post, saddle);
    return g;
  }

  private makeHoist(): THREE.Group {
    const g = new THREE.Group();
    const steel = 0xd1772f;
    const mast = this.bx(0.16, 2.3, 0.16, steel, 0.5, 0.5);
    mast.position.set(-0.7, 1.15, 0);
    const leg = this.bx(0.16, 0.14, 1.8, steel, 0.5, 0.5);
    leg.position.set(-0.7, 0.07, 0);
    const arm = this.bx(1.7, 0.16, 0.16, steel, 0.5, 0.5);
    arm.position.set(0.1, 2.1, 0);
    const chain = this.cy(0.03, 0.03, 0.8, 0x555a63, 6);
    chain.position.set(0.85, 1.6, 0);
    const engine = this.makeEngineMesh();
    engine.scale.setScalar(0.6);
    engine.position.set(0.85, 1.0, 0);
    g.add(mast, leg, arm, chain, engine);
    return g;
  }

  private makeShelf(): THREE.Group {
    const g = new THREE.Group();
    const frame = 0x4a5160;
    for (const x of [-0.9, 0.9]) for (const z of [-0.4, 0.4]) {
      const up = this.bx(0.08, 2.0, 0.08, frame, 0.4, 0.6);
      up.position.set(x, 1.0, z);
      g.add(up);
    }
    for (let i = 0; i < 3; i++) {
      const sh = this.bx(1.9, 0.06, 0.9, 0x6b7280, 0.3, 0.6);
      sh.position.y = 0.4 + i * 0.7;
      g.add(sh);
      const cratecolor = [0xb5793c, 0x3f7d4f, 0x2f7fd1][i % 3];
      const cr = this.bx(0.5, 0.4, 0.5, cratecolor, 0.1, 0.8);
      cr.position.set(-0.5 + (i % 2) * 0.9, 0.4 + i * 0.7 + 0.23, 0);
      g.add(cr);
    }
    return g;
  }

  private makeToolwall(): THREE.Group {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x394150, roughness: 0.7 }));
    g.add(panel);
    const tools = [0xc8d0dc, 0xffcf3f, 0xd14b3a, 0x9aa0aa];
    for (let i = 0; i < 5; i++) {
      const t = this.bx(0.08 + Math.random() * 0.1, 0.5 + Math.random() * 0.3, 0.06, tools[i % tools.length], 0.7, 0.3);
      t.position.set(-1.2 + i * 0.6, 0.1, 0.12);
      g.add(t);
    }
    return g;
  }

  private makePoster(symbol: boolean): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: posterTexture(symbol), side: THREE.DoubleSide }),
    );
    return m;
  }

  private makePipe(scale: number): THREE.Group {
    const g = new THREE.Group();
    const pipe = this.cy(0.12, 0.12, 9 * scale, 0x8a8f99, 10, 0.6, 0.4);
    pipe.rotation.x = Math.PI / 2;
    g.add(pipe);
    return g;
  }

  private makeCone(): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 14), this.mat(0xff7a2a, 0.1, 0.7));
    cone.position.y = 0.28;
    const base = this.bx(0.42, 0.06, 0.42, 0xff7a2a, 0.1, 0.7);
    base.position.y = 0.03;
    const band = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 14), this.mat(0xf5f5f5, 0.1, 0.6));
    band.position.y = 0.34;
    g.add(cone, base, band);
    return g;
  }

  private makeParkingLines(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffcf3f, emissive: 0x4a3a00, emissiveIntensity: 0.5, roughness: 0.7 });
    const w = 3.6;
    const d = 4.8;
    const t = 0.14;
    const mk = (sx: number, sz: number, lx: number, lz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.04, sz), mat);
      m.position.set(lx, 0.02, lz);
      g.add(m);
    };
    mk(w, t, 0, -d / 2);
    mk(w, t, 0, d / 2);
    mk(t, d, -w / 2, 0);
    mk(t, d, w / 2, 0);
    return g;
  }

  private makeVan(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = this.bx(2.1, 1.5, 4.2, color, 0.3, 0.5);
    body.position.y = 1.1;
    body.castShadow = true;
    const cab = this.bx(2.0, 0.9, 1.2, color, 0.3, 0.5);
    cab.position.set(0, 0.85, -1.7);
    const glass = this.bx(1.85, 0.6, 0.1, 0x0d1622, 0.1, 0.2);
    glass.position.set(0, 1.05, -2.32);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffa000, emissiveIntensity: 1.2 }));
    beacon.position.set(0, 1.95, -1.4);
    g.add(body, cab, glass, beacon);
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) {
      const w = this.cy(0.45, 0.45, 0.3, 0x16181d, 14, 0.3, 0.8);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 1.05, 0.45, sz);
      g.add(w);
    }
    return g;
  }

  private makeYardLight(): THREE.Group {
    const g = new THREE.Group();
    const post = this.cy(0.1, 0.12, 4.2, 0x3c424d, 8);
    post.position.y = 2.1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffe6a0, emissiveIntensity: 1.4 }));
    head.position.set(0, 4.1, 0.2);
    const lamp = new THREE.PointLight(0xffe6b0, 60, 26, 2);
    lamp.position.set(0, 4.0, 0.2);
    g.add(post, head, lamp);
    return g;
  }

  private makeSilhouette(color: number): THREE.Mesh {
    const geo = new THREE.ConeGeometry(26, 16, 7);
    geo.translate(0, 8, 0); // base on the ground
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  }

  /** Snapshot the latest sim transforms (call right after each world.step). */
  capture(): void {
    this.prevEye = this.curEye;
    this.curEye = { ...this.world.eyePos() };
    this.prevKart = this.curKart;
    this.curKart = { pos: { ...this.world.kart.pos }, heading: this.world.kart.heading };
  }

  frame(dt: number, alpha: number, yaw: number, pitch: number): void {
    const w = this.world;
    const eye = {
      x: lerp(this.prevEye.x, this.curEye.x, alpha),
      y: lerp(this.prevEye.y, this.curEye.y, alpha),
      z: lerp(this.prevEye.z, this.curEye.z, alpha),
    };
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;

    // speed-driven FOV kick + transient pulses (juice)
    const speed = w.player.mode === 'kart' ? Math.abs(w.kart.speed) : Math.hypot(w.player.vel.x, w.player.vel.z);
    const targetFov = this.baseFov + (Math.min(speed, 18) / 18) * 8 + this.fovPulse;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
    this.fovPulse *= 0.9;

    this.camera.position.set(eye.x, eye.y, eye.z);
    if (this.settings.accessibility.screenshake && this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.shake *= 0.85;

    // viewmodel bob/sway
    this.vmTime += dt * (4 + speed);
    if (this.vmPivot) {
      const amp = this.settings.accessibility.headbob ? 1 : 0.4;
      const sp = Math.min(speed / 8, 1.4);
      this.vmPivot.position.y = Math.sin(this.vmTime) * 0.012 * sp * amp;
      this.vmPivot.position.x = Math.cos(this.vmTime * 0.5) * 0.01 * sp * amp;
    }

    // kart exhaust + ambient dust
    if (w.player.mode === 'kart' && Math.abs(w.kart.speed) > 1.5) {
      const h = w.kart.heading;
      this.particles.exhaust({ x: w.kart.pos.x + Math.sin(h) * 1.4, y: 0.5, z: w.kart.pos.z + Math.cos(h) * 1.4 });
    }
    this.particles.update(dt, { x: 0, y: 1.4, z: 17, r: 3.2 });

    // gate slides up as it opens
    const target = w.gateOpen ? 1 : 0;
    this.gateAnim += (target - this.gateAnim) * Math.min(1, 0.08);
    this.gateMesh.position.y = closedGateY(w.level.gate) + this.gateAnim * 4.2;

    // items: hide when picked
    for (const it of w.items) {
      const m = this.itemMeshes.get(it.id);
      if (!m) continue;
      m.visible = !it.picked;
      if (!it.picked) {
        m.position.set(it.pos.x, it.pos.y, it.pos.z);
        m.rotation.y += 0.01;
      }
    }

    // kart transform (interpolated) + installed engine reveal
    const kpos = {
      x: lerp(this.prevKart.pos.x, this.curKart.pos.x, alpha),
      z: lerp(this.prevKart.pos.z, this.curKart.pos.z, alpha),
    };
    this.kartGroup.position.set(kpos.x, 0, kpos.z);
    this.kartGroup.rotation.y = lerpAngle(this.prevKart.heading, this.curKart.heading, alpha);
    this.kartEngine.visible = w.kart.engineInstalled;
    this.kartGroup.visible = w.player.mode !== 'kart'; // hide chassis in first-person drive

    // held items
    this.heldEngine.visible = w.player.carrying === 'engine';
    const sel = w.player.hotbar[w.player.selSlot];
    for (const [kind, mesh] of this.heldTools) {
      mesh.visible = w.player.mode === 'foot' && !w.player.carrying && sel === kind;
    }

    // checkpoints state coloring
    const t = performance.now() * 0.004;
    this.checkpointMeshes.forEach((ring, i) => {
      const mat = ring.material as THREE.MeshStandardMaterial;
      ring.rotation.y += 0.01;
      if (i < w.cpIndex) {
        mat.color.setHex(0x2faf6a);
        mat.emissive.setHex(0x0a3018);
        ring.visible = true;
      } else if (i === w.cpIndex && w.kart.engineInstalled) {
        mat.color.setHex(0xffcf3f);
        mat.emissive.setHex(0x4a3500);
        mat.emissiveIntensity = 0.6 + 0.4 * Math.sin(t);
        ring.visible = true;
      } else {
        mat.color.setHex(0x38e0c8);
        mat.emissive.setHex(0x0a3530);
        ring.visible = w.player.mode === 'kart';
      }
    });

    // clock-in screen glows when the mission is ready to finish
    const screenMat = this.clockScreen.material as THREE.MeshStandardMaterial;
    if (w.objectives.readyToClockOut()) {
      screenMat.emissive.setHex(0x1f9d57);
      screenMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(t);
    } else {
      screenMat.emissive.setHex(0x113322);
      screenMat.emissiveIntensity = 0.3;
    }

    this.post.render(dt, this.scene, this.camera);
  }

  applySettings(s: Settings): void {
    const rebuild = s.video.postfx !== this.settings.video.postfx || s.video.quality !== this.settings.video.quality;
    this.settings = s;
    this.baseFov = s.video.fov;
    this.renderer.toneMappingExposure = s.video.brightness;
    this.renderer.shadowMap.enabled = s.video.shadows;
    if (rebuild) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.post = new Post(this.renderer, this.scene, this.camera, s.video.quality, s.video.postfx);
      this.post.setSize(innerWidth, innerHeight);
    }
  }

  pulse(fov: number, shake: number): void {
    this.fovPulse += fov;
    this.shake += shake;
  }
  gateFx(): void {
    this.pulse(7, 0.28);
  }
  installFx(): void {
    const k = this.world.kart.pos;
    this.particles.sparks({ x: k.x, y: 1.0, z: k.z });
    this.pulse(2, 0.18);
  }
  checkpointFx(): void {
    const k = this.world.kart.pos;
    this.particles.burst({ x: k.x, y: 1.2, z: k.z }, [1, 0.82, 0.25]);
    this.pulse(3, 0.2);
  }
  pickupFx(): void {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const e = this.world.eyePos();
    this.particles.sparkle({ x: e.x + d.x * 1.3, y: e.y + d.y * 1.3, z: e.z + d.z * 1.3 });
  }
}
