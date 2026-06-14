import * as THREE from 'three';

function makeCanvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

/** Concrete-ish floor with a grid, tiled. */
export function floorTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#2f3543';
  ctx.fillRect(0, 0, 256, 256);
  // speckle
  for (let i = 0; i < 1600; i++) {
    const v = 30 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${v},${v + 6},${v + 14})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(120,140,170,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Diagonal hazard stripes for the speed gate. */
export function stripeTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(128);
  ctx.fillStyle = '#1a1205';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ffcf3f';
  ctx.lineWidth = 18;
  for (let i = -128; i < 256; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A forward chevron used to mark the bunny-hop runway. */
export function chevronTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(56,224,200,0.85)';
  ctx.beginPath();
  ctx.moveTo(64, 18);
  ctx.lineTo(112, 78);
  ctx.lineTo(92, 78);
  ctx.lineTo(64, 46);
  ctx.lineTo(36, 78);
  ctx.lineTo(16, 78);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
