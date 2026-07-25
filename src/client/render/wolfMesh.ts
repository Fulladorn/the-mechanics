import * as THREE from 'three';
import { M, paint } from './materials';
import { capsule, cone, roundedBox, sphere } from './geo';

// The mountain wolf. Chunky and readable at distance (GDD art direction), with
// named parts so view.ts can animate the gait, the head and the telegraph
// crouch without any skeletal rig.

const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
};

export function makeWolfMesh(): THREE.Group {
  const g = new THREE.Group();
  const fur = paint({ color: 0x5b5f68, roughness: 0.95, flatShading: true });
  const furDark = paint({ color: 0x41454d, roughness: 0.95, flatShading: true });
  const pale = paint({ color: 0x8c8f97, roughness: 0.95, flatShading: true });

  const body = new THREE.Group();
  body.name = 'body';

  const torso = mesh(capsule(0.34, 0.72, 4, 8), fur);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.72, 0);
  body.add(torso);

  // haunches give the silhouette its wolf shape
  const rump = mesh(sphere(0.34, 7, 5), fur);
  rump.scale.set(1, 0.95, 1.1);
  rump.position.set(0, 0.76, 0.5);
  body.add(rump);
  const chest = mesh(sphere(0.3, 7, 5), pale);
  chest.scale.set(1, 0.9, 1.05);
  chest.position.set(0, 0.68, -0.44);
  body.add(chest);

  // neck + head
  const head = new THREE.Group();
  head.name = 'head';
  const skull = mesh(roundedBox(0.3, 0.28, 0.36, 0.09), fur);
  head.add(skull);
  const muzzle = mesh(roundedBox(0.17, 0.14, 0.28, 0.06), furDark);
  muzzle.position.set(0, -0.05, -0.28);
  head.add(muzzle);
  const nose = mesh(sphere(0.045, 6, 5), paint({ color: 0x14161a, roughness: 0.6 }));
  nose.position.set(0, -0.02, -0.42);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = mesh(cone(0.09, 0.2, 4), furDark);
    ear.position.set(sx * 0.11, 0.2, 0.04);
    ear.rotation.z = sx * 0.2;
    head.add(ear);
    const eye = mesh(sphere(0.032, 6, 5), M.glow(0xffc247, 1.6));
    eye.position.set(sx * 0.1, 0.05, -0.15);
    head.add(eye);
  }
  head.position.set(0, 0.92, -0.62);
  body.add(head);

  // legs, named so the gait can swing them
  const legs = new THREE.Group();
  legs.name = 'legs';
  let n = 0;
  for (const sz of [-0.36, 0.42]) {
    for (const sx of [-0.22, 0.22]) {
      const leg = new THREE.Group();
      leg.name = 'leg' + n++;
      const upper = mesh(capsule(0.075, 0.24, 3, 6), fur);
      upper.position.y = -0.14;
      const paw = mesh(roundedBox(0.15, 0.1, 0.2, 0.04), furDark);
      paw.position.y = -0.33;
      leg.add(upper, paw);
      leg.position.set(sx, 0.62, sz);
      legs.add(leg);
    }
  }
  body.add(legs);

  const tail = new THREE.Group();
  tail.name = 'tail';
  const t1 = mesh(capsule(0.07, 0.24, 3, 6), fur);
  t1.rotation.x = 1.1;
  t1.position.set(0, 0.06, 0.16);
  const t2 = mesh(capsule(0.05, 0.18, 3, 6), pale);
  t2.rotation.x = 1.5;
  t2.position.set(0, 0.0, 0.36);
  tail.add(t1, t2);
  tail.position.set(0, 0.82, 0.72);
  body.add(tail);

  g.add(body);
  return g;
}
