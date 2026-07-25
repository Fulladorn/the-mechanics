import * as THREE from 'three';
import { lerp, lerpAngle, type Vec3 } from '../../shared/math';
import { CHECKPOINT_RADIUS } from '../../shared/constants';
import type { World } from '../../sim/world';
import { type ItemKind } from '../../shared/types';
import { chevronTexture, stripeTexture } from './textures';
import type { Settings } from '../settings';
import { isDrivable, variantById, defaultVariant, type PartKind } from '../../sim/vehicle';
import { Post } from './post';
import { Particles } from './particles';
import { Viewmodel } from './viewmodel';
import { M, chrome, glass, paint } from './materials';
import { box, circle, cyl, plane, roundedBox, torus } from './geo';
import { ANIMATED_KINDS, INSTANCED_KINDS, makeProp } from './props';
import { SKY_PRESETS, SkyRig, lightShaft } from './env';
import { makeChassis, makePart } from './vehicleMesh';

const disposeTree = (o: THREE.Object3D): void => {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      // Geometry and materials are shared out of the caches — disposing them
      // here would rip them out from under every other prop using them.
      c.geometry.userData.shared ||= false;
    }
  });
};

interface Animated {
  o: THREE.Object3D;
  kind: string;
  phase: number;
  data: Record<string, number | boolean>;
}

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private world: World;

  private sky!: SkyRig;
  private gateMesh!: THREE.Mesh;
  private gateAnim = 0;
  private itemMeshes = new Map<number, THREE.Object3D>();
  private kartGroup!: THREE.Group;
  private socketMeshes = new Map<string, THREE.Group>();
  private socketState = new Map<string, string | null>();
  private bodyMats: THREE.MeshPhysicalMaterial[] = [];
  private lastBodyColor = -1;
  private checkpointMeshes: THREE.Mesh[] = [];
  private clockScreen!: THREE.Mesh;
  private settings: Settings;
  private post!: Post;
  private particles!: Particles;
  private vm!: Viewmodel;
  private baseFov: number;
  private fovPulse = 0;
  private shake = 0;
  private clock = 0;
  private animated: Animated[] = [];
  private weldLight?: THREE.PointLight;
  private wheelSpin = 0;
  private headlampsOn = false;

  // interpolation state
  private prevEye: Vec3;
  private curEye: Vec3;
  private prevKart: { pos: Vec3; heading: number };
  private curKart: { pos: Vec3; heading: number };

  constructor(world: World, container: HTMLElement, settings: Settings) {
    this.world = world;
    this.settings = settings;
    this.baseFov = settings.video.fov;

    const q = settings.video.quality;
    const hi = q === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: q === 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : q === 'med' ? 1.5 : 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = settings.video.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.video.brightness;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.video.fov, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sky = new SkyRig(this.scene, this.renderer, SKY_PRESETS[world.level.skyPreset ?? 'summerDay'], {
      shadowMapSize: hi ? 2048 : q === 'med' ? 1536 : 1024,
      // Wide enough that the roof shadows the whole visible bay — a tighter
      // frustum let unshadowed sun blow out the far end of the floor.
      shadowSpan: 34,
    });

    this.buildGround();
    this.buildStatics();
    this.buildShell();
    this.buildInteriorLights();
    this.buildProps();
    this.buildGate();
    this.buildLaneDeco();
    this.buildItems();
    this.buildVehicle();
    this.buildCheckpoints();
    this.buildClockIn();

    this.particles = new Particles(this.scene, q);
    this.vm = new Viewmodel(this.camera);
    this.post = new Post(this.renderer, this.scene, this.camera, q, settings.video.postfx, this.sky.sun);

    const eye = world.eyePos();
    this.prevEye = { ...eye };
    this.curEye = { ...eye };
    this.prevKart = { pos: { ...world.kart.pos }, heading: world.kart.heading };
    this.curKart = { pos: { ...world.kart.pos }, heading: world.kart.heading };

    addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight);
  };

  private add(o: THREE.Object3D): THREE.Object3D {
    this.scene.add(o);
    return o;
  }

  private addBox(b: { center: Vec3; half: Vec3 }, mat: THREE.Material, bevel = 0.02): THREE.Mesh {
    const m = new THREE.Mesh(roundedBox(b.half.x * 2, b.half.y * 2, b.half.z * 2, bevel), mat);
    m.position.set(b.center.x, b.center.y, b.center.z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  // --- world shell ----------------------------------------------------------

  private buildGround(): void {
    const ext = this.world.level.exterior;
    // Grass/dirt, not the shop's concrete — reusing the concrete set out here
    // made the whole yard read as wet asphalt. Big enough that its edge always
    // sits beyond the fog, so the horizon never shows a seam.
    const geo = plane(1600, 1600, 1, 1).clone();
    // aoMap samples uv1, which PlaneGeometry doesn't provide.
    geo.setAttribute('uv1', geo.getAttribute('uv'));
    const ground = new THREE.Mesh(
      geo,
      paint({ color: ext.ground, roughness: 1, metalness: 0, surface: 'ground', repeat: [220, 220] }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.03, 130);
    ground.receiveShadow = true;
    this.add(ground);
  }

  private buildStatics(): void {
    for (const s of this.world.level.solids) {
      if (s.hidden) continue;
      const { half } = s.box;
      let mat: THREE.Material;
      let bevel = 0.02;
      switch (s.tag) {
        case 'floor':
          mat = M.concrete([half.x / 1.6, half.z / 1.6]);
          bevel = 0;
          break;
        case 'wall':
        case 'divider':
          mat = M.panel(s.color, [Math.max(half.x, half.z) / 2.2, Math.max(half.y, 1) / 1.6]);
          break;
        case 'door':
          mat = M.darkSteel(0x262b34);
          break;
        case 'crate':
          mat = M.cardboard(s.color);
          bevel = 0.05;
          break;
        case 'cabinet':
          mat = M.painted(s.color, 0.5);
          bevel = 0.04;
          break;
        case 'pallet':
          mat = M.wood(0xb08858);
          break;
        case 'terminal':
          mat = M.painted(s.color, 0.45);
          bevel = 0.05;
          break;
        default:
          mat = M.painted(s.color);
      }
      const m = this.addBox(s.box, mat, bevel);
      if (s.tag === 'crate') this.dressCrate(m, s.box);
      if (s.tag === 'terminal') this.dressTerminal(m);
    }
  }

  /** Slats + a stencil so supply crates aren't plain boxes. */
  private dressCrate(m: THREE.Mesh, b: { half: Vec3 }): void {
    const slat = M.wood(0x8a5f30);
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(box(b.half.x * 1.9, 0.06, 0.03), slat);
        s.position.set(0, -b.half.y * 0.55 + i * b.half.y * 0.55, sz * (b.half.z + 0.015));
        m.add(s);
      }
    }
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(box(0.03, b.half.y * 1.9, b.half.z * 1.9), slat);
      s.position.set(sx * (b.half.x + 0.015), 0, 0);
      m.add(s);
    }
  }

  private dressTerminal(m: THREE.Mesh): void {
    const bezel = new THREE.Mesh(roundedBox(1.6, 1.15, 0.08, 0.03), M.darkSteel(0x191d24));
    bezel.position.set(0, 0.5, 0.4);
    m.add(bezel);
    const keys = new THREE.Mesh(roundedBox(1.2, 0.35, 0.2, 0.03), M.darkSteel(0x232933));
    keys.position.set(0, -0.55, 0.42);
    keys.rotation.x = -0.3;
    m.add(keys);
  }

  /**
   * Roof, trusses and clerestory. Without this the walls simply stop at 6 m and
   * you see sky (and floating pipes) from inside the workshop.
   */
  private buildShell(): void {
    const lvl = this.world.level;
    const b = lvl.bounds;
    const wallTop = 6;
    const eaves = 6.45;
    const ridge = 8.1;
    const halfW = (b.maxX - b.minX) / 2 + 0.5;
    const cx = (b.minX + b.maxX) / 2;
    const zLen = b.maxZ - b.minZ + 1;
    const cz = (b.minZ + b.maxZ) / 2;
    const slope = Math.hypot(halfW, ridge - eaves);
    const pitch = Math.atan2(ridge - eaves, halfW);

    // clerestory band: daylight enters here, which is what the shafts key off
    for (const sx of [-1, 1]) {
      const bandGeo = plane(zLen, eaves - wallTop);
      const band = new THREE.Mesh(bandGeo, glass(0xcfe4fb, 0.5));
      band.rotation.y = sx * (Math.PI / 2);
      band.position.set(cx + sx * halfW, (wallTop + eaves) / 2, cz);
      this.add(band);
      const sill = new THREE.Mesh(box(0.32, 0.14, zLen), M.painted(0x39414f, 0.6));
      sill.position.set(cx + sx * halfW, wallTop, cz);
      sill.castShadow = true;
      this.add(sill);
    }
    for (const sz of [-1, 1]) {
      const gable = new THREE.Shape();
      gable.moveTo(-halfW, wallTop);
      gable.lineTo(halfW, wallTop);
      gable.lineTo(halfW, eaves);
      gable.lineTo(0, ridge);
      gable.lineTo(-halfW, eaves);
      gable.closePath();
      const g = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.4, bevelEnabled: false }), M.panel(0x59657d, [6, 2]));
      g.position.set(cx, 0, cz + sz * (zLen / 2));
      g.castShadow = true;
      g.receiveShadow = true;
      this.add(g);
    }

    // roof decks
    const deckMat = paint({ color: 0x3f4756, metalness: 0.35, roughness: 0.62, surface: 'panel', repeat: [zLen / 3, 5] });
    for (const sx of [-1, 1]) {
      const deck = new THREE.Mesh(box(zLen + 1.2, 0.16, slope * 2), deckMat);
      deck.rotation.set(0, Math.PI / 2, sx * pitch);
      deck.position.set(cx + sx * halfW * 0.5, (eaves + ridge) / 2, cz);
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.add(deck);
    }
    const ridgeCap = new THREE.Mesh(roundedBox(0.6, 0.3, zLen + 1.2, 0.08), M.steel(0x8d95a3, 0.5));
    ridgeCap.position.set(cx, ridge + 0.1, cz);
    this.add(ridgeCap);

    // skylights: bright panels punched into the deck, each with a light shaft
    const skyMat = M.glow(0xf4faff, 1.1);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = b.minZ + 4 + i * ((zLen - 8) / 3);
        const px = cx + sx * halfW * 0.5;
        const py = (eaves + ridge) / 2 + 0.1;
        const panel = new THREE.Mesh(plane(3.4, 2.6), skyMat);
        panel.rotation.set(-Math.PI / 2, 0, 0);
        panel.rotation.z = Math.PI / 2;
        // lie the panel in the roof plane
        panel.rotation.set(0, Math.PI / 2, sx * pitch - Math.PI / 2);
        panel.position.set(px, py, z);
        this.add(panel);

        const shaft = lightShaft(1.9, 3.4, py, 0xfff0d2, 0.05);
        shaft.position.set(px * 0.92, py / 2, z);
        this.add(shaft);
      }
    }

    // trusses every ~6 m
    const trussMat = M.steel(0x767e8c, 0.5);
    for (let z = b.minZ + 2; z <= b.maxZ - 1; z += 6) {
      const t = new THREE.Group();
      const chord = new THREE.Mesh(box(halfW * 2, 0.14, 0.14), trussMat);
      chord.position.set(cx, eaves - 0.25, z);
      t.add(chord);
      for (const sx of [-1, 1]) {
        const raf = new THREE.Mesh(box(slope, 0.12, 0.12), trussMat);
        raf.rotation.z = sx * pitch;
        raf.position.set(cx + sx * halfW * 0.5, (eaves + ridge) / 2 - 0.2, z);
        t.add(raf);
      }
      for (let i = -4; i <= 4; i++) {
        const x = cx + (i / 5) * halfW;
        const top = eaves - 0.2 + (1 - Math.abs(i) / 5) * (ridge - eaves);
        const web = new THREE.Mesh(box(0.08, top - (eaves - 0.25), 0.08), trussMat);
        web.position.set(x, (top + eaves - 0.25) / 2, z);
        t.add(web);
      }
      t.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.add(t);
    }

    // rolled-up door bundle under the lintel
    const door = new THREE.Mesh(roundedBox(10, 0.8, 0.6, 0.12), paint({ color: 0xb8453c, metalness: 0.4, roughness: 0.5, surface: 'panel', repeat: [8, 1] }));
    door.position.set(lvl.garageDoor.center.x, 4.35, lvl.garageDoor.center.z - 0.15);
    door.castShadow = true;
    this.add(door);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(box(0.14, 4.6, 0.14), M.darkSteel());
      rail.position.set(lvl.garageDoor.center.x + sx * 5.1, 2.3, lvl.garageDoor.center.z - 0.15);
      this.add(rail);
    }
  }

  /** Practical lights + the beams that make the volume feel lit. */
  private buildInteriorLights(): void {
    const q = this.settings.video.quality;
    // Broad warm fill through the bay. Point lights are cheap without shadows.
    for (const [x, z, i] of [
      [0, -18, 20],
      [-14, -8, 15],
      [14, -8, 15],
      [0, 8, 18],
    ] as [number, number, number][]) {
      const l = new THREE.PointLight(0xffe6c4, i, 32, 2);
      l.position.set(x, 5.2, z);
      this.add(l);
    }

    // Key light over the build lift: the one shadow-casting practical indoors.
    const liftSpot = new THREE.SpotLight(0xfff3da, 110, 20, Math.PI / 4.6, 0.55, 1.6);
    liftSpot.position.set(0, 6.0, -6);
    liftSpot.target.position.set(0, 0, -6);
    liftSpot.castShadow = q !== 'low';
    liftSpot.shadow.mapSize.set(1024, 1024);
    liftSpot.shadow.bias = -0.0008;
    this.add(liftSpot);
    this.add(liftSpot.target);
    if (q !== 'low') this.add(lightShaft(0.9, 4.2, 6.0, 0xfff0d2, 0.055)).position.set(0, 3.0, -6);

    // Daylight spilling in through the open roll-up door.
    const doorZ = this.world.level.garageDoor.center.z;
    const doorLight = new THREE.SpotLight(0xdcecff, 48, 30, Math.PI / 3.4, 0.7, 1.3);
    doorLight.position.set(0, 4.0, doorZ + 3);
    doorLight.target.position.set(0, 0, doorZ - 12);
    this.add(doorLight);
    this.add(doorLight.target);
  }

  private buildGate(): void {
    const g = this.world.level.gate;
    const tex = stripeTexture();
    tex.repeat.set(3, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.45,
      roughness: 0.42,
      emissive: 0x3a2600,
      emissiveIntensity: 0.5,
    });
    this.gateMesh = this.addBox(g, mat, 0.05);
    const postMat = M.darkSteel(0x20242e);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(roundedBox(0.42, 6, 0.62, 0.05), postMat);
      post.position.set(g.center.x + sx * (g.half.x + 0.22), 3, g.center.z);
      post.castShadow = true;
      this.add(post);
      // warning beacon on each post
      const beacon = new THREE.Mesh(cyl(0.11, 0.13, 0.18, 10), M.glow(0xffb020, 2.2));
      beacon.position.set(g.center.x + sx * (g.half.x + 0.22), 5.4, g.center.z);
      this.add(beacon);
    }
    const header = new THREE.Mesh(roundedBox(g.half.x * 2 + 1.1, 0.36, 0.5, 0.06), M.darkSteel());
    header.position.set(g.center.x, 5.0, g.center.z);
    this.add(header);
  }

  private buildLaneDeco(): void {
    const tex = chevronTexture();
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false });
      const m = new THREE.Mesh(plane(2, 2), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.02, 11 - i * 2.4);
      this.add(m);
    }
  }

  // --- items ----------------------------------------------------------------

  private makeItemMesh(kind: ItemKind, variantId?: string): THREE.Object3D {
    if (kind === 'wrench') {
      const g = new THREE.Group();
      const steel = chrome(0xc8d0dc);
      g.add(new THREE.Mesh(roundedBox(0.075, 0.46, 0.05, 0.02), steel));
      const head = new THREE.Mesh(roundedBox(0.2, 0.15, 0.055, 0.025), steel);
      head.position.y = 0.27;
      const jaw = new THREE.Mesh(box(0.075, 0.09, 0.07), steel);
      jaw.position.set(0.055, 0.33, 0);
      const tail = new THREE.Mesh(roundedBox(0.15, 0.12, 0.05, 0.02), steel);
      tail.position.y = -0.26;
      tail.rotation.z = 0.5;
      const grip = new THREE.Mesh(roundedBox(0.08, 0.2, 0.055, 0.025), M.rubber(0xd14b3a));
      g.add(head, jaw, tail, grip);
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    if (kind === 'flashlight') {
      const g = new THREE.Group();
      const body = M.painted(0xffcf3f, 0.42);
      g.add(new THREE.Mesh(cyl(0.06, 0.068, 0.3, 14), body));
      const head = new THREE.Mesh(cyl(0.1, 0.07, 0.11, 14), M.darkSteel());
      head.position.y = 0.19;
      const lens = new THREE.Mesh(circle(0.088, 14), M.glow(0xfff1c0, 2.2));
      lens.rotation.x = -Math.PI / 2;
      lens.position.y = 0.246;
      const knurl = new THREE.Mesh(cyl(0.062, 0.062, 0.07, 14), M.rubber(0x2a2f38));
      knurl.position.y = -0.05;
      g.add(head, lens, knurl);
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    // A part on the floor should look like the part it is, not a generic box.
    const variant = (variantId ? variantById(variantId) : undefined) ?? defaultVariant(kind as PartKind);
    const g = new THREE.Group();
    const part = makePart(kind as PartKind, variant, this.world.vehicle.bodyColor);
    // Headlight beams belong to the car, not to a pickup lying on the floor.
    part.traverse((o) => {
      if (o instanceof THREE.SpotLight) o.intensity = 0;
    });
    if (kind === 'wheel') part.rotation.z = Math.PI / 2; // lie flat
    if (kind === 'body') part.scale.setScalar(0.55);
    g.add(part);
    return g;
  }

  private buildItems(): void {
    for (const it of this.world.items) {
      const m = this.makeItemMesh(it.kind, it.variantId);
      m.position.set(it.pos.x, it.pos.y, it.pos.z);
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.add(m);
      this.itemMeshes.set(it.id, m);
    }
  }

  // --- vehicle --------------------------------------------------------------

  private buildVehicle(): void {
    const g = makeChassis();
    for (const s of this.world.vehicle.sockets) {
      const sg = new THREE.Group();
      sg.position.set(s.anchor.x, s.anchor.y, s.anchor.z);
      sg.name = 'socket:' + s.id;
      g.add(sg);
      this.socketMeshes.set(s.id, sg);
      this.socketState.set(s.id, null);
    }
    this.add(g);
    this.kartGroup = g;
  }

  private buildCheckpoints(): void {
    for (const cp of this.world.level.checkpoints) {
      const ring = new THREE.Mesh(
        torus(CHECKPOINT_RADIUS * 0.7, 0.16, 10, 30),
        new THREE.MeshStandardMaterial({ color: 0x38e0c8, emissive: 0x0f4b44, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.4 }),
      );
      ring.position.set(cp.x, 1.7, cp.z);
      this.add(ring);
      this.checkpointMeshes.push(ring);
      // ground marker so it reads even when the ring is edge-on
      const disc = new THREE.Mesh(
        circle(CHECKPOINT_RADIUS * 0.8, 28),
        paint({ color: 0x38e0c8, emissive: 0x0a3530, emissiveIntensity: 0.5, transparent: true, opacity: 0.18 }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cp.x, 0.03, cp.z);
      this.add(disc);
    }
  }

  private buildClockIn(): void {
    const p = this.world.level.clockInPos;
    this.clockScreen = new THREE.Mesh(
      plane(1.35, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x0a141f, emissive: 0x113322, emissiveIntensity: 0.5, roughness: 0.3 }),
    );
    this.clockScreen.position.set(p.x, 1.5, p.z + 0.44);
    this.add(this.clockScreen);
  }

  // --- props ----------------------------------------------------------------

  private buildProps(): void {
    const props = this.world.level.props;

    this.instanceProps(
      props.filter((p) => p.kind === 'window'),
      plane(2.6, 1.7),
      M.glow(0xbcd8f0, 0.9),
      0,
    );
    const grassGeo = cyl(0.0, 0.14, 0.5, 4).clone();
    grassGeo.translate(0, 0.25, 0);
    this.instanceProps(
      props.filter((p) => p.kind === 'grass'),
      grassGeo,
      paint({ color: 0x4f7a3a, roughness: 0.98, flatShading: true }),
      0,
    );

    for (const p of props) {
      if (INSTANCED_KINDS.has(p.kind)) continue;
      const o = makeProp(p);
      if (!o) continue;
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.rot) o.rotation.y = p.rot;
      if (p.scale && p.scale !== 1) o.scale.setScalar(p.scale);
      o.traverse((c) => {
        if (c instanceof THREE.Mesh && c.castShadow === undefined) c.castShadow = true;
      });
      this.add(o);

      if (p.kind === 'weldBot') {
        const w = { x: p.pos.x, y: 0.95, z: p.pos.z + 1.3 };
        this.weldLight = new THREE.PointLight(0x9fd0ff, 0, 11, 2);
        this.weldLight.position.set(w.x, w.y, w.z);
        this.add(this.weldLight);
        this.animated.push({ o, kind: 'weldBot', phase: 0, data: { wx: w.x, wy: w.y, wz: w.z, t: 0, on: false } });
      } else if (p.kind === 'ceilingLight' && this.settings.video.quality !== 'low') {
        // a soft pool of light under every third fixture keeps the cost sane
        if (Math.abs(p.pos.x) > 10 || Math.abs(p.pos.z % 18) < 1) {
          const l = new THREE.PointLight(0xfff2dc, 8, 13, 2);
          l.position.set(p.pos.x, p.pos.y - 0.4, p.pos.z);
          this.add(l);
        }
      } else if (ANIMATED_KINDS.has(p.kind)) {
        this.animated.push({
          o,
          kind: p.kind,
          phase: Math.random() * Math.PI * 2,
          data: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        });
      }
    }
  }

  private instanceProps(list: { pos: Vec3; rot?: number; scale?: number }[], geo: THREE.BufferGeometry, material: THREE.Material, yOff: number): void {
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
    im.castShadow = true;
    im.receiveShadow = true;
    this.add(im);
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
          a.o.position.y = (d.y as number) + Math.sin(t * 1.4 + a.phase) * 0.045;
          a.o.rotation.z = Math.sin(t * 1.1 + a.phase) * 0.045;
          break;
        case 'banner': {
          const w = a.o.getObjectByName('wave');
          if (w) {
            w.children.forEach((seg, i) => {
              seg.position.z = Math.sin(t * 2.2 + i * 0.7 + a.phase) * 0.09;
              seg.rotation.y = Math.cos(t * 2.2 + i * 0.7 + a.phase) * 0.16;
            });
          }
          break;
        }
        case 'gauge': {
          const n = a.o.getObjectByName('needle');
          if (n) n.rotation.z = Math.sin(t * 2.4 + a.phase) * 0.5 + Math.sin(t * 11 + a.phase) * 0.07;
          break;
        }
        case 'cloud':
          a.o.position.x = (((d.x as number) + t * 0.7 + 160) % 320) - 160;
          break;
        case 'bird': {
          const bx = d.x as number;
          const by = d.y as number;
          const bz = d.z as number;
          a.o.position.set(
            bx + Math.cos(t * 0.35 + a.phase) * 9,
            by + Math.sin(t * 1.8 + a.phase) * 0.7,
            bz + Math.sin(t * 0.35 + a.phase) * 9,
          );
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
          if (this.weldLight) this.weldLight.intensity = d.on ? 60 + Math.random() * 90 : 0;
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

  // --- frame ----------------------------------------------------------------

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

    const driving = w.player.mode === 'kart';
    const speed = driving ? Math.abs(w.kart.speed) : Math.hypot(w.player.vel.x, w.player.vel.z);

    // speed-driven FOV kick + transient pulses (juice)
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

    this.sky.follow(this.camera.position);
    this.vm.update(dt, w, speed, yaw, this.settings);

    // kart exhaust + ambient dust
    if (driving && Math.abs(w.kart.speed) > 1.5) {
      const h = w.kart.heading;
      this.particles.exhaust({ x: w.kart.pos.x + Math.sin(h) * 1.4, y: 0.45, z: w.kart.pos.z + Math.cos(h) * 1.4 });
    }
    this.particles.update(dt, { x: 0, y: 3.4, z: -4, r: 18 });

    // gate slides up as it opens
    const target = w.gateOpen ? 1 : 0;
    this.gateAnim += (target - this.gateAnim) * Math.min(1, 0.08);
    this.gateMesh.position.y = w.level.gate.center.y + this.gateAnim * 4.2;

    // items: hide when picked, idle bob so they read as pickups
    for (const it of w.items) {
      const m = this.itemMeshes.get(it.id);
      if (!m) continue;
      m.visible = !it.picked;
      if (!it.picked) {
        m.position.set(it.pos.x, it.pos.y + Math.sin(this.clock * 1.6 + it.id) * 0.03, it.pos.z);
        m.rotation.y += dt * 0.55;
      }
    }

    this.syncVehicle(alpha, dt, driving, speed);
    this.syncStateFx();
    this.post.positionSun(this.camera, this.sky.sunDir);
    this.post.setSpeedFx(driving ? speed / 22 : speed / 26);
    this.post.render(dt, this.scene, this.camera);
  }

  private syncVehicle(alpha: number, dt: number, driving: boolean, speed: number): void {
    const w = this.world;
    const kpos = {
      x: lerp(this.prevKart.pos.x, this.curKart.pos.x, alpha),
      z: lerp(this.prevKart.pos.z, this.curKart.pos.z, alpha),
    };
    this.kartGroup.position.set(kpos.x, 0, kpos.z);
    this.kartGroup.rotation.y = lerpAngle(this.prevKart.heading, this.curKart.heading, alpha);
    this.kartGroup.visible = !driving; // hide the chassis in first-person drive

    // (re)build a socket's mesh only when what's installed changes
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
          grp.add(makePart(s.accepts, variant, w.vehicle.bodyColor));
          if (s.accepts === 'body') {
            this.bodyMats = [];
            grp.traverse((o) => {
              if (o instanceof THREE.Mesh && o.name === 'shell') {
                const m = o.material as THREE.MeshPhysicalMaterial;
                if (!this.bodyMats.includes(m)) this.bodyMats.push(m);
              }
            });
            this.lastBodyColor = -1;
          }
          if (s.accepts === 'headlights') this.headlampsOn = true;
        }
      } else if (s.accepts === 'headlights') {
        this.headlampsOn = false;
      }
    }

    if (this.bodyMats.length && this.lastBodyColor !== w.vehicle.bodyColor) {
      this.lastBodyColor = w.vehicle.bodyColor;
      for (const m of this.bodyMats) m.color.setHex(w.vehicle.bodyColor);
    }

    // rolling + steering wheels
    this.wheelSpin += (w.kart.speed / 0.41) * dt;
    const steer = driving ? lerpAngle(0, 0, 0) : 0;
    for (const id of ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']) {
      const grp = this.socketMeshes.get(id);
      const part = grp?.children[0];
      if (!part) continue;
      part.rotation.x = this.wheelSpin;
      if (id.startsWith('wheelF')) part.rotation.y = steer;
    }

    // headlamps only burn while you're driving
    const beams: THREE.SpotLight[] = [];
    this.socketMeshes.get('headlights')?.traverse((o) => {
      if (o instanceof THREE.SpotLight) beams.push(o);
    });
    for (const b of beams) b.intensity = this.headlampsOn && driving ? 26 : 0;
    void speed;
  }

  private syncStateFx(): void {
    const w = this.world;
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
        mat.emissive.setHex(0x0f4b44);
        ring.visible = w.player.mode === 'kart';
      }
    });

    const screenMat = this.clockScreen.material as THREE.MeshStandardMaterial;
    if (w.objectives.readyToClockOut()) {
      screenMat.emissive.setHex(0x1f9d57);
      screenMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(t);
    } else {
      screenMat.emissive.setHex(0x113322);
      screenMat.emissiveIntensity = 0.3;
    }
  }

  applySettings(s: Settings): void {
    const rebuild = s.video.postfx !== this.settings.video.postfx || s.video.quality !== this.settings.video.quality;
    this.settings = s;
    this.baseFov = s.video.fov;
    this.renderer.toneMappingExposure = s.video.brightness;
    this.renderer.shadowMap.enabled = s.video.shadows;
    if (rebuild) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.post = new Post(this.renderer, this.scene, this.camera, s.video.quality, s.video.postfx, this.sky.sun);
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
  /** Dust puff at the player's feet (footsteps, landings). */
  footFx(strength = 1): void {
    const p = this.world.player.pos;
    this.particles.dust({ x: p.x, y: 0.06, z: p.z }, strength);
  }
}
