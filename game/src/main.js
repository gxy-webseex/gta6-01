// Solmar Shores — Day 1 entry point: an original sunny seaside city you can
// walk and drive through. Renderer, third-person chase camera, enter/exit
// cars, HUD wiring and the render loop. No network requests: three.js is
// vendored under game/vendor and every texture is drawn at run time.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createCars } from './car.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createWanted } from './wanted.js';
import { createMissions } from './missions.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame, resetSave } from './save.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';

const LOWFX = new URLSearchParams(location.search).has('lowfx');
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWFX });
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = LOWFX ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const { colliders, carSpawns, bounds, update: updateCity } = buildCity(scene);
const player = createPlayer(scene);
const { cars, nearestParked, updateDriven } = createCars(scene, carSpawns);
const traffic = createTraffic(scene, colliders, bounds, cars);
const peds = createPedestrians(scene, colliders, bounds);
const police = createPolice(scene, colliders, bounds);
const input = createInput(canvas);
const hud = createHud();
const audio = createAudio();
const wanted = createWanted(hud);

// Day 3: saved progress, missions for Mara Voss, and the minimap.
const saveData = loadSave();
const minimap = createMinimap(document.getElementById('minimap'));
const missions = createMissions(scene, hud, wanted, {
  completed: saveData.completed,
  onReward: (amount) => {
    cash += amount;
    hud.setCash(cash);
    audio.chime();
    persist();
  },
  onComplete: () => persist(),
});
function persist() {
  saveGame({ cash, completed: missions.completedList(), bestWanted });
}
if (saveData.completed.length > 0 || saveData.cash > 0) {
  hud.setProgress(
    `Welcome back — ${saveData.completed.length}/4 jobs done · best heat ${'★'.repeat(saveData.bestWanted)}${'☆'.repeat(5 - saveData.bestWanted)}`,
  );
  hud.showNewGame(true);
}
hud.onNewGame = () => {
  resetSave();
  location.reload();
};
window.addEventListener('beforeunload', persist);

let driving = null; // the car currently driven, or null
let cash = saveData.cash;
let bestWanted = saveData.bestWanted;
let frames = 0;
let thudCooldown = 0; // seconds between collision thuds

hud.setCash(cash);
hud.setWanted(0);
hud.setSpeed(0, 'KM/H · ON FOOT');
hud.onStart = () => {
  input.requestLock();
  audio.ensure();
};
canvas.addEventListener('click', () => {
  if (hud.started) {
    input.requestLock();
    audio.ensure();
  }
});

