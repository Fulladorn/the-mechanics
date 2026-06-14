import * as THREE from 'three';
import { lerp, lerpAngle, type Vec3 } from '../../shared/math';
import { CHECKPOINT_RADIUS } from '../../shared/constants';
import type { World } from '../../sim/world';
import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import { floorTexture, stripeTexture, chevronTexture } from './textures';

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

  // interpolation state
  private prevEye: Vec3;
  private curEye: Vec3;
  private prevKart: { pos: Vec3; heading: number };
  private curKart: { pos: Vec3; heading: number };

  constructor(world: World, container: HTMLElement) {
    this.world = world;
    const lvl = world.level;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2740);
    this.scene.fog = new THREE.Fog(0x1b2740, 45, 100);

    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x53483a, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
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

    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.buildStatics();
    this.buildGate();
    this.buildLaneDeco();
    this.buildItems();
    this.buildKart();
    this.buildCheckpoints();
    this.buildClockIn();
    this.buildHeld();

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
    for (const s of this.world.level.solids) {
      let mat: THREE.Material;
      if (s.tag === 'floor') {
        floorTex.repeat.set(s.box.half.x, s.box.half.z);
        mat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, roughness: 0.96 });
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: s.color,
          roughness: s.tag === 'wall' || s.tag === 'divider' ? 0.9 : 0.6,
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
    this.heldEngine = this.makeEngineMesh();
    this.heldEngine.scale.setScalar(0.55);
    this.heldEngine.position.set(0, -0.45, -1.0);
    this.heldEngine.visible = false;
    this.camera.add(this.heldEngine);

    for (const kind of ['wrench', 'flashlight'] as ItemKind[]) {
      const tool = this.makeItemMesh(kind);
      tool.scale.setScalar(0.8);
      tool.position.set(0.32, -0.32, -0.6);
      tool.rotation.set(0.3, -0.3, 0.2);
      tool.visible = false;
      this.camera.add(tool);
      this.heldTools.set(kind, tool);
    }
  }

  /** Snapshot the latest sim transforms (call right after each world.step). */
  capture(): void {
    this.prevEye = this.curEye;
    this.curEye = { ...this.world.eyePos() };
    this.prevKart = this.curKart;
    this.curKart = { pos: { ...this.world.kart.pos }, heading: this.world.kart.heading };
  }

  frame(alpha: number, yaw: number, pitch: number): void {
    const w = this.world;
    const eye = {
      x: lerp(this.prevEye.x, this.curEye.x, alpha),
      y: lerp(this.prevEye.y, this.curEye.y, alpha),
      z: lerp(this.prevEye.z, this.curEye.z, alpha),
    };
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;

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

    this.renderer.render(this.scene, this.camera);
  }
}
