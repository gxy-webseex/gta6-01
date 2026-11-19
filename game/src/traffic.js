// Traffic for Solmar Shores: AI cars that drive the street grid on the
// right-hand lane, pause briefly at intersections, sometimes turn, overtake
// stopped cars, and respawn at the far edge when they leave the city.
// They reuse car.js's mesh and stay on the roads, so no building collision
// is needed. A stopped traffic car can be hijacked (see main.js).
import * as THREE from 'three';
import { buildCarMesh } from './car.js';
import { ROAD_CENTERS } from './city.js';

const TRAFFIC_DEFS = [
  { name: 'City Cruiser', color: 0x3498db },
  { name: 'Harbor Taxi', color: 0xf39c12 },
  { name: 'Palm Van', color: 0x9b59b6 },
  { name: 'Bay Runner', color: 0x2ecc71 },
  { name: 'Dune Buggy', color: 0xe67e22 },
  { name: 'Mist Coupe', color: 0xecf0f1 },
  { name: 'Coral Cab', color: 0xe74c3c },
];

const COUNT = 7;
const EDGE = 152; // respawn past this along-axis coordinate
const LANE = 3; // metres from the road centre line

function axisHeading(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

// Right-hand lane offset for a road of the given axis and direction.
function rightLane(axis, dir) {
  return axis === 'z' ? -LANE * dir : LANE * dir;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function createTraffic(scene, colliders, bounds, parkedCars) {
  const cars = [];

  function spawnCar(def) {
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const { group, wheels, steerWheels } = buildCarMesh(def.color);
    const along = (Math.random() * 2 - 1) * 140;
    const x = axis === 'z' ? road + rightLane(axis, dir) : along;
    const z = axis === 'z' ? along : road + rightLane(axis, dir);
    group.position.set(x, 0, z);
    group.rotation.y = axisHeading(axis, dir);
    scene.add(group);
    return {
      name: def.name,
      group,
      wheels,
      steerWheels,
      pos: new THREE.Vector3(x, 0, z),
      heading: axisHeading(axis, dir),
      speed: 0,
      steer: 0,
      driven: false,
      owned: true, // jacking a traffic car is theft too
      traffic: true,
      axis,
      dir,
      road,
      lane: rightLane(axis, dir),
      cruise: 8 + Math.random() * 3, // 8-11 m/s
      targetSpeed: 0,
      stopTimer: 0,
      lastCrossKey: null,
      turnCooldown: 0,
      overtaking: false,
    };
  }

  for (let i = 0; i < COUNT; i++) {
    cars.push(spawnCar(TRAFFIC_DEFS[i % TRAFFIC_DEFS.length]));
  }

  function respawn(car) {
    // New random road, direction and edge position; the mesh is reused.
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const along = -dir * (EDGE - 4);
    const x = axis === 'z' ? road + rightLane(axis, dir) : along;
    const z = axis === 'z' ? along : road + rightLane(axis, dir);
    car.pos.set(x, 0, z);
    car.heading = axisHeading(axis, dir);
    car.axis = axis;
    car.dir = dir;
    car.road = road;
    car.lane = rightLane(axis, dir);
    car.cruise = 8 + Math.random() * 3;
    car.speed = 0;
    car.targetSpeed = 0;
    car.stopTimer = 0;
    car.lastCrossKey = null;
    car.turnCooldown = 0;
    car.overtaking = false;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
  }

  // Nearest stopped traffic car to a point (for hijacking).
  function nearestStopped(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.speed > 0.5) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function hijack(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    return car;
  }

  function update(dt, driven, policeCars, playerPos) {
    // Obstacles every traffic car must respect: other traffic, parked
    // cars, police cars, the driven car, and the player on foot.
    const obstacles = [];
    for (const c of cars) obstacles.push({ pos: c.pos, speed: c.speed, self: c });
    for (const c of parkedCars) {
      if (c.driven) continue;
      obstacles.push({ pos: c.pos, speed: 0, self: c });
    }
    for (const c of policeCars) obstacles.push({ pos: c.pos, speed: c.speed, self: c });
    if (driven) obstacles.push({ pos: driven.pos, speed: Math.abs(driven.speed), self: driven });
    if (playerPos) obstacles.push({ pos: playerPos, speed: 0, self: null });

    for (const car of cars) {
      const along = car.axis === 'z' ? car.pos.z : car.pos.x;
      const perp = car.axis === 'z' ? car.pos.x : car.pos.z;

      // --- intersection entry: maybe stop, maybe turn -------------------
      let crossKey = null;
      for (const c of ROAD_CENTERS) {
        if (Math.abs(along - c) < 8) {
          crossKey = c;
          break;
        }
      }
      car.turnCooldown = Math.max(0, car.turnCooldown - dt);
      if (crossKey !== null && car.lastCrossKey !== crossKey && car.turnCooldown <= 0) {
        car.lastCrossKey = crossKey;
        if (Math.random() < 0.28) {
          car.stopTimer = 0.6 + Math.random() * 0.9;
        } else if (Math.random() < 0.22 && car.speed < 7) {
          // Turn onto the crossing road (a fresh direction, right lane).
          car.axis = car.axis === 'z' ? 'x' : 'z';
          car.road = crossKey;
          car.dir = Math.random() < 0.5 ? 1 : -1;
          car.lane = rightLane(car.axis, car.dir);
          car.turnCooldown = 2;
        }
      }
      if (crossKey === null) car.lastCrossKey = null;

      // --- target speed: stop timer, then obstacles ahead ---------------
      let target = car.cruise;
      if (car.stopTimer > 0) {
        car.stopTimer -= dt;
        target = 0;
      } else {
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const rx = -Math.cos(car.heading);
        const rz = Math.sin(car.heading);
        for (const o of obstacles) {
          if (o.self === car) continue;
          const dx = o.pos.x - car.pos.x;
          const dz = o.pos.z - car.pos.z;
          const fwd = dx * fx + dz * fz;
          const lat = dx * rx + dz * rz;
          if (fwd > 0 && fwd < 15 && Math.abs(lat) < 3.4) {
            if (o.speed < 0.5 && fwd < 13 && !car.overtaking) {
              // Stopped car ahead: swing to the other lane and pass it.
              car.lane = -car.lane;
              car.overtaking = true;
            }
            if (fwd < 11) target = Math.min(target, o.speed);
            if (fwd < 7) target = 0;
          }
        }
        if (car.overtaking) {
          // Once the obstacle is behind us, drift back to the right lane.
          let cleared = true;
          for (const o of obstacles) {
            if (o.self === car) continue;
            const dx = o.pos.x - car.pos.x;
            const dz = o.pos.z - car.pos.z;
            const fwd = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
            const lat = dx * -Math.cos(car.heading) + dz * Math.sin(car.heading);
            if (o.speed < 0.5 && fwd > -5 && fwd < 15 && Math.abs(lat) < 3.4) cleared = false;
          }
          if (cleared) {
            car.lane = rightLane(car.axis, car.dir);
            car.overtaking = false;
          }
        }
      }

      // --- speed, steering, motion ---------------------------------------
      const rate = target < car.speed ? 14 : 6;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));
      car.speed = Math.max(0, Math.min(car.cruise, car.speed));

      const laneCenter = car.road + car.lane;
      // Recompute the perpendicular coordinate: a turn above may have
      // flipped the axis this frame.
      const perpNow = car.axis === 'z' ? car.pos.x : car.pos.z;
      const steerSign = car.dir * (car.axis === 'z' ? 1 : -1);
      const desired = axisHeading(car.axis, car.dir)
        + steerSign * (laneCenter - perpNow) * 0.06;
      car.heading = angleLerp(car.heading, desired, dt * 4);

      const prevX = car.pos.x;
      const prevZ = car.pos.z;
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, car.pos.x));
      car.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, car.pos.z));

      // --- edge respawn ----------------------------------------------------
      const alongNow = car.axis === 'z' ? car.pos.z : car.pos.x;
      if (Math.abs(alongNow) > EDGE) respawn(car);

      // --- mesh -------------------------------------------------------------
      const dx = car.pos.x - prevX;
      const dz = car.pos.z - prevZ;
      const prevHeading = car.heading;
      if (Math.hypot(dx, dz) > 1e-5) {
        car.heading = Math.atan2(dx, dz);
      }
      car.group.position.set(car.pos.x, 0, car.pos.z);
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.38;
      for (const w of car.wheels) w.rotation.x += spin;
      let hDelta = car.heading - prevHeading;
      while (hDelta > Math.PI) hDelta -= Math.PI * 2;
      while (hDelta < -Math.PI) hDelta += Math.PI * 2;
      car.steer = Math.max(-0.4, Math.min(0.4, (hDelta / Math.max(dt, 1e-3)) * 0.12));
      for (const p of car.steerWheels) p.rotation.y = car.steer;
    }
  }

  return { cars, update, nearestStopped, hijack };
}
