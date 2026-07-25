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

/**
 * Outdoor ground: clumpy grass/dirt. Tiled at a high repeat for close-up
 * detail, then broken up by a second low-frequency pass so the plane doesn't
 * read as one flat colour from a distance.
 */
export function groundTexture(base = '#6b8a45', dirt = '#7d7346'): THREE.Texture {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // broad tonal patches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 40 + Math.random() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const pick = Math.random();
    g.addColorStop(0, pick > 0.6 ? 'rgba(120,146,74,0.4)' : pick > 0.3 ? 'rgba(70,96,48,0.4)' : `${dirt}55`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grass blades / speckle
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = Math.random();
    ctx.strokeStyle =
      v > 0.72
        ? 'rgba(146,176,92,0.5)'
        : v > 0.4
          ? 'rgba(86,112,54,0.5)'
          : 'rgba(58,80,40,0.45)';
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 2 - Math.random() * 5);
    ctx.stroke();
  }
  // scattered stones
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(126,124,112,${0.2 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  return srgb(c);
}

/** Large-scale mottling laid over the ground so tiling never reads as a grid. */
export function groundMacroTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 12 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() > 0.5;
    g.addColorStop(0, light ? 'rgba(200,200,200,0.5)' : 'rgba(50,50,50,0.5)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Soft puffy sprite for alpha-blended smoke and dust. */
export function smokeTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(128);
  // A few overlapping soft lobes read as a puff rather than a perfect circle.
  for (const [cx, cy, r, a] of [
    [64, 64, 46, 0.5],
    [46, 54, 32, 0.4],
    [82, 58, 34, 0.4],
    [58, 82, 30, 0.35],
  ]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
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

// ---------------------------------------------------------------------------
// Data-map helpers (roughness / AO / metalness). These must stay in linear
// space — tagging them sRGB is the classic "why is my roughness wrong" bug.
// ---------------------------------------------------------------------------

/** Build a linear-space single-channel-ish map from a grayscale drawing. */
export function dataTexture(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
  base = '#808080',
): THREE.Texture {
  const { c, ctx } = makeCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Speckled grain — breaks up the uniform-roughness "plastic everything" look. */
const speckle = (ctx: CanvasRenderingContext2D, s: number, n: number, lo: number, hi: number): void => {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(lo + Math.random() * (hi - lo));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Polished shop concrete: aggregate, expansion joints, stains, worn patches. */
export function concreteTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = '#4c5361';
  ctx.fillRect(0, 0, 512, 512);
  // aggregate
  for (let i = 0; i < 5000; i++) {
    const v = 58 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgba(${v},${v + 5},${v + 13},${0.35 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, 0.6 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // broad blotchy staining
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 24 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.45;
    g.addColorStop(0, dark ? 'rgba(24,27,34,0.24)' : 'rgba(126,136,155,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // expansion joints along two edges so the tile grid reads as slab seams
  ctx.strokeStyle = 'rgba(16,18,24,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(150,162,182,0.10)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(3, 3, 506, 506);
  return srgb(c);
}

export function concreteRoughness(): THREE.Texture {
  return dataTexture((ctx, s) => {
    speckle(ctx, s, 2600, 130, 215);
    // burnished/worn patches are smoother (darker roughness)
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 30 + Math.random() * 100;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(70,70,70,0.5)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 512, '#b4b4b4');
}

/** Painted sheet-metal wall panel: ribs, bolts, drips, edge wear. */
export function panelTexture(base = '#6c7a94'): THREE.Texture {
  const { c, ctx } = makeCanvas(512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) {
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 64, 512);
  }
  for (let y = 40; y < 512; y += 128) {
    for (let x = 32; x < 512; x += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 0.8, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // rust/grime drips from the bolt rows
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const h = 8 + Math.random() * 46;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(78,54,32,0.22)');
    g.addColorStop(1, 'rgba(78,54,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 1.5 + Math.random() * 2.5, h);
  }
  return srgb(c);
}

export function panelRoughness(): THREE.Texture {
  return dataTexture((ctx, s) => {
    for (let x = 0; x < s; x += s / 8) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.fillRect(x, 0, s / 16, s);
    }
    speckle(ctx, s, 1400, 120, 200);
  }, 512, '#9a9a9a');
}

/** Painted/worn steel for tools, frames, machinery. */
export function steelTexture(base = '#9aa3b2'): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const a = Math.random() * 0.1;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 1);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(58,42,26,${0.06 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return srgb(c);
}

export function steelRoughness(): THREE.Texture {
  return dataTexture((ctx, s) => speckle(ctx, s, 2000, 70, 190), 256, '#7d7d7d');
}

/** Scuffed workbench timber. */
export function woodTexture(base = '#8a6238'): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 190; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = `rgba(${40 + Math.random() * 40},${26 + Math.random() * 26},${12 + Math.random() * 18},${0.06 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random() * 2.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.2);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.strokeStyle = 'rgba(46,30,14,0.4)';
    ctx.lineWidth = 2;
    for (let r = 3; r < 12; r += 3) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return srgb(c);
}

/** Tyre tread — chunky blocks, used as both albedo and (inverted) bump. */
export function treadTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256);
  ctx.fillStyle = '#101216';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 42) {
      const off = (y / 32) % 2 ? 21 : 0;
      ctx.fillStyle = '#23262e';
      ctx.beginPath();
      ctx.roundRect(x + off, y + 4, 30, 22, 5);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fillRect(0, 112, 256, 32);
  return srgb(c);
}

export function treadNormal(): THREE.Texture {
  return normalMapFrom((ctx, s) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, s, s);
    const step = s / 8;
    for (let y = 0; y < s; y += step) {
      for (let x = 0; x < s; x += step * 1.3) {
        const off = (y / step) % 2 ? step * 0.65 : 0;
        ctx.fillStyle = '#d8d8d8';
        ctx.beginPath();
        ctx.roundRect(x + off, y + step * 0.12, step * 0.95, step * 0.7, step * 0.16);
        ctx.fill();
      }
    }
  }, 256, 2.6);
}

/** Ambient-occlusion-ish corner darkening for large flat panels. */
export function edgeAoTexture(): THREE.Texture {
  return dataTexture((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(90,90,90,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,1)');
    g.addColorStop(0.82, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(90,90,90,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 128, '#ffffff');
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
