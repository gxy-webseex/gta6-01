// Minimap for Solmar Shores: a small canvas in the HUD corner that draws
// the road grid once per frame, then the player, the driven car, police,
// traffic and the active mission marker. World x maps to canvas x, world
// z maps to canvas y (north is up). Pure 2D canvas, no textures.
import { ROAD_CENTERS } from './city.js';

const MIN = -168;
const MAX = 168;

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / (MAX - MIN);
  const toX = (x) => (x - MIN) * scale;
  const toY = (z) => (z - MIN) * scale;

  function dot(x, z, r, color, ring) {
    ctx.beginPath();
    ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (ring) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ring;
      ctx.stroke();
    }
  }

  let time = 0;
  function update(dt, state) {
    time += dt;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(4, 20, 34, 0.78)';
    ctx.fillRect(0, 0, size, size);

    // Water strip on the west edge (the beach and the sea).
    ctx.fillStyle = '#2e9fc4';
    ctx.fillRect(0, 0, toX(-162), size);
    ctx.fillStyle = '#d9c48a';
    ctx.fillRect(toX(-162), 0, toX(-156) - toX(-162), size);

    // Roads: the 6 north-south and 6 east-west streets.
    ctx.strokeStyle = '#55677a';
    ctx.lineWidth = Math.max(2, 12 * scale);
    for (const c of ROAD_CENTERS) {
      ctx.beginPath();
      ctx.moveTo(toX(c), 0);
      ctx.lineTo(toX(c), size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, toY(c));
      ctx.lineTo(size, toY(c));
      ctx.stroke();
    }

    // Next mission start beacon (gold hollow circle) when no job is active.
    if (state.start) dot(state.start.x, state.start.z, 5, 'rgba(255, 210, 62, 0)', '#ffd23e');

    // Active mission waypoint: a pulsing gold dot.
    if (state.waypoint) {
      const pulse = 4 + Math.sin(time * 5) * 1.5;
      dot(state.waypoint.x, state.waypoint.z, pulse, '#ffd23e', '#fff');
    }

    // Traffic (small, pale blue), police (red), driven car (yellow).
    for (const c of state.traffic || []) dot(c.pos.x, c.pos.z, 2, '#9fc8e8');
    for (const c of state.police || []) dot(c.pos.x, c.pos.z, 3.5, '#ff4757', '#fff');
    if (state.car) dot(state.car.x, state.car.z, 3.5, '#ffd23e', '#fff');

    // The player: white dot with a green ring, always on top.
    if (state.player) dot(state.player.x, state.player.z, 4, '#fff', '#2ecc71');

    // North marker.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', size - 8, 12);
  }

  return { update };
}
