// Procedural canvas textures for Solmar Shores. Every texture is drawn at run
// time on an off-screen canvas, so the game ships no image files and makes no
// network requests. All textures are deterministic (seeded) for a stable city.
import * as THREE from 'three';

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A building facade: base colour, a grid of lit/unlit windows, a darker
// ground-floor band with a door and shop awning stripe. Floors/cols tune the
// window density for short vs tall blocks.
export function facadeTexture(base, seed, floors = 6, cols = 4) {
  return canvasTexture(256, 256, (g, w, h) => {
    const rnd = seededRand(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // faint vertical panel shading
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(0,0,0,0.05)';
      g.fillRect(x, 0, 2, h);
    }
    // windows
    const margin = 18;
    const cw = (w - margin * 2) / cols;
    const ch = (h - 34) / floors;
    for (let r = 0; r < floors; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rnd() < 0.28;
        const x = margin + c * cw + cw * 0.18;
        const y = 8 + r * ch + ch * 0.2;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x - 2, y - 2, cw * 0.64 + 4, ch * 0.6 + 4);
        g.fillStyle = lit ? '#ffe9a8' : (rnd() < 0.5 ? '#2b3d4f' : '#3d5a74');
        g.fillRect(x, y, cw * 0.64, ch * 0.6);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, cw * 0.64, 3);
      }
    }
    // ground floor: shopfront band
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, h - 30, w, 30);
    g.fillStyle = '#241d18';
    g.fillRect(w * 0.42, h - 30, w * 0.16, 30);
    g.fillStyle = '#7dff9a';
    g.fillRect(w * 0.08, h - 26, w * 0.26, 4);
    g.fillStyle = '#ff9d5c';
    g.fillRect(w * 0.66, h - 26, w * 0.26, 4);
  });
}

// Asphalt with a dashed centre line and speckles. Repeat along the road.
export function roadTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#33373c';
    g.fillRect(0, 0, w, h);
    const rnd = seededRand(99);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.fillStyle = '#e8e8e8';
    g.fillRect(6, 0, 3, h);
    g.fillRect(w - 9, 0, 3, h);
    g.fillStyle = '#ffd23e';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34);
  }, 1, 4);
}

// Pale sidewalk slabs with expansion joints.
export function sidewalkTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b3a4';
    g.fillRect(0, 0, w, h);
    const rnd = seededRand(7);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(0,0,0,0.05)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 0; y <= h; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  }, 6, 6);
}

// Warm beach sand with speckles and faint ripple bands.
export function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#e8d29a';
    g.fillRect(0, 0, w, h);
    const rnd = seededRand(21);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(180,140,80,0.25)' : 'rgba(255,244,200,0.3)';
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(160,120,60,0.18)';
    g.lineWidth = 3;
    for (let y = 20; y < h; y += 46) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05) * 4);
      g.stroke();
    }
  }, 8, 8);
}

// Weathered pier planks.
export function plankTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8a6b45';
    g.fillRect(0, 0, w, h);
    const rnd = seededRand(55);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
      g.fillRect(x, 0, 30, h);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(x + 30, 0, 2, h);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(rnd() * w, rnd() * h, 6, 1);
    }
  }, 2, 10);
}

// Striped beach umbrella / awning cloth.
export function stripeTexture(colorA, colorB) {
  return canvasTexture(128, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = (x / 16) % 2 === 0 ? colorA : colorB;
      g.fillRect(x, 0, 16, h);
    }
  }, 4, 1);
}
