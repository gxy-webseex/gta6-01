// Police AI for Solmar Shores: black-and-white interceptors with a
// flashing red/blue light bar. One spawns when the wanted level hits 1,
// a second at 3 stars; they chase the player (direct steering plus the
// same building-collision slide the driven car uses, no pathfinding),
// ram the driven car to slow it, and give up and despawn at wanted 0.
import * as THREE from 'three';
import { buildCarMesh } from './car.js';
import { ROAD_CENTERS } from './city.js';

const PURSUE_SPEED = 24; // m/s on the open road; the player tops out at 30
const TURN_RATE = 2.4; // rad/s
const RAM_DIST = 4.6;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function buildPoliceMesh() {
  const { group, wheels, steerWheels } = buildCarMesh(0x14181c);
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.4, metalness: 0.3 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 1.5), white);
  roof.position.set(0, 1.42, -0.25);
  group.add(roof);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 0.9), white);
  stripe.position.set(0, 0.62, 0.4);
  group.add(stripe);

  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.08, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
  );
  barBase.position.set(0, 1.5, -0.25);
  group.add(barBase);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0033cc, emissive: 0x2266ff, emissiveIntensity: 0.15 });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.36), redMat);
  red.position.set(-0.33, 1.6, -0.25);
  group.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.36), blueMat);
  blue.position.set(0.33, 1.6, -0.25);
  group.add(blue);
  return { group, wheels, steerWheels, redMat, blueMat };
}

