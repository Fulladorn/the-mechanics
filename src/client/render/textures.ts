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

const srgb = (c: HTMLCanvasElement, repeat = true): THREE.Texture => {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Corrugated/painted industrial wall panelling with vertical ribs + grime. */
export function wallPanelTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#5a6680';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, 0, 4, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 28, 0, 4, 256);
  }
  // bolt rows + grime
  for (let y = 16; y < 256; y += 64) {
    for (let x = 16; x < 256; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(20,24,32,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 6, 2);
  }
  return srgb(c);
}

/** Horizontal-panelled roll-up garage door. */
export function doorTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#c44a3f';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 40) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y, 256, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, y + 6, 256, 6);
  }
  return srgb(c);
}

/** Generic brushed/painted metal, tinted to `base` (hex like '#8a8f99'). */
export function metalTexture(base = '#8a8f99'): THREE.Texture {
  const { c, ctx } = makeCanvas(128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random() * 0.12;
    ctx.fillStyle = `rgba(255,255,255,${v})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 8, 1);
    ctx.fillStyle = `rgba(0,0,0,${v})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 6, 1);
  }
  return srgb(c);
}

/** Rubber tire with tread blocks on the sidewall band. */
export function tireTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(128);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#26282f';
  for (let x = 0; x < 128; x += 12) ctx.fillRect(x, 0, 7, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 54, 128, 20);
  return srgb(c);
}

/** A wall poster. When `symbol`, it carries the recurring mystery glyph. */
export function posterTexture(symbol = false): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = symbol ? '#0e1320' : '#f3ead2';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = symbol ? '#37506b' : '#b23b2e';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 236);
  if (symbol) {
    // a stylized rune: ringed triangle with a dot — the "Entity" mark
    ctx.strokeStyle = '#5fd9c8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 132, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 70);
    ctx.lineTo(190, 178);
    ctx.lineTo(66, 178);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#5fd9c8';
    ctx.beginPath();
    ctx.arc(128, 142, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#b23b2e';
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SAFETY', 128, 96);
    ctx.fillText('FIRST', 128, 140);
    ctx.fillStyle = '#3a3a3a';
    ctx.font = '18px sans-serif';
    ctx.fillText('THE COMPANY', 128, 200);
  }
  return srgb(c, false);
}

/** Vertical sky gradient for the exterior dome (maps by elevation on a sphere). */
export function skyTexture(top = '#2a4a86', horizon = '#cfa86b'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, '#3f4a63');
  g.addColorStop(0.84, horizon);
  g.addColorStop(1, '#7a7f92');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial sprite used by the particle system. */
export function sparkTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,240,200,0.7)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tangent-space normal map derived (Sobel) from a grayscale height drawn by `draw`. */
export function normalMapFrom(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
  strength = 2.2,
): THREE.Texture {
  const { c, ctx } = makeCanvas(size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size);
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = ctx.createImageData(size, size);
  const o = out.data;
  const h = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const ny = (h(x, y - 1) - h(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      o[i] = (nx * inv * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      o[i + 2] = inv * 255;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export function floorNormalTexture(): THREE.Texture {
  return normalMapFrom(
    (ctx, s) => {
      ctx.strokeStyle = '#1e1e1e';
      ctx.lineWidth = s * 0.03;
      ctx.strokeRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#aaaaaa' : '#555555';
        ctx.beginPath();
        ctx.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    256,
    1.5,
  );
}

export function wallNormalTexture(): THREE.Texture {
  return normalMapFrom(
    (ctx, s) => {
      const step = s / 8;
      for (let x = 0; x < s; x += step) {
        ctx.fillStyle = '#c8c8c8';
        ctx.fillRect(x, 0, step / 2, s);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x + step / 2, 0, step / 2, s);
      }
      for (let y = s * 0.12; y < s; y += s * 0.25) {
        for (let x = s * 0.06; x < s; x += step) {
          ctx.fillStyle = '#e8e8e8';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    256,
    2.4,
  );
}
