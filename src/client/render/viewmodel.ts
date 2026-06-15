import * as THREE from 'three';

// Simple procedural first-person gloved hands. The view parents these (and the
// held tool) under a pivot that bobs/sways with movement.
export function buildHands(): THREE.Group {
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0xe8a23c, roughness: 0.6, metalness: 0.05 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.7 });

  const hand = (sx: number): THREE.Group => {
    const h = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.2), glove);
    const knuck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.08), glove);
    knuck.position.set(0, 0.06, -0.1);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), cuff);
    wrist.position.set(0, -0.02, 0.16);
    h.add(fist, knuck, wrist);
    h.position.set(sx * 0.26, -0.3, -0.5);
    h.rotation.set(0.2, sx * -0.15, sx * 0.1);
    return h;
  };

  g.add(hand(-1), hand(1));
  return g;
}