export function createPolice(scene, colliders, bounds) {
  const cars = [];
  let spawnCooldown = 0;
  let despawnTimer = 0;
  let flashTimer = 0;
  let flashOn = true;

  function spawnNear(targetPos) {
    const { group, wheels, steerWheels, redMat, blueMat } = buildPoliceMesh();
    // Pick a road and a spot 60-80 m from the player along it.
    const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const along = Math.random() < 0.5 ? -1 : 1;
    const at = (axis === 'z' ? targetPos.z : targetPos.x) + along * (60 + Math.random() * 20);
    const clamped = Math.max(-150, Math.min(150, at));
    const x = axis === 'z' ? road + (Math.random() < 0.5 ? -3 : 3) : clamped;
    const z = axis === 'z' ? clamped : road + (Math.random() < 0.5 ? -3 : 3);
    group.position.set(x, 0, z);
    scene.add(group);
    const car = {
      name: 'Police Interceptor',
      group,
      wheels,
      steerWheels,
      redMat,
      blueMat,
      pos: new THREE.Vector3(x, 0, z),
      heading: Math.atan2(targetPos.x - x, targetPos.z - z),
      speed: 0,
      steer: 0,
      driven: false,
      police: true,
    };
    group.rotation.y = car.heading;
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    scene.remove(car.group);
  }

  // The player rammed this police car: knock it back and slow it down.
  function knock(car, fromPos) {
    car.speed *= 0.25;
    const dx = car.pos.x - fromPos.x;
    const dz = car.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz) || 1;
    car.pos.x += (dx / d) * 3;
    car.pos.z += (dz / d) * 3;
  }

  function nearest(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function nearestDist(pos) {
    if (cars.length === 0) return null;
    let best = Infinity;
    for (const car of cars) {
      best = Math.min(best, Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z));
    }
    return best;
  }

  // Verification hook: put the nearest police car ahead of the player,
  // facing them, so a ram can be driven into on purpose.
  function debugPlaceAhead(fromPos, heading, dist) {
    if (cars.length === 0) return false;
    const car = cars[0];
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    car.pos.set(fromPos.x + fx * dist, 0, fromPos.z + fz * dist);
    car.heading = heading + Math.PI;
    car.speed = 0;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    return true;
  }

  function update(dt, targetPos, targetDriving, wantedLevel, drivenCar, trafficCars) {
    spawnCooldown = Math.max(0, spawnCooldown - dt);
    const desired = wantedLevel >= 3 ? 2 : wantedLevel >= 1 ? 1 : 0;
    if (cars.length < desired && spawnCooldown <= 0) {
      spawnNear(targetPos);
      spawnCooldown = 2;
      despawnTimer = 0;
    }
    if (cars.length > desired) {
      // Wanted fell: give the cops a moment to peel off, then despawn.
      despawnTimer += dt;
      if (despawnTimer > 3) {
        while (cars.length > desired) removeCar(cars[0]);
        despawnTimer = 0;
      }
    } else {
      despawnTimer = 0;
    }

    // Flash the light bars: red and blue alternate.
    flashTimer += dt;
    if (flashTimer > 0.22) {
      flashTimer = 0;
      flashOn = !flashOn;
      for (const car of cars) {
        car.redMat.emissiveIntensity = flashOn ? 2.2 : 0.15;
        car.blueMat.emissiveIntensity = flashOn ? 0.15 : 2.2;
      }
    }

    for (const car of cars) {
      const dx = targetPos.x - car.pos.x;
      const dz = targetPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);

      // Stuck far behind for a long time: jump back into the chase, 70 m
      // out on a road. (A plain distance teleport would make escaping
      // impossible, so it only fires after 15 s beyond 100 m.)
      if (dist > 100) car.farTimer = (car.farTimer || 0) + dt;
      else car.farTimer = 0;
      if (car.farTimer > 15) {
        const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
        const axis = Math.random() < 0.5 ? 'z' : 'x';
        const at = (axis === 'z' ? targetPos.z : targetPos.x) + (Math.random() < 0.5 ? -70 : 70);
        const clamped = Math.max(-150, Math.min(150, at));
        car.pos.x = axis === 'z' ? road + 3 : clamped;
        car.pos.z = axis === 'z' ? clamped : road + 3;
        car.speed = 10;
        car.farTimer = 0;
      }

      // Steer toward the player, easing off when close.
      const desiredHeading = Math.atan2(dx, dz);
      car.heading = angleLerp(car.heading, desiredHeading, dt * TURN_RATE);
      let targetSpeed;
      if (!targetDriving && dist < 5) targetSpeed = 0; // don't run the player over
      else if (dist > 25) targetSpeed = PURSUE_SPEED;
      else if (dist > 8) targetSpeed = 16;
      else targetSpeed = 9;
      const rate = targetSpeed < car.speed ? 16 : 9;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - car.speed));
      car.speed = Math.max(0, car.speed);

      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, car.pos.x));
      car.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, car.pos.z));

      // Building collision (circle radius 2.1), same slide as the driven car.
      for (const c of colliders) {
        const cx = Math.max(c.minX, Math.min(car.pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(car.pos.z, c.maxZ));
        const ox = car.pos.x - cx;
        const oz = car.pos.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 < 2.1 * 2.1) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            car.pos.x = cx + (ox / d) * 2.1;
            car.pos.z = cz + (oz / d) * 2.1;
          } else {
            car.pos.x = c.maxX + 2.1;
          }
          car.speed *= 0.4;
        }
      }

      // Don't pile into the other police cars or the traffic.
      for (const other of cars) {
        if (other === car) continue;
        const ox = car.pos.x - other.pos.x;
        const oz = car.pos.z - other.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 4.4 && d > 1e-6) {
          car.pos.x = other.pos.x + (ox / d) * 4.4;
          car.pos.z = other.pos.z + (oz / d) * 4.4;
        }
      }
      for (const other of trafficCars) {
        const ox = car.pos.x - other.pos.x;
        const oz = car.pos.z - other.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 4.4 && d > 1e-6) {
          car.pos.x = other.pos.x + (ox / d) * 4.4;
          car.pos.z = other.pos.z + (oz / d) * 4.4;
        }
      }

      // Ram the driven car: slow the player down and shove them.
      if (targetDriving && drivenCar && dist < RAM_DIST) {
        drivenCar.speed *= Math.max(0, 1 - 1.2 * dt);
        const push = 2 * dt;
        drivenCar.pos.x += (drivenCar.pos.x - car.pos.x) / Math.max(dist, 0.01) * push;
        drivenCar.pos.z += (drivenCar.pos.z - car.pos.z) / Math.max(dist, 0.01) * push;
      }

      car.group.position.set(car.pos.x, 0, car.pos.z);
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.38;
      for (const w of car.wheels) w.rotation.x += spin;
      for (const p of car.steerWheels) p.rotation.y = car.steer;
    }
  }

  return { cars, update, knock, nearest, nearestDist, debugPlaceAhead };
}
