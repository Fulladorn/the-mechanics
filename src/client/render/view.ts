import * as THREE from 'three';
import { lerp, lerpAngle, type Vec3 } from '../../shared/math';
import { CHECKPOINT_RADIUS } from '../../shared/constants';
import type { World } from '../../sim/world';
import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
  floorNormalTexture,
  wallNormalTexture,
} from './textures';
import type { Prop } from '../../content/levels/garage';
import type { Settings } from '../settings';
import { isDrivable, variantById, type PartKind, type PartVariant } from '../../sim/vehicle';
import { Post } from './post';
import { Particles } from './particles';
import { buildHands } from './viewmodel';

const disposeTree = (o: THREE.Object3D): void => {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      const m = c.material as THREE.Material | THREE.Material[];
      Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
    }
  });
};

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
  private socketMeshes = new Map<string, THREE.Group>();
  private socketState = new Map<string, string | null>();
  private bodyMat?: THREE.MeshStandardMaterial;
  private lastBodyColor = -1;
  private checkpointMeshes: THREE.Mesh[] = [];
  private clockScreen!: THREE.Mesh;
  private heldPart!: THREE.Group;
  private heldKey = '';
  private heldTools = new Map<ItemKind, THREE.Object3D>();
  private settings: Settings;
  private post!: Post;
  private particles!: Particles;
  private vmPivot!: THREE.Group;
  private baseFov: number;
  private fovPulse = 0;
  private shake = 0;
  private vmTime = 0;
  private clock = 0;
  private animated: { o: THREE.Object3D; kind: string; phase: number; data: Record<string, number | boolean> }[] = [];
  private weldLight?: THREE.PointLight;

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

    const hi = settings.video.quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2.5 : 2));
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

    // image-based lighting: real reflections on metals + the car's clearcoat
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.5;
      pmrem.dispose();
    } catch {
      /* env optional (weak GPU) */
    }

    const hemi = new THREE.HemisphereLight(0xb4c8e8, 0x3a3832, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
    sun.position.set(14, 28, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    const s = 40;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    this.scene.add(sun);

    // warm shop fill lights
    for (const z of [-18, -6, 8]) {
      const fill = new THREE.PointLight(0xffeede, 38, 30, 2);
      fill.position.set(0, 4.6, z);
      this.scene.add(fill);
    }
    // a focused work light over the build lift
    const liftSpot = new THREE.SpotLight(0xfff3da, 140, 16, Math.PI / 5, 0.5, 2);
    liftSpot.position.set(0, 6.2, -6);
    liftSpot.target.position.set(0, 0, -6);
    this.scene.add(liftSpot, liftSpot.target);

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
    this.buildVehicle();
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
    const floorNorm = floorNormalTexture();
    const wallTex = wallPanelTexture();
    const wallNorm = wallNormalTexture();
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
        floorNorm.repeat.set(s.box.half.x, s.box.half.z);
        mat = new THREE.MeshStandardMaterial({
          map: floorTex,
          normalMap: floorNorm,
          normalScale: new THREE.Vector2(0.5, 0.5),
          roughness: 0.92,
          metalness: 0.06,
        });
      } else if (s.tag === 'wall' || s.tag === 'divider') {
        const rx = Math.max(s.box.half.x, s.box.half.z) / 2;
        const ry = Math.max(s.box.half.y, 1) / 1.5;
        const t = wallTex.clone();
        t.needsUpdate = true;
        t.repeat.set(rx, ry);
        const n = wallNorm.clone();
        n.needsUpdate = true;
        n.repeat.set(rx, ry);
        mat = new THREE.MeshStandardMaterial({
          map: t,
          normalMap: n,
          normalScale: new THREE.Vector2(0.55, 0.55),
          color: s.color,
          roughness: 0.85,
          metalness: 0.12,
        });
      } else if (s.tag === 'roof') {
        const rx = s.box.half.x / 3;
        const rz = s.box.half.z / 3;
        const t = wallTex.clone();
        t.needsUpdate = true;
        t.repeat.set(rx, rz);
        const n = wallNorm.clone();
        n.needsUpdate = true;
        n.repeat.set(rx, rz);
        mat = new THREE.MeshStandardMaterial({
          map: t,
          normalMap: n,
          normalScale: new THREE.Vector2(0.4, 0.4),
          color: s.color,
          roughness: 0.9,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
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

  private makeEngineMesh(color = 0x3b6ea5): THREE.Object3D {
    const g = new THREE.Group();
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.7, 1.1),
      new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }),
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

  // The buildable vehicle: a bare chassis frame + an (initially empty) child
  // group per socket. frame() fills/swaps a socket group as parts are installed.
  private buildVehicle(): void {
    const g = new THREE.Group();
    const frameMat = this.mat(0x3a3f48, 0.7, 0.5);
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 2.5), frameMat);
    railL.position.set(-0.6, 0.45, 0);
    const railR = railL.clone();
    railR.position.x = 0.6;
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.18), frameMat);
    cross1.position.set(0, 0.45, -0.9);
    const cross2 = cross1.clone();
    cross2.position.z = 0.9;
    const pan = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.9), this.mat(0x2a2f38, 0.5, 0.6));
    pan.position.set(0, 0.4, 0);
    g.add(railL, railR, cross1, cross2, pan);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    for (const s of this.world.vehicle.sockets) {
      const sg = new THREE.Group();
      sg.position.set(s.anchor.x, s.anchor.y, s.anchor.z);
      g.add(sg);
      this.socketMeshes.set(s.id, sg);
      this.socketState.set(s.id, null);
    }
    this.scene.add(g);
    this.kartGroup = g;
  }

  /** Build the mesh for an installed part variant. */
  private makePart(kind: PartKind, variant: PartVariant, bodyColor: number): THREE.Object3D {
    const col = variant.render.color ?? 0x8a8f99;
    const shape = variant.render.shape ?? '';
    switch (kind) {
      case 'wheel': {
        const g = new THREE.Group();
        const w = shape === 'slick' ? 0.42 : 0.3;
        const r = shape === 'offroad' ? 0.46 : 0.4;
        const tire = this.cy(r, r, w, col, 18, 0.2, 0.85);
        tire.rotation.z = Math.PI / 2;
        const hub = this.cy(0.16, 0.16, w + 0.02, 0xc8d0dc, 10, 0.8, 0.3);
        hub.rotation.z = Math.PI / 2;
        g.add(tire, hub);
        if (shape === 'offroad') {
          for (let i = 0; i < 10; i++) {
            const lug = this.bx(0.08, 0.08, w + 0.04, 0x0e1013, 0.2, 0.9);
            const a = (i / 10) * Math.PI * 2;
            lug.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
            g.add(lug);
          }
        }
        g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
        return g;
      }
      case 'engine':
        return this.makeEngineMesh(col);
      case 'battery':
        return this.bx(0.34, 0.34, 0.5, col, 0.2, 0.6);
      case 'seat': {
        const g = new THREE.Group();
        const base = this.bx(0.6, 0.18, 0.6, col, 0.1, 0.8);
        base.position.y = 0.1;
        const back = this.bx(0.6, 0.7, 0.16, col, 0.1, 0.8);
        back.position.set(0, 0.45, 0.28);
        g.add(base, back);
        g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
        return g;
      }
      case 'body': {
        const g = new THREE.Group();
        const wide = shape === 'armor' ? 1.9 : 1.7;
        const paint = () =>
          new THREE.MeshPhysicalMaterial({
            color: bodyColor,
            metalness: 0.5,
            roughness: 0.32,
            clearcoat: 1.0,
            clearcoatRoughness: 0.18,
          });
        const shell = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.5, 2.3), paint());
        shell.name = 'shell';
        shell.castShadow = true;
        const hood = new THREE.Mesh(new THREE.BoxGeometry(wide - 0.2, 0.22, 0.9), paint());
        hood.name = 'shell2';
        hood.position.set(0, 0.32, -0.7);
        hood.castShadow = true;
        g.add(shell, hood);
        if (shape === 'armor') {
          for (const sx of [-1, 1]) {
            const plate = this.bx(0.16, 0.5, 2.0, 0x6b7280, 0.6, 0.5);
            plate.position.set(sx * (wide / 2 + 0.02), 0, 0);
            g.add(plate);
          }
        }
        return g;
      }
      case 'bumper':
        return this.bx(shape === '' ? 1.7 : 1.9, 0.22, 0.25, col, 0.5, 0.5);
      case 'headlights': {
        const g = new THREE.Group();
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: 1.6 }),
          );
          lamp.rotation.x = Math.PI / 2;
          lamp.position.set(sx * 0.55, 0, 0);
          g.add(lamp);
        }
        return g;
      }
      case 'spoiler': {
        const g = new THREE.Group();
        const wing = this.bx(1.5, 0.08, 0.4, col, 0.4, 0.4);
        wing.position.y = 0.3;
        for (const sx of [-1, 1]) {
          const strut = this.bx(0.08, 0.3, 0.12, col, 0.4, 0.4);
          strut.position.set(sx * 0.6, 0.15, 0);
          g.add(strut);
        }
        g.add(wing);
        g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
        return g;
      }
      case 'exhaust': {
        const g = new THREE.Group();
        const pipe = this.cy(0.06, 0.06, 0.7, col, 10, 0.8, 0.3);
        pipe.rotation.x = Math.PI / 2;
        const tip = this.cy(0.09, 0.07, 0.12, 0xdfe3ea, 10, 0.9, 0.2);
        tip.rotation.x = Math.PI / 2;
        tip.position.z = 0.4;
        g.add(pipe, tip);
        return g;
      }
      default:
        return new THREE.Group();
    }
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

    this.heldPart = new THREE.Group();
    this.heldPart.position.set(0, -0.5, -1.0);
    this.heldPart.visible = false;
    this.vmPivot.add(this.heldPart);

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
    const grassGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
    grassGeo.translate(0, 0.25, 0);
    this.instanceProps(
      props.filter((p) => p.kind === 'grass'),
      grassGeo,
      this.mat(0x4f7a3a, 0, 0.95),
      0,
    );

    const inst = new Set(['ceilingLight', 'window', 'fence', 'grass']);
    const ANIM = new Set(['fan', 'hangLamp', 'banner', 'bird', 'cloud', 'gauge']);
    for (const p of props) {
      if (inst.has(p.kind)) continue;
      const o = this.buildProp(p);
      if (!o) continue;
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.rot) o.rotation.y = p.rot;
      if (p.scale && p.scale !== 1) o.scale.setScalar(p.scale);
      this.scene.add(o);
      if (p.kind === 'weldBot') {
        const w = { x: p.pos.x, y: 0.95, z: p.pos.z + 1.3 };
        this.weldLight = new THREE.PointLight(0x9fd0ff, 0, 9, 2);
        this.weldLight.position.set(w.x, w.y, w.z);
        this.scene.add(this.weldLight);
        this.animated.push({ o, kind: 'weldBot', phase: 0, data: { wx: w.x, wy: w.y, wz: w.z, t: 0, on: false } });
      } else if (ANIM.has(p.kind)) {
        this.animated.push({ o, kind: p.kind, phase: Math.random() * Math.PI * 2, data: { x: p.pos.x, y: p.pos.y, z: p.pos.z } });
      }
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
      case 'fan':
        return this.makeFan();
      case 'hangLamp':
        return this.makeHangLamp();
      case 'weldBot':
        return this.makeWeldBot();
      case 'toolchest':
        return this.makeToolchest(p.color ?? 0xcf3b34);
      case 'lockers':
        return this.makeLockers();
      case 'compressor':
        return this.makeCompressor();
      case 'workbench':
        return this.makeWorkbench();
      case 'cables':
        return this.makeCables(p.scale ?? 1);
      case 'sign':
        return this.makeSign();
      case 'banner':
        return this.makeBanner();
      case 'gauge':
        return this.makeGauge();
      case 'fireext':
        return this.makeFireext();
      case 'jerrycan':
        return this.makeJerrycan(p.color ?? 0xcf3b34);
      case 'crateStack':
        return this.makeCrateStack();
      case 'oilStain':
        return this.makeOilStain();
      case 'tireMark':
        return this.makeTireMark();
      case 'tree':
        return this.makeTree();
      case 'powerpole':
        return this.makePowerpole();
      case 'cloud':
        return this.makeCloud();
      case 'bird':
        return this.makeBird();
      case 'roadline':
        return this.makeRoadline();
      case 'lift':
        return this.makeLift();
      case 'paintStation':
        return this.makePaintStation();
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
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffe6a0, emissiveIntensity: 1.1 }));
    head.position.set(0, 4.1, 0.2);
    const lamp = new THREE.PointLight(0xffe6b0, 9, 12, 2);
    lamp.position.set(0, 3.9, 0.4);
    g.add(post, head, lamp);
    return g;
  }

  private makeSilhouette(color: number): THREE.Mesh {
    const geo = new THREE.ConeGeometry(26, 16, 7);
    geo.translate(0, 8, 0); // base on the ground
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  }

  private makeFan(): THREE.Group {
    const g = new THREE.Group();
    const rod = this.cy(0.04, 0.04, 0.5, 0x3a3f48, 6);
    rod.position.y = 0.25;
    const motor = this.cy(0.18, 0.18, 0.18, 0x2a2f38, 10);
    const blades = new THREE.Group();
    blades.name = 'spin';
    for (const r of [0, Math.PI / 2]) {
      const b = this.bx(1.8, 0.04, 0.26, 0x9aa0aa, 0.4, 0.6);
      b.rotation.y = r;
      blades.add(b);
    }
    blades.position.y = -0.07;
    g.add(rod, motor, blades);
    return g;
  }

  private makeHangLamp(): THREE.Group {
    const g = new THREE.Group();
    const cord = this.cy(0.015, 0.015, 0.7, 0x222222, 6);
    cord.position.y = 0.55;
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.26, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    );
    shade.position.y = 0.1;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe6a8, emissiveIntensity: 2.4 }),
    );
    bulb.position.y = 0.02;
    g.add(cord, shade, bulb);
    return g;
  }

  private makeWeldBot(): THREE.Group {
    const g = new THREE.Group();
    const steel = 0xffb020;
    const base = this.cy(0.4, 0.5, 0.4, 0x2f3540, 12);
    base.position.y = 0.2;
    const col = this.bx(0.3, 0.95, 0.3, steel, 0.5, 0.5);
    col.position.y = 0.75;
    const arm = new THREE.Group();
    arm.name = 'arm';
    arm.position.set(0, 1.15, 0);
    const a1 = this.bx(0.95, 0.16, 0.16, steel, 0.5, 0.5);
    a1.position.set(0.42, 0, 0);
    const a2 = this.bx(0.16, 0.6, 0.16, 0x3a3f48, 0.6, 0.4);
    a2.position.set(0.85, -0.3, 0);
    const torch = this.cy(0.04, 0.06, 0.26, 0x888888, 8);
    torch.position.set(0.85, -0.64, 0);
    arm.add(a1, a2, torch);
    const stand = this.bx(0.1, 0.85, 0.1, 0x3a3f48);
    stand.position.set(0, 0.42, 1.3);
    const plate = this.bx(1.3, 0.1, 0.85, 0x6a7180, 0.7, 0.4);
    plate.position.set(0, 0.85, 1.3);
    g.add(base, col, arm, stand, plate);
    return g;
  }

  private makeToolchest(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = this.bx(1.1, 1.0, 0.6, color, 0.4, 0.45);
    body.position.y = 0.55;
    body.castShadow = true;
    const top = this.bx(1.16, 0.06, 0.66, 0x2a2f38);
    top.position.y = 1.08;
    g.add(body, top);
    for (let i = 0; i < 4; i++) {
      const gap = this.bx(1.02, 0.02, 0.62, 0x1a1d24);
      gap.position.set(0, 0.28 + i * 0.2, 0);
      const handle = this.bx(0.3, 0.03, 0.04, 0xdfe3ea);
      handle.position.set(0, 0.35 + i * 0.2, 0.31);
      g.add(gap, handle);
    }
    for (const sx of [-1, 1]) {
      const w = this.cy(0.09, 0.09, 0.08, 0x16181d, 10);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.45, 0.07, 0.2);
      g.add(w);
    }
    return g;
  }

  private makeLockers(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const x = -0.62 + i * 0.62;
      const l = this.bx(0.6, 2.0, 0.5, 0x4a5566, 0.4, 0.5);
      l.position.set(x, 1.0, 0);
      const vent = this.bx(0.4, 0.3, 0.02, 0x2a313c);
      vent.position.set(x, 1.6, 0.26);
      const handle = this.bx(0.04, 0.2, 0.04, 0x20242c);
      handle.position.set(x + 0.22, 1.0, 0.27);
      g.add(l, vent, handle);
    }
    return g;
  }

  private makeCompressor(): THREE.Group {
    const g = new THREE.Group();
    const tank = this.cy(0.4, 0.4, 1.5, 0xc44a3f, 14);
    tank.rotation.z = Math.PI / 2;
    tank.position.y = 0.5;
    const motor = this.bx(0.5, 0.42, 0.5, 0x2f3540);
    motor.position.set(0, 0.98, 0);
    g.add(tank, motor);
    for (const sx of [-1, 1]) {
      const w = this.cy(0.12, 0.12, 0.1, 0x16181d, 10);
      w.rotation.x = Math.PI / 2;
      w.position.set(sx * 0.5, 0.12, 0.5);
      g.add(w);
    }
    return g;
  }

  private makeWorkbench(): THREE.Group {
    const g = new THREE.Group();
    const top = this.bx(2.4, 0.12, 0.9, 0x7a5a35, 0.1, 0.7);
    top.position.y = 0.9;
    g.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = this.bx(0.1, 0.9, 0.1, 0x3a3f48);
      leg.position.set(sx * 1.05, 0.45, sz * 0.35);
      g.add(leg);
    }
    const peg = this.bx(2.2, 1.0, 0.06, 0x394150);
    peg.position.set(0, 1.5, -0.42);
    g.add(peg);
    const tools = [0xc8d0dc, 0xffcf3f, 0xd14b3a];
    for (let i = 0; i < 4; i++) {
      const t = this.bx(0.07, 0.4 + Math.random() * 0.2, 0.05, tools[i % 3], 0.7, 0.3);
      t.position.set(-0.8 + i * 0.5, 1.5, -0.37);
      g.add(t);
    }
    const vise = this.bx(0.3, 0.22, 0.2, 0x4a525e, 0.6, 0.4);
    vise.position.set(0.85, 1.05, 0.2);
    g.add(vise);
    return g;
  }

  private makeCables(scale: number): THREE.Group {
    const g = new THREE.Group();
    const conduit = this.bx(0.08, 0.08, 4 * scale, 0x3a3f48, 0.5, 0.5);
    g.add(conduit);
    for (let i = 0; i < 3; i++) {
      const sag = this.cy(0.02, 0.02, 0.5, 0x161616, 6);
      sag.position.set(0, -0.22, -1.4 + i * 1.4);
      g.add(sag);
    }
    return g;
  }

  private makeSign(): THREE.Group {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x0c2a22, emissive: 0x1f9d57, emissiveIntensity: 1.3 }),
    );
    const bar = this.bx(1.3, 0.09, 0.1, 0x06120d);
    bar.position.z = 0.05;
    g.add(panel, bar);
    return g;
  }

  private makeBanner(): THREE.Group {
    const g = new THREE.Group();
    const rod = this.cy(0.04, 0.04, 4.2, 0x888888, 6);
    rod.rotation.z = Math.PI / 2;
    rod.position.y = 0.55;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2f5fb0, emissive: 0x12224a, emissiveIntensity: 0.3, side: THREE.DoubleSide }),
    );
    cloth.name = 'wave';
    const stripe = this.bx(3.6, 0.16, 0.02, 0xffcf3f);
    stripe.position.z = 0.012;
    cloth.add(stripe);
    g.add(rod, cloth);
    return g;
  }

  private makeGauge(): THREE.Group {
    const g = new THREE.Group();
    const face = this.cy(0.3, 0.3, 0.06, 0xeae0c0, 18);
    face.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 22), this.mat(0x2a2f38, 0.6, 0.4));
    const needle = this.bx(0.02, 0.24, 0.02, 0xd14b3a);
    needle.name = 'needle';
    needle.position.set(0, 0.08, 0.05);
    g.add(face, ring, needle);
    return g;
  }

  private makeFireext(): THREE.Group {
    const g = new THREE.Group();
    const body = this.cy(0.13, 0.15, 0.6, 0xc0231f, 12);
    body.position.y = 0.4;
    const top = this.cy(0.06, 0.06, 0.12, 0x111111, 8);
    top.position.y = 0.76;
    const horn = this.cy(0.02, 0.06, 0.18, 0x111111, 8);
    horn.position.set(0.12, 0.6, 0);
    horn.rotation.z = -0.6;
    const bracket = this.bx(0.06, 0.3, 0.2, 0x2a2f38);
    bracket.position.set(-0.12, 0.4, 0);
    g.add(body, top, horn, bracket);
    return g;
  }

  private makeJerrycan(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = this.bx(0.3, 0.45, 0.18, color, 0.2, 0.6);
    body.position.y = 0.225;
    const cap = this.cy(0.04, 0.04, 0.06, 0x111111, 8);
    cap.position.set(0.1, 0.48, 0);
    const handle = this.bx(0.04, 0.08, 0.18, 0x20242c);
    handle.position.set(0, 0.5, 0);
    g.add(body, cap, handle);
    return g;
  }

  private makeCrateStack(): THREE.Group {
    const g = new THREE.Group();
    const cols = [0xb5793c, 0x9c6a34];
    for (let i = 0; i < 3; i++) {
      const sz = 0.74 - i * 0.06;
      const c = this.bx(sz, 0.6, sz, cols[i % 2], 0.1, 0.85);
      c.position.y = 0.3 + i * 0.62;
      c.rotation.y = i % 2 ? 0.16 : -0.1;
      c.castShadow = true;
      g.add(c);
    }
    return g;
  }

  private makeOilStain(): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 18),
      new THREE.MeshStandardMaterial({
        color: 0x0a0c10,
        roughness: 0.25,
        metalness: 0.5,
        transparent: true,
        opacity: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  private makeTireMark(): THREE.Group {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 3.5),
        new THREE.MeshStandardMaterial({
          color: 0x141518,
          roughness: 0.6,
          transparent: true,
          opacity: 0.55,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set(sx * 0.5, 0, 0);
      g.add(s);
    }
    return g;
  }

  private makeTree(): THREE.Group {
    const g = new THREE.Group();
    const trunk = this.cy(0.18, 0.28, 1.6, 0x5a3f28, 8);
    trunk.position.y = 0.8;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4 - i * 0.35, 1.4, 8), this.mat(0x2f6b3a, 0, 0.95));
      c.position.y = 1.6 + i * 0.9;
      g.add(c);
    }
    return g;
  }

  private makePowerpole(): THREE.Group {
    const g = new THREE.Group();
    const pole = this.cy(0.12, 0.16, 6, 0x4a3f30, 8);
    pole.position.y = 3;
    const cross = this.bx(1.6, 0.12, 0.12, 0x4a3f30);
    cross.position.y = 5.4;
    g.add(pole, cross);
    for (const sx of [-1, 1]) {
      const ins = this.cy(0.04, 0.04, 0.12, 0x222222, 6);
      ins.position.set(sx * 0.7, 5.52, 0);
      g.add(ins);
    }
    return g;
  }

  private makeCloud(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xf2f5fb, emissive: 0xdfe7f2, emissiveIntensity: 0.18, roughness: 1, fog: true });
    for (const [dx, dy, dz, r] of [
      [0, 0, 0, 2.2],
      [1.8, 0.2, 0, 1.6],
      [-1.8, 0.1, 0.3, 1.7],
      [0.6, 0.8, -0.4, 1.4],
    ]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      s.position.set(dx, dy, dz);
      s.scale.y = 0.6;
      g.add(s);
    }
    return g;
  }

  private makeBird(): THREE.Group {
    const g = new THREE.Group();
    const c = 0x2a2f38;
    const body = this.bx(0.18, 0.08, 0.12, c);
    const wing = new THREE.Group();
    wing.name = 'wing';
    const l = this.bx(0.5, 0.03, 0.18, c);
    l.position.x = -0.3;
    const r = this.bx(0.5, 0.03, 0.18, c);
    r.position.x = 0.3;
    wing.add(l, r);
    g.add(body, wing);
    g.scale.setScalar(1.3);
    return g;
  }

  private makeRoadline(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xd8c060, emissive: 0x3a3210, emissiveIntensity: 0.3 }),
      );
      d.rotation.x = -Math.PI / 2;
      d.position.set(0, 0, -16 + i * 4);
      g.add(d);
    }
    return g;
  }

  private makeLift(): THREE.Group {
    const g = new THREE.Group();
    const plate = this.bx(2.6, 0.12, 3.4, 0x2a2f38, 0.5, 0.6);
    plate.position.y = 0.06;
    g.add(plate);
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xffcf3f, emissive: 0x4a3a00, emissiveIntensity: 0.4, transparent: true, opacity: 0.25 }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.y = 0.13;
    g.add(stripe);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = this.cy(0.1, 0.12, 0.5, 0x4a525e, 8, 0.6, 0.5);
      post.position.set(sx * 1.1, 0.25, sz * 1.5);
      g.add(post);
    }
    return g;
  }

  private makePaintStation(): THREE.Group {
    const g = new THREE.Group();
    const cab = this.bx(1.0, 1.2, 0.7, 0x394150, 0.4, 0.6);
    cab.position.y = 0.6;
    cab.castShadow = true;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x0a141f, emissive: 0x2f7fd1, emissiveIntensity: 1.0 }),
    );
    screen.position.set(0, 0.9, 0.36);
    g.add(cab, screen);
    const cols = [0xe5484d, 0x2f7fd1, 0x39b36b, 0xf1c40f];
    cols.forEach((c, i) => {
      const can = this.cy(0.09, 0.09, 0.26, c, 10, 0.3, 0.5);
      can.position.set(-0.33 + i * 0.22, 1.33, 0);
      g.add(can);
    });
    return g;
  }

  private updateAnimated(dt: number): void {
    this.clock += dt;
    const t = this.clock;
    for (const a of this.animated) {
      const d = a.data;
      switch (a.kind) {
        case 'fan': {
          const b = a.o.getObjectByName('spin');
          if (b) b.rotation.y += dt * 7;
          break;
        }
        case 'hangLamp':
          a.o.position.y = (d.y as number) + Math.sin(t * 1.4 + a.phase) * 0.05;
          a.o.rotation.z = Math.sin(t * 1.1 + a.phase) * 0.05;
          break;
        case 'banner': {
          const w = a.o.getObjectByName('wave');
          if (w) w.rotation.x = Math.sin(t * 1.7 + a.phase) * 0.12;
          break;
        }
        case 'gauge': {
          const n = a.o.getObjectByName('needle');
          if (n) n.rotation.z = Math.sin(t * 2.4 + a.phase) * 0.5 + Math.sin(t * 11 + a.phase) * 0.07;
          break;
        }
        case 'cloud':
          a.o.position.x = (((d.x as number) + t * 0.7 + 120) % 240) - 120;
          break;
        case 'bird': {
          const bx = d.x as number;
          const by = d.y as number;
          const bz = d.z as number;
          a.o.position.set(bx + Math.cos(t * 0.35 + a.phase) * 9, by + Math.sin(t * 1.8 + a.phase) * 0.7, bz + Math.sin(t * 0.35 + a.phase) * 9);
          a.o.rotation.y = -(t * 0.35 + a.phase);
          const wing = a.o.getObjectByName('wing');
          if (wing) wing.rotation.z = Math.sin(t * 9 + a.phase) * 0.5;
          break;
        }
        case 'weldBot': {
          d.t = (d.t as number) - dt;
          if ((d.t as number) <= 0) {
            d.on = !(d.on as boolean);
            d.t = d.on ? 0.12 + Math.random() * 0.4 : 0.5 + Math.random() * 1.4;
          }
          if (this.weldLight) this.weldLight.intensity = d.on ? 50 + Math.random() * 70 : 0;
          if (d.on)
            this.particles.emit(
              { x: d.wx as number, y: d.wy as number, z: d.wz as number },
              { count: 5, speed: 3.2, spread: 1.3, up: 0.4, gravity: 16, size: 11, ttl: 0.4, color: [0.75, 0.88, 1.0] },
            );
          const arm = a.o.getObjectByName('arm');
          if (arm) arm.rotation.x = -0.4 + Math.sin(t * 5) * 0.06;
          break;
        }
      }
    }
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
    this.updateAnimated(dt);
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
    this.particles.update(dt, { x: 0, y: 3.6, z: -4, r: 17 });

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
    this.kartGroup.visible = w.player.mode !== 'kart'; // hide chassis in first-person drive

    // installed parts: (re)build a socket's mesh only when it changes
    for (const s of w.vehicle.sockets) {
      if (this.socketState.get(s.id) === s.installed) continue;
      this.socketState.set(s.id, s.installed);
      const grp = this.socketMeshes.get(s.id);
      if (!grp) continue;
      while (grp.children.length) {
        const c = grp.children[0];
        grp.remove(c);
        disposeTree(c);
      }
      if (s.installed) {
        const variant = variantById(s.installed);
        if (variant) {
          grp.add(this.makePart(s.accepts, variant, w.vehicle.bodyColor));
          if (s.accepts === 'body') {
            this.bodyMat = (grp.getObjectByName('shell') as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial;
            this.lastBodyColor = -1; // force a repaint sync
          }
        }
      }
    }
    // repaint the body shell when the color changes
    if (this.bodyMat && this.lastBodyColor !== w.vehicle.bodyColor) {
      this.lastBodyColor = w.vehicle.bodyColor;
      this.bodyMat.color.setHex(w.vehicle.bodyColor);
      const hood = this.socketMeshes.get('body')?.children[0]?.getObjectByName('shell2') as THREE.Mesh | undefined;
      (hood?.material as THREE.MeshStandardMaterial | undefined)?.color.setHex(w.vehicle.bodyColor);
    }

    // held part (carried) + tools
    const carry = w.player.carrying;
    const cv = w.player.carryingVariant;
    const key = carry && cv ? `${carry}|${cv}` : '';
    if (key !== this.heldKey) {
      this.heldKey = key;
      while (this.heldPart.children.length) {
        const c = this.heldPart.children[0];
        this.heldPart.remove(c);
        disposeTree(c);
      }
      if (carry && cv) {
        const variant = variantById(cv);
        if (variant) {
          const m = this.makePart(carry as PartKind, variant, w.vehicle.bodyColor);
          m.scale.setScalar(0.5);
          this.heldPart.add(m);
        }
      }
    }
    this.heldPart.visible = !!key && w.player.mode === 'foot';
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
      } else if (i === w.cpIndex && isDrivable(w.vehicle)) {
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