// Sound toggle: key 0 or the HUD button (both created in this session).
const muteBtn = document.getElementById('mute-btn');
function toggleMute() {
  audio.ensure();
  audio.setMuted(!audio.muted);
  muteBtn.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  hud.announce(audio.muted ? 'Sound off' : 'Sound on');
}
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Segment (x0,z0)->(x1,z1) vs an AABB: the t in [0,1] where the segment
// first enters the box, or null. Used to keep the chase camera out of
// buildings: the camera never passes through a wall.
function segmentAABBEnter(x0, z0, x1, z1, c) {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (const [p0, d, lo, hi] of [
    [x0, dx, c.minX, c.maxX],
    [z0, dz, c.minZ, c.maxZ],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p0 < lo || p0 > hi) return null;
    } else {
      let t1 = (lo - p0) / d;
      let t2 = (hi - p0) / d;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Smooth camera follow: position the camera behind the target at the
// mouse-look yaw/pitch, looking slightly ahead of the target. The ray
// from the target to the camera is shortened when a building stands in
// the way, so the camera slides in instead of clipping through a wall.
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function chaseCamera(target, dist, height, dt, snap) {
  const yaw = input.yaw;
  const pitch = input.pitch;
  const cp = Math.cos(pitch);
  const offX = Math.sin(yaw) * cp * dist;
  const offY = height - Math.sin(pitch) * dist;
  const offZ = Math.cos(yaw) * cp * dist;
  let f = 1; // fraction of the boom length the camera may use
  const M = 0.6; // keep the camera this far out of the walls
  for (const c of colliders) {
    const t = segmentAABBEnter(target.x, target.z, target.x + offX, target.z + offZ, {
      minX: c.minX - M,
      maxX: c.maxX + M,
      minZ: c.minZ - M,
      maxZ: c.maxZ + M,
    });
    if (t !== null && t < f) f = Math.max(0.12, t - 0.03);
  }
  camPos.set(
    target.x + offX * f,
    Math.max(0.9, target.y + offY * f),
    target.z + offZ * f,
  );
  camTarget.set(
    target.x - Math.sin(yaw) * 2.5,
    target.y + 1.7,
    target.z - Math.cos(yaw) * 2.5,
  );
  if (snap) {
    camera.position.copy(camPos);
  } else {
    camera.position.lerp(camPos, Math.min(1, dt * 7));
  }
  camera.lookAt(camTarget);
}

const clock = new THREE.Clock();
let orbitAngle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  input.update(dt);
  thudCooldown = Math.max(0, thudCooldown - dt);

  // Day 4: 0 toggles the sound.
  if (input.pressed('Digit0')) toggleMute();

  if (!hud.started) {
    // Attract mode: slow orbit over the plaza until the player clicks play.
    orbitAngle += dt * 0.06;
    camera.position.set(Math.sin(orbitAngle) * 70, 30, Math.cos(orbitAngle) * 70);
    camera.lookAt(0, 4, 0);
  } else if (driving) {
    const hit = updateDriven(driving, dt, input, colliders, bounds, [...cars, ...traffic.cars]);
    if (hit > 0.15 && thudCooldown <= 0) {
      audio.thud(hit);
      thudCooldown = 0.35;
    }
    // Ramming a police car at speed raises the heat (once per hit, with a
    // cooldown in the wanted module). Only counts when driving INTO it.
    for (const cop of police.cars) {
      const dx = cop.pos.x - driving.pos.x;
      const dz = cop.pos.z - driving.pos.z;
      if (Math.hypot(dx, dz) < 4.6 && Math.abs(driving.speed) > 8) {
        const fx = Math.sin(driving.heading);
        const fz = Math.cos(driving.heading);
        if (dx * fx + dz * fz > 0) {
          wanted.onRam();
          if (thudCooldown <= 0) {
            audio.thud(0.7);
            thudCooldown = 0.35;
          }
          police.knock(cop, driving.pos);
          driving.speed *= 0.7;
        }
      }
    }
    // Swing the camera behind the car, mouse still lets you look around.
    const targetYaw = driving.heading + Math.PI;
    let diff = targetYaw - input.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.yaw += diff * Math.min(1, dt * 2.2);
    chaseCamera(driving.pos, 10.5, 4.2, dt, false);
    hud.setSpeed(Math.abs(driving.speed) * 3.6, `KM/H · ${driving.name.toUpperCase()}`);
    hud.setPrompt('Press E to step out');
    if (input.pressed('KeyE')) {
      const h = driving.heading;
      driving.driven = false;
      // A jacked traffic car becomes a parked car when you step out.
      if (driving.traffic) {
        driving.traffic = false;
        driving.owned = true;
        cars.push(driving);
      }
      // Step out on the driver's side of the car.
      player.state.pos.set(
        driving.pos.x + Math.cos(h) * 2.6,
        0,
        driving.pos.z - Math.sin(h) * 2.6,
      );
      player.state.group.visible = true;
      player.state.group.position.copy(player.state.pos);
      hud.announce('Stepped out of the car');
      driving = null;
      hud.setSpeed(0, 'KM/H · ON FOOT');
      hud.setPrompt('');
    }
  } else {
    player.update(dt, input, colliders, bounds);
    chaseCamera(player.state.pos, 6.5, 2.6, dt, frames < 3);
    hud.setSpeed(player.state.speed * 3.6, 'KM/H · ON FOOT');
    // A police car that gets close on foot makes the player.
    if (police.nearest(player.state.pos, 6)) wanted.onSpotted();
    // A job beacon takes priority over the cars parked nearby.
    const job = missions.nearStart(player.state.pos);
    if (job) {
      hud.setPrompt(`Press E to start: ${job.name} ($${job.reward})`);
      if (input.pressed('KeyE')) {
        missions.start();
        audio.click();
        hud.setPrompt('');
      }
    } else {
      const near = nearestParked(player.state.pos, 4.5);
      if (near) {
        hud.setPrompt(`Press E to drive the ${near.name}`);
        if (input.pressed('KeyE')) {
          driving = near;
          near.driven = true;
          if (near.owned) wanted.onTheft(); // the parked cars all have owners
          player.state.group.visible = false;
          hud.announce(`Driving the ${near.name}`);
          hud.setPrompt('Press E to step out');
        }
      } else {
        // No parked car nearby: a stopped traffic car can be jacked.
        const jack = traffic.nearestStopped(player.state.pos, 5);
        if (jack) {
          hud.setPrompt(`Press E to jack the ${jack.name}`);
          if (input.pressed('KeyE')) {
            traffic.hijack(jack);
            driving = jack;
            jack.driven = true;
            wanted.onTheft();
            player.state.group.visible = false;
            hud.announce(`Jacked the ${jack.name}!`);
            hud.setPrompt('Press E to step out');
          }
        } else {
          hud.setPrompt('');
        }
      }
    }
  }

  // M abandons the running job (on foot or driving).
  if (input.pressed('KeyM')) missions.abandon();

  // Day 2 systems: traffic, pedestrians, police pursuit, wanted decay.
  const targetPos = driving ? driving.pos : player.state.pos;
  traffic.update(dt, driving, police.cars, driving ? null : player.state.pos);
  peds.update(dt, driving, traffic.cars, police.cars);
  police.update(dt, targetPos, !!driving, wanted.level, driving, traffic.cars);
  wanted.update(dt, police.nearestDist(targetPos));

  // Day 4: fountain water animation, engine hum and police siren.
  updateCity(dt);
  audio.setEngine(driving ? Math.min(1, Math.abs(driving.speed) / 30) : 0, !!driving);
  audio.setSiren(wanted.level >= 1 && police.cars.length > 0, dt);

  // Day 3: best-heat tracking, missions, minimap.
  bestWanted = Math.max(bestWanted, wanted.level);
  missions.update(dt, {
    playerPos: player.state.pos,
    driving,
    wantedLevel: wanted.level,
    started: hud.started,
  });
  minimap.update(dt, {
    player: player.state.pos,
    car: driving ? driving.pos : null,
    police: police.cars,
    traffic: traffic.cars,
    waypoint: missions.currentTarget(),
    start: missions.nextStart(),
  });

  renderer.render(scene, camera);
  frames++;
  if (frames === 5) window.SOLMAR_READY = true;
}

// Debug/verification handle (harmless in play; used by the Day 1 check).
window.SOLMAR = {
  get mode() { return driving ? 'driving' : 'onfoot'; },
  get started() { return hud.started; },
  get playerPos() { return { x: player.state.pos.x, y: player.state.pos.y, z: player.state.pos.z }; },
  get playerSpeed() { return player.state.speed; },
  get carSpeed() { return driving ? driving.speed : 0; },
  get carPos() { return driving ? { x: driving.pos.x, z: driving.pos.z } : null; },
  get carName() { return driving ? driving.name : null; },
  get frames() { return frames; },
  // Day 2 verification handles.
  get wanted() { return wanted.level; },
  get cash() { return cash; },
  get bestWanted() { return bestWanted; },
  get missions() { return missions.debugState(); },
  get missionTarget() { return missions.currentTarget(); },
  get objective() { return document.getElementById('objective').textContent; },
  get pedsDown() { return peds.list.filter((p) => p.downTimer > 0).length; },
  placePedAhead(dist) {
    const ped = peds.list[0];
    const from = driving ? driving.pos : player.state.pos;
    const h = driving ? driving.heading : player.state.heading;
    ped.pos.set(from.x + Math.sin(h) * dist, 0, from.z + Math.cos(h) * dist);
    ped.group.position.copy(ped.pos);
    ped.downTimer = 0;
    ped.fleeTimer = 0;
    return true;
  },
  warpToMissionTarget() {
    const t = missions.currentTarget();
    if (!t) return false;
    if (driving) {
      driving.pos.set(t.x, 0, t.z);
      driving.group.position.copy(driving.pos);
    } else {
      player.state.pos.set(t.x, 0, t.z);
      player.state.group.position.copy(player.state.pos);
    }
    return true;
  },
  // Day 4 staging helpers: place the driven car and aim the camera.
  warpCarTo(x, z, heading) {
    if (!driving) return false;
    driving.pos.set(x, 0, z);
    driving.heading = heading;
    driving.speed = 0;
    driving.group.position.copy(driving.pos);
    driving.group.rotation.y = heading;
    return true;
  },
  setYaw(v) {
    input.yaw = v;
    return true;
  },
  get cameraPos() {
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  },
  get colliders() {
    return colliders;
  },
  get audioReady() {
    return audio.ready;
  },
  get audioMuted() {
    return audio.muted;
  },
  // Day 4 staging helpers: put traffic and pedestrians where a shot
  // needs them (they keep driving/walking from there, as in play).
  placeTrafficOn(road, along, axis, dir) {
    const car = traffic.cars.find((c) => !c.driven);
    if (!car) return false;
    const lane = axis === 'z' ? -3 * dir : 3 * dir;
    car.pos.set(axis === 'z' ? road + lane : along, 0, axis === 'z' ? along : road + lane);
    car.axis = axis;
    car.dir = dir;
    car.road = road;
    car.lane = lane;
    car.heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = car.cruise || 9;
    car.stopTimer = 0;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    return true;
  },
  placePedsNear(x, z, n = 3) {
    for (let i = 0; i < Math.min(n, peds.list.length); i++) {
      const p = peds.list[i];
      p.pos.set(x + (i - 1) * 3, 0, z + 2);
      p.group.position.copy(p.pos);
      p.downTimer = 0;
      p.fleeTimer = 0;
    }
    return true;
  },
  startMission(id) { return missions.debugStart(id); },
  teleportToBeacon() {
    const s = missions.nextStart();
    if (!s) return false;
    player.state.pos.set(s.x, 0, s.z);
    player.state.group.position.copy(player.state.pos);
    return true;
  },
  get police() {
    return police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z, speed: c.speed }));
  },
  get traffic() {
    return traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z, speed: c.speed, name: c.name }));
  },
  get peds() {
    return peds.list.map((p) => ({ x: p.pos.x, z: p.pos.z }));
  },
  setEscapeSeconds(s) {
    wanted.debugSetEscapeInterval(s);
  },
  placePoliceAhead(dist) {
    const from = driving ? driving.pos : player.state.pos;
    const h = driving ? driving.heading : player.state.heading;
    return police.debugPlaceAhead(from, h, dist);
  },
  teleportToCar(i) {
    const car = cars[i % cars.length];
    player.state.pos.set(car.pos.x + 2, 0, car.pos.z + 2);
    player.state.group.position.copy(player.state.pos);
    return car.name;
  },
  teleport(x, z) {
    player.state.pos.set(x, 0, z);
    player.state.group.position.copy(player.state.pos);
  },
  start() {
    document.getElementById('play-btn').click();
  },
};

animate();
