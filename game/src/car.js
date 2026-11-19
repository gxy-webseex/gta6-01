// Drivable cars for Solmar Shores: a simple low-poly car mesh plus arcade
// driving physics (acceleration, braking, reverse, speed-sensitive steering).
// E near a parked car enters it; E again steps out beside it.
import * as THREE from 'three';

const MAX_SPEED = 30; // m/s, about 108 km/h
const MAX_REVERSE = 9;
const ACCEL = 15;
const BRAKE = 28;
const DRAG = 0.55; // per second, rolling resistance
const WHEELBASE = 2.9;
const MAX_STEER = 0.55;

const CAR_DEFS = [
  { name: 'Coral Coupe', color: 0xe74c3c },
  { name: 'Teal Sedan', color: 0x1abc9c },
  { name: 'Sunny Hatch', color: 0xf1c40f },
];

export function buildCarMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2b3c, roughness: 0.15, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, roughness: 0.25, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.3), glass);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.0), paint);
  hood.position.set(0, 0.92, 1.55);
  group.add(hood);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 0.3), chrome);
  bumperF.position.set(0, 0.42, 2.2);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.2;
  group.add(bumperR);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  for (const x of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    hl.position.set(x, 0.72, 2.21);
    group.add(hl);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x880000, emissiveIntensity: 0.7 });
  for (const x of [-0.65, 0.65]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tl.position.set(x, 0.72, -2.21);
    group.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steerWheels = [];
  for (const [x, z, steer] of [[-0.95, 1.45, true], [0.95, 1.45, true], [-0.95, -1.45, false], [0.95, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (steer) steerWheels.push(pivot);
  }
  return { group, wheels, steerWheels };
}

export function createCars(scene, spawns) {
  const cars = spawns.map((spawn, i) => {
    const def = CAR_DEFS[i % CAR_DEFS.length];
    const { group, wheels, steerWheels } = buildCarMesh(def.color);
    group.position.set(spawn.x, 0, spawn.z);
    group.rotation.y = spawn.heading;
    scene.add(group);
    return {
      name: def.name,
      group,
      wheels,
      steerWheels,
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      heading: spawn.heading,
      speed: 0,
      steer: 0,
      driven: false,
      owned: true, // the three parked cars belong to someone: taking one is theft
      traffic: false,
    };
  });

  function nearestParked(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.driven) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function updateDriven(car, dt, input, colliders, bounds, others) {
    let hit = 0; // collision impact this frame, 0..1 (drives the thud SFX)
    const throttle = input.keys.has('KeyW') ? 1 : 0;
    const brake = input.keys.has('KeyS') ? 1 : 0;
    const steerIn = (input.keys.has('KeyA') ? 1 : 0) - (input.keys.has('KeyD') ? 1 : 0);

    if (throttle) car.speed += ACCEL * dt;
    if (brake) {
      if (car.speed > 0.5) car.speed -= BRAKE * dt;
      else car.speed -= ACCEL * 0.6 * dt; // reverse
    }
    // rolling drag + coasting stop
    car.speed -= car.speed * DRAG * dt;
    if (!throttle && !brake && Math.abs(car.speed) < 0.25) car.speed = 0;
    car.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, car.speed));

    // steering eases with speed; no turn when parked
    const steerTarget = steerIn * MAX_STEER * Math.max(0, 1 - Math.abs(car.speed) / (MAX_SPEED * 1.4));
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    if (Math.abs(car.speed) > 0.05) {
      car.heading += (car.speed / WHEELBASE) * Math.tan(car.steer) * dt;
    }

    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;

    // bounds + building collision (circle radius 2.1)
    car.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, car.pos.x));
    car.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, car.pos.z));
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(car.pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(car.pos.z, c.maxZ));
      const dx = car.pos.x - cx;
      const dz = car.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.1 * 2.1) {
        if (Math.abs(car.speed) > 4) hit = Math.max(hit, Math.min(1, Math.abs(car.speed) / 22));
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          car.pos.x = cx + (dx / d) * 2.1;
          car.pos.z = cz + (dz / d) * 2.1;
        } else {
          car.pos.x = c.maxX + 2.1;
        }
        car.speed *= 0.4; // scrape the wall, lose speed
      }
    }
    // don't drive through the other parked cars
    for (const other of others) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 1e-6) {
        if (Math.abs(car.speed) > 4) hit = Math.max(hit, Math.min(1, Math.abs(car.speed) / 25));
        car.pos.x = other.pos.x + (dx / d) * 4.4;
        car.pos.z = other.pos.z + (dz / d) * 4.4;
        car.speed *= 0.5;
      }
    }

    car.group.position.set(car.pos.x, 0, car.pos.z);
    car.group.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.38;
    for (const w of car.wheels) w.rotation.x += spin;
    for (const p of car.steerWheels) p.rotation.y = car.steer;
    return hit;
  }

  return { cars, nearestParked, updateDriven };
}
