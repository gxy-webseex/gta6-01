// The player on foot: a low-poly figure that visibly walks, runs and jumps.
// Movement is camera-relative; gravity pulls the jump back to the street.
import * as THREE from 'three';

const WALK_SPEED = 5.2;
const RUN_SPEED = 9.5;
const JUMP_SPEED = 8.5;
const GRAVITY = 24;

export function createPlayer(scene) {
  const group = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skin);
  head.position.y = 1.86;
  head.castShadow = true;
  group.add(head);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 1.92;
  group.add(hairCap);

  const legGeo = new THREE.BoxGeometry(0.26, 0.8, 0.3);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.geometry = legGeo.clone();
  legL.geometry.translate(0, -0.4, 0);
  legL.position.set(-0.19, 0.8, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.geometry = legGeo.clone();
  legR.geometry.translate(0, -0.4, 0);
  legR.position.set(0.19, 0.8, 0);
  legR.castShadow = true;
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.24);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.geometry = armGeo.clone();
  armL.geometry.translate(0, -0.35, 0);
  armL.position.set(-0.48, 1.55, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.geometry = armGeo.clone();
  armR.geometry.translate(0, -0.35, 0);
  armR.position.set(0.48, 1.55, 0);
  group.add(armR);

  scene.add(group);

  const state = {
    group,
    pos: new THREE.Vector3(0, 0, 8), // start on the plaza, facing the beach
    heading: Math.PI, // face -z... heading is the direction the figure faces
    vy: 0,
    grounded: true,
    walkPhase: 0,
    moving: false,
    speed: 0,
  };
  group.position.copy(state.pos);

  function update(dt, input, colliders, bounds) {
    const { f, s } = input.axis();
    const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = run ? RUN_SPEED : WALK_SPEED;
    const yaw = input.yaw;
    // Camera-relative move direction (forward is -z rotated by yaw).
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    let mx = -sin * f + cos * s;
    let mz = -cos * f - sin * s;
    const len = Math.hypot(mx, mz);
    state.moving = len > 0.01;
    if (state.moving) {
      mx /= len;
      mz /= len;
      state.pos.x += mx * speed * dt;
      state.pos.z += mz * speed * dt;
      state.speed = speed;
      // Face the movement direction, turning smoothly.
      const target = Math.atan2(mx, mz);
      let diff = target - state.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.heading += diff * Math.min(1, dt * 12);
      state.walkPhase += dt * speed * 1.6;
    } else {
      state.speed = 0;
    }

    if (input.pressed('Space') && state.grounded) {
      state.vy = JUMP_SPEED;
      state.grounded = false;
    }
    state.vy -= GRAVITY * dt;
    state.pos.y += state.vy * dt;
    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.vy = 0;
      state.grounded = true;
    }

    // World limits + building collision (circle radius 0.6).
    state.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, state.pos.x));
    state.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, state.pos.z));
    const flat = { x: state.pos.x, z: state.pos.z };
    // Inline circle-vs-AABB resolution (same rule as city.resolveCircleCollisions).
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(flat.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(flat.z, c.maxZ));
      const dx = flat.x - cx;
      const dz = flat.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.36) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          flat.x = cx + (dx / d) * 0.6;
          flat.z = cz + (dz / d) * 0.6;
        } else {
          const pushL = flat.x - c.minX + 0.6;
          const pushR = c.maxX - flat.x + 0.6;
          const pushT = flat.z - c.minZ + 0.6;
          const pushB = c.maxZ - flat.z + 0.6;
          const m = Math.min(pushL, pushR, pushT, pushB);
          if (m === pushL) flat.x = c.minX - 0.6;
          else if (m === pushR) flat.x = c.maxX + 0.6;
          else if (m === pushT) flat.z = c.minZ - 0.6;
          else flat.z = c.maxZ + 0.6;
        }
      }
    }
    state.pos.x = flat.x;
    state.pos.z = flat.z;

    // Pose: legs and arms swing with the walk, body bobs.
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.65 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    group.position.set(state.pos.x, state.pos.y + (state.moving ? Math.abs(Math.sin(state.walkPhase)) * 0.06 : 0), state.pos.z);
    group.rotation.y = state.heading;
  }

  return { state, update };
}
