// Pedestrians for Solmar Shores: cheap low-poly walkers who wander the
// sidewalks between block corners, with a simple leg/arm walk swing. If a
// car comes close they run away from it for a moment, then carry on.
// Shared geometries and a small material palette keep them cheap.
import * as THREE from 'three';
import { BLOCK_CENTERS, resolveCircleCollisions } from './city.js';

const COUNT = 10;
const WALK_MIN = 1.2;
const WALK_MAX = 1.8;
const FLEE_SPEED = 3.6;
const FLEE_DIST = 4;

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c, 0xfd79a8];
const PANTS = [0x2c3e50, 0x5d4037, 0x37474f];
const SKINS = [0xe8b98a, 0xc68642, 0x8d5524, 0xffdbac];

const torsoGeo = new THREE.BoxGeometry(0.62, 0.72, 0.36);
const headGeo = new THREE.SphereGeometry(0.26, 12, 10);
const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.26);
legGeo.translate(0, -0.36, 0);
const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.22);
armGeo.translate(0, -0.31, 0);

const shirtMats = SHIRTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const pantsMats = PANTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const skinMats = SKINS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));

function buildPedMesh(i) {
  const group = new THREE.Group();
  const shirt = shirtMats[i % shirtMats.length];
  const pants = pantsMats[i % pantsMats.length];
  const skin = skinMats[i % skinMats.length];
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(headGeo, skin);
  head.position.y = 1.74;
  group.add(head);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.76, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.76, 0);
  group.add(legR);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.42, 1.42, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.42, 1.42, 0);
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

// A sidewalk corner: block centres are 48 apart, blocks are 36 wide, so
// the sidewalk ring runs at +-18 from each block centre.
function randomCorner() {
  const bx = BLOCK_CENTERS[Math.floor(Math.random() * BLOCK_CENTERS.length)];
  const bz = BLOCK_CENTERS[Math.floor(Math.random() * BLOCK_CENTERS.length)];
  const ox = (Math.random() < 0.5 ? -1 : 1) * 18;
  const oz = (Math.random() < 0.5 ? -1 : 1) * 18;
  return new THREE.Vector3(bx + ox, 0, bz + oz);
}

export function createPedestrians(scene, colliders, bounds) {
  const list = [];
  for (let i = 0; i < COUNT; i++) {
    const { group, legL, legR, armL, armR } = buildPedMesh(i);
    const start = randomCorner();
    group.position.copy(start);
    scene.add(group);
    list.push({
      group,
      legL,
      legR,
      armL,
      armR,
      pos: start,
      heading: Math.random() * Math.PI * 2,
      speed: WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN),
      target: randomCorner(),
      walkPhase: Math.random() * Math.PI * 2,
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      downTimer: 0, // knocked flat by a fast car: lies still, then gets up
    });
  }

  function update(dt, driven, trafficCars, policeCars) {
    // Flatten the nearby vehicles once per frame (position + speed, so a
    // fast car can knock a pedestrian flat).
    const vehicles = [];
    if (driven) vehicles.push({ x: driven.pos.x, z: driven.pos.z, speed: Math.abs(driven.speed) });
    for (const c of trafficCars) vehicles.push({ x: c.pos.x, z: c.pos.z, speed: c.speed });
    for (const c of policeCars) vehicles.push({ x: c.pos.x, z: c.pos.z, speed: c.speed });

    for (const ped of list) {
      // --- knocked down: a fast car within 1.7 m flattens the ped --------
      if (ped.downTimer > 0) {
        ped.downTimer -= dt;
        ped.group.rotation.x = -Math.PI / 2; // lying on their back
        ped.group.position.set(ped.pos.x, 0.3, ped.pos.z);
        if (ped.downTimer <= 0) ped.group.rotation.x = 0;
        continue;
      }
      for (const v of vehicles) {
        const dx = ped.pos.x - v.x;
        const dz = ped.pos.z - v.z;
        if (dx * dx + dz * dz < 1.7 * 1.7 && v.speed > 3) {
          ped.downTimer = 1.4;
          ped.fleeTimer = 0;
          break;
        }
      }
      if (ped.downTimer > 0) continue;

      // --- flee: a car within FLEE_DIST makes the ped run away ----------
      if (ped.fleeTimer <= 0) {
        for (const v of vehicles) {
          const dx = ped.pos.x - v.x;
          const dz = ped.pos.z - v.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < FLEE_DIST * FLEE_DIST) {
            const d = Math.sqrt(d2) || 1;
            ped.fleeX = dx / d;
            ped.fleeZ = dz / d;
            ped.fleeTimer = 1.5;
            break;
          }
        }
      }

      let moveX;
      let moveZ;
      let speed;
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        moveX = ped.fleeX;
        moveZ = ped.fleeZ;
        speed = FLEE_SPEED;
      } else {
        const dx = ped.target.x - ped.pos.x;
        const dz = ped.target.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) {
          ped.target = randomCorner();
          continue;
        }
        moveX = dx / d;
        moveZ = dz / d;
        speed = ped.speed;
      }

      ped.pos.x += moveX * speed * dt;
      ped.pos.z += moveZ * speed * dt;
      ped.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, ped.pos.x));
      ped.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, ped.pos.z));
      resolveCircleCollisions(ped.pos, 0.5, colliders);

      // Face the movement direction, turning smoothly.
      const targetHeading = Math.atan2(moveX, moveZ);
      let diff = targetHeading - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += diff * Math.min(1, dt * 10);

      // Walk swing.
      ped.walkPhase += dt * speed * 2.2;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.8;
      ped.armR.rotation.x = swing * 0.8;

      ped.group.position.set(ped.pos.x, 0, ped.pos.z);
      ped.group.rotation.y = ped.heading;
    }
  }

  return { list, update };
}
