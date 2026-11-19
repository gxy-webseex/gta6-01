// Solmar Shores: an original sunny seaside city built from boxes, planes and
// procedural textures. Street grid, low-rise blocks, a park plaza, a beach
// with palms and a pier. Returns the collision boxes and parked-car spots
// the gameplay modules need.
import * as THREE from 'three';
import { facadeTexture, roadTexture, sidewalkTexture, sandTexture, plankTexture, stripeTexture } from './textures.js';

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const ROAD_CENTERS = [-120, -72, -24, 24, 72, 120];
export const BLOCK_CENTERS = [-96, -48, 0, 48, 96];
const ROAD_W = 12;
const BLOCK = 36;

const FACADE_COLORS = ['#f2e3c6', '#e8a58c', '#9fc8c0', '#f5d76e', '#d9a7c0', '#a8c8e8', '#f0b27a', '#a9dfbf'];

export function buildCity(scene) {
  const rnd = seededRand(20261119);
  const colliders = [];

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(0x8ec9ee);
  scene.fog = new THREE.Fog(0xa8d0e8, 160, 520);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(140, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190;
  sun.shadow.camera.bottom = -190;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

  // --- ground, roads, sidewalks -------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshStandardMaterial({ color: 0x8fa07f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTex = roadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  for (const c of ROAD_CENTERS) {
    for (const [w, l, x, z, y] of [
      [ROAD_W, 264, c, 0, 0.02], // north-south road
      [264, ROAD_W, 0, c, 0.03], // east-west road
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, y, z);
      road.receiveShadow = true;
      scene.add(road);
    }
  }

  const walkTex = sidewalkTexture();
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 1 });
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 2, BLOCK + 2), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx, 0.05, bz);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // --- buildings ------------------------------------------------------------
  const topMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1 });
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 0 && bz === 0) continue; // central park plaza
      const dist = Math.hypot(bx, bz) / 140;
      const count = 1 + Math.floor(rnd() * 2.4); // 1-3 buildings per block
      for (let i = 0; i < count; i++) {
        const w = 11 + rnd() * 9;
        const d = 10 + rnd() * 8;
        const h = 8 + rnd() * rnd() * 26 * (1.15 - dist * 0.5);
        const ox = (rnd() - 0.5) * (BLOCK - w - 8);
        const oz = (rnd() - 0.5) * (BLOCK - d - 8);
        const x = bx + ox;
        const z = bz + oz;
        const base = FACADE_COLORS[Math.floor(rnd() * FACADE_COLORS.length)];
        const floors = Math.max(2, Math.round(h / 4.5));
        const side = new THREE.MeshStandardMaterial({
          map: facadeTexture(base, Math.floor(rnd() * 1e9), floors, Math.max(3, Math.round(w / 4))),
          roughness: 0.9,
        });
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [side, side, topMat, topMat, side, side],
        );
        building.position.set(x, 0.05 + h / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        colliders.push({ minX: x - w / 2 - 0.3, maxX: x + w / 2 + 0.3, minZ: z - d / 2 - 0.3, maxZ: z + d / 2 + 0.3 });
      }
    }
  }

  // --- central park plaza ----------------------------------------------------
  const park = new THREE.Mesh(
    new THREE.CircleGeometry(15, 24),
    new THREE.MeshStandardMaterial({ color: 0x69a84f, roughness: 1 }),
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(0, 0.07, 0);
  park.receiveShadow = true;
  scene.add(park);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.6, 1.1, 20),
    new THREE.MeshStandardMaterial({ color: 0x8fb8c8, roughness: 0.6 }),
  );
  fountain.position.set(0, 0.6, 0);
  fountain.castShadow = true;
  scene.add(fountain);
  const fountainWaterMat = new THREE.MeshStandardMaterial({
    color: 0x0e9be8, // saturated pool blue, reads as water from any angle
    roughness: 0.1,
    metalness: 0.3,
    emissive: 0x0a5e8a,
    emissiveIntensity: 0.45,
  });
  const fountainWater = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 20),
    fountainWaterMat,
  );
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(0, 1.12, 0);
  scene.add(fountainWater);
  // A small centre jet, bobbing gently: the fountain is alive, not a disc.
  const jetMat = new THREE.MeshStandardMaterial({
    color: 0x4fc3f7,
    roughness: 0.2,
    transparent: true,
    opacity: 0.85,
  });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.85, 2.0, 10), jetMat);
  jet.position.set(0, 2.0, 0);
  scene.add(jet);
  let waterTime = 0;
  function updateCity(dt) {
    waterTime += dt;
    const p = Math.sin(waterTime * 2.2);
    fountainWaterMat.emissiveIntensity = 0.45 + p * 0.18;
    jet.scale.y = 1 + p * 0.18;
    jet.position.y = 2.0 + p * 0.08;
  }
  colliders.push({ minX: -4.6, maxX: 4.6, minZ: -4.6, maxZ: 4.6 });

  // --- beach, water, pier ----------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 360),
    new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-186, 0.04, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 760),
    new THREE.MeshStandardMaterial({ color: 0x2e9fc4, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.88 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-370, -0.5, 0);
  scene.add(water);

  const plankMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 0.6, 9), plankMat);
  pier.position.set(-183, 0.9, 0);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.2, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1 });
  for (const px of [-166, -178, -190, -202]) {
    for (const pz of [-3.6, 3.6]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, -0.2, pz);
      scene.add(post);
    }
  }
  // pier-end bait hut
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 5),
    new THREE.MeshStandardMaterial({ color: 0xf2e3c6, roughness: 0.9 }),
  );
  hut.position.set(-202, 3.2, 0);
  hut.castShadow = true;
  scene.add(hut);
  const hutRoof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 2.6, 4),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.9 }),
  );
  hutRoof.position.set(-202, 6.5, 0);
  hutRoof.rotation.y = Math.PI / 4;
  hutRoof.castShadow = true;
  scene.add(hutRoof);
  colliders.push({ minX: -205.5, maxX: -198.5, minZ: -3, maxZ: 3 });

  // beach umbrellas
  const umbrellaTex = stripeTexture('#ff6b6b', '#ffffff');
  const umbrellaMat = new THREE.MeshStandardMaterial({ map: umbrellaTex, roughness: 0.8, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 1 });
  for (const [ux, uz] of [[-170, -40], [-172, 24], [-168, 78], [-174, -96]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), poleMat);
    pole.position.set(ux, 1.3, uz);
    scene.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 10, 1, true), umbrellaMat);
    shade.position.set(ux, 2.9, uz);
    shade.castShadow = true;
    scene.add(shade);
  }

  // --- palm trees -------------------------------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 5.4, 8);
  const frondGeo = new THREE.ConeGeometry(0.55, 3.6, 4);
  frondGeo.scale(1, 1, 0.22);
  const palmSpots = [];
  for (let z = -150; z <= 150; z += 30) palmSpots.push([-156, z + (rnd() - 0.5) * 8]);
  palmSpots.push([-10, -10], [10, 12], [-12, 10], [12, -12], [-100, 100], [100, -100]);
  for (const [px, pz] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.7;
    trunk.rotation.z = (rnd() - 0.5) * 0.16;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 6; f++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (f / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      frond.castShadow = true;
      palm.add(frond);
    }
    palm.position.set(px, 0, pz);
    scene.add(palm);
  }

  // --- street lamps ------------------------------------------------------------
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.4 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 8);
  const headGeo = new THREE.SphereGeometry(0.42, 10, 8);
  for (const rx of ROAD_CENTERS) {
    for (const bz of [-96, 0, 96]) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, lampPoleMat);
      pole.position.y = 3;
      pole.castShadow = true;
      lamp.add(pole);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.y = 6.1;
      lamp.add(head);
      lamp.position.set(rx + 6.4, 0, bz);
      scene.add(lamp);
    }
  }

  // --- parked-car spots (road edge, heading along the road) --------------------
  const carSpawns = [
    { x: -27.5, z: 30, heading: 0 }, // north-south road, coral coupe
    { x: 60, z: 68.5, heading: Math.PI / 2 }, // east-west road, teal sedan
    { x: 68.5, z: -48, heading: 0 }, // north-south road, yellow hatch
  ];

  return {
    colliders,
    carSpawns,
    update: updateCity,
    // soft world limits: beach water on the west, city edge elsewhere
    bounds: { minX: -202, maxX: 168, minZ: -168, maxZ: 168 },
  };
}

// Circle (player/car) vs building AABBs: push the circle out of any overlap.
export function resolveCircleCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushT = pos.z - c.minZ + radius;
        const pushB = c.maxZ - pos.z + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = c.minX - radius;
        else if (m === pushR) pos.x = c.maxX + radius;
        else if (m === pushT) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}
