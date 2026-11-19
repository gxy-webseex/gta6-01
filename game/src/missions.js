// Missions for Solmar Shores: four short jobs for Mara Voss, the fixer
// who runs the marina. Jobs unlock one at a time; each has a start beacon
// (gold) in the world, a waypoint beacon (cyan) while it runs, a briefing
// and an outro from Mara, a timer where the job is a race, and a cash
// reward paid through the HUD. All names, places and story are original.
//
// Types: 'route' (reach waypoints in order), 'taxi' (pick up a fare in a
// car, then drop them off), 'getaway' (steal a car, then lose the cops).
import * as THREE from 'three';

const ARRIVE_DIST = 7; // metres from a waypoint to count as reached
const START_DIST = 4; // metres from the start beacon to offer the job

const DEFS = [
  {
    id: 'm1',
    name: 'First Errand',
    reward: 150,
    timeLimit: 150,
    type: 'route',
    start: { x: 14, z: -14 },
    brief:
      "Mara Voss: New in town? Prove you can follow directions. Grab the parcel at the corner of Coral Ave and 2nd, then drop it at the kiosk on Palm Row.",
    outro: 'Mara Voss: On time and in one piece. Not bad, kid. There is more where that came from.',
    waypoints: [
      { x: -24, z: 24, label: 'Pick up the parcel — Coral Ave & 2nd' },
      { x: 24, z: -24, label: 'Drop the parcel — kiosk on Palm Row' },
    ],
  },
  {
    id: 'm2',
    name: 'Sunset Fare',
    reward: 250,
    timeLimit: 180,
    type: 'taxi',
    start: { x: -150, z: 48 },
    brief:
      "Mara Voss: A regular needs a ride across town. Pick them up in a car — nobody walks in this heat — and drop them at the marina gate. Tip's in it for you.",
    outro: 'Mara Voss: Smooth ride, happy customer. The fare even left a tip.',
    waypoints: [
      { x: -72, z: 120, label: 'Pick up the fare — south end of Coral Ave' },
      { x: 96, z: -72, label: 'Drop the fare — marina gate' },
    ],
  },
  {
    id: 'm3',
    name: 'Hot Wheels',
    reward: 350,
    timeLimit: 0, // no clock: the cops set the pace
    type: 'getaway',
    start: { x: 14, z: 14 },
    brief:
      "Mara Voss: The garage on Coral Ave needs a 'donation'. Take any car you like, then lose the heat. Clean hands, fat wallet.",
    outro: 'Mara Voss: Vanished like smoke. The garage sends its thanks — and its cash.',
    waypoints: [],
  },
  {
    id: 'm4',
    name: 'Harbor Run',
    reward: 500,
    timeLimit: 200,
    type: 'route',
    start: { x: -150, z: -48 },
    brief:
      'Mara Voss: Three crates, three stops, one very impatient buyer. Drive fast, drive smart — the cops love a speeder.',
    outro: 'Mara Voss: All three crates delivered. You drive like the devil himself. Keep it up.',
    waypoints: [
      { x: 120, z: 120, label: 'Drop 1 — south docks' },
      { x: -120, z: -120, label: 'Drop 2 — north gate' },
      { x: 72, z: 120, label: 'Drop 3 — fish market' },
    ],
  },
];

function makeBeacon(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 16, 16, 1, true), mat);
  column.position.y = 8;
  group.add(column);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 5;
  group.add(diamond);
  return { group, ring, diamond, mat };
}

// The taxi fare: a plain standing figure in a gold shirt, waiting at the
// pickup point. Hidden except while the fare job is at its pickup stage.
function makeFareFigure() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), gold);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.74;
  group.add(head);
  for (const x of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), dark);
    leg.position.set(x, 0.38, 0);
    group.add(leg);
  }
  group.visible = false;
  return group;
}

export function createMissions(scene, hud, wanted, opts) {
  const completed = new Set(opts.completed || []);
  const onReward = opts.onReward || (() => {});
  const onComplete = opts.onComplete || (() => {});

  const startBeacon = makeBeacon(0xffd23e);
  const targetBeacon = makeBeacon(0x35d0ff);
  startBeacon.group.visible = false;
  targetBeacon.group.visible = false;
  scene.add(startBeacon.group);
  scene.add(targetBeacon.group);
  const fare = makeFareFigure();
  scene.add(fare);

  let active = null; // { def, stage, wp, timeLeft }
  let pulse = 0;

  function nextDef() {
    return DEFS.find((d) => !completed.has(d.id)) || null;
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  function objectiveText(driving) {
    if (!active) return '';
    const { def, stage, wp, timeLeft } = active;
    const clock = def.timeLimit > 0 ? ` — ${fmtTime(Math.max(0, timeLeft))} left` : '';
    if (def.type === 'getaway') {
      return stage === 0
        ? `${def.name}: Steal a car`
        : `${def.name}: Lose the cops — stay out of sight`;
    }
    const point = def.waypoints[wp];
    const n = def.waypoints.length;
    if (def.type === 'taxi' && wp === 0) {
      return driving
        ? `${def.name}: ${point.label} (1/${n})${clock}`
        : `${def.name}: ${point.label} (1/${n})${clock} — you need a car`;
    }
    return `${def.name}: ${point.label} (${wp + 1}/${n})${clock}`;
  }

  function complete() {
    const def = active.def;
    active = null;
    completed.add(def.id);
    targetBeacon.group.visible = false;
    fare.visible = false;
    hud.setObjective('');
    hud.announce(`${def.outro} (+$${def.reward})`);
    onReward(def.reward);
    onComplete(def.id);
  }

  function fail(reason) {
    const def = active.def;
    active = null;
    targetBeacon.group.visible = false;
    fare.visible = false;
    hud.setObjective('');
    hud.announce(`${def.name} failed — ${reason} Mara will let you try again.`);
  }

  function update(dt, ctx) {
    pulse += dt;
    const bob = 5 + Math.sin(pulse * 2) * 0.5;
    if (startBeacon.group.visible) {
      startBeacon.diamond.position.y = bob;
      startBeacon.diamond.rotation.y = pulse;
    }
    if (targetBeacon.group.visible) {
      targetBeacon.diamond.position.y = bob;
      targetBeacon.diamond.rotation.y = -pulse;
      const s = 1 + Math.sin(pulse * 4) * 0.08;
      targetBeacon.ring.scale.set(s, s, 1);
    }

    if (!active) {
      const next = nextDef();
      if (next) {
        startBeacon.group.position.set(next.start.x, 0, next.start.z);
        startBeacon.group.visible = true;
      } else {
        startBeacon.group.visible = false;
      }
      return;
    }

    // The clock only runs once the player has started playing.
    if (ctx.started && active.def.timeLimit > 0) {
      active.timeLeft -= dt;
      if (active.timeLeft <= 0) {
        fail('Out of time.');
        return;
      }
    }

    const targetPos = ctx.driving ? ctx.driving.pos : ctx.playerPos;
    const def = active.def;

    if (def.type === 'getaway') {
      if (active.stage === 0) {
        if (ctx.wantedLevel >= 1) {
          active.stage = 1;
          hud.announce('The heat is on — now lose them!');
        }
      } else if (ctx.wantedLevel === 0) {
        complete();
        return;
      }
      hud.setObjective(objectiveText());
      return;
    }

    // Route and taxi jobs: reach the waypoints in order.
    const point = def.waypoints[active.wp];    targetBeacon.group.position.set(point.x, 0, point.z);
    targetBeacon.group.visible = true;
    if (def.type === 'taxi' && active.wp === 0) {
      fare.position.set(point.x, 0, point.z);
      fare.visible = true;
    } else {
      fare.visible = false;
    }
    const d = Math.hypot(targetPos.x - point.x, targetPos.z - point.z);
    const needCar = def.type === 'taxi' && active.wp === 0;
    if (d < ARRIVE_DIST && (!needCar || ctx.driving)) {
      if (def.type === 'taxi' && active.wp === 0) {
        hud.announce('Fare picked up — drive them to the marina gate');
        fare.visible = false;
      }
      active.wp += 1;
      if (active.wp >= def.waypoints.length) {
        complete();
        return;
      }
    }
    hud.setObjective(objectiveText(ctx.driving));
  }

  // The next job's start beacon is close enough to offer it.
  function nearStart(pos) {
    if (active) return null;
    const next = nextDef();
    if (!next) return null;
    const d = Math.hypot(pos.x - next.start.x, pos.z - next.start.z);
    return d < START_DIST ? next : null;
  }

  function start() {
    const next = nextDef();
    if (!next || active) return false;
    active = { def: next, stage: 0, wp: 0, timeLeft: next.timeLimit };
    startBeacon.group.visible = false;
    hud.announce(next.brief);
    hud.setObjective(objectiveText());
    return true;
  }

  function abandon() {
    if (!active) return false;
    const name = active.def.name;
    active = null;
    targetBeacon.group.visible = false;
    fare.visible = false;
    hud.setObjective('');
    hud.announce(`${name} abandoned — the beacon is still there when you want it.`);
    return true;
  }

  return {
    update,
    nearStart,
    start,
    abandon,
    get active() {
      return active ? { id: active.def.id, stage: active.stage, wp: active.wp, timeLeft: active.timeLeft } : null;
    },
    nextDef,
    completedList() {
      return [...completed];
    },
    currentTarget() {
      if (!active || active.def.type === 'getaway') return null;
      const point = active.def.waypoints[active.wp];
      return point ? { x: point.x, z: point.z } : null;
    },
    nextStart() {
      if (active) return null;
      const next = nextDef();
      return next ? { x: next.start.x, z: next.start.z } : null;
    },
    // Verification hooks.
    debugState() {
      return {
        active: this.active,
        next: nextDef() ? nextDef().id : null,
        completed: this.completedList(),
      };
    },
    debugStart(id) {
      const def = DEFS.find((d) => d.id === id);
      if (!def || completed.has(id) || active) return false;
      active = { def, stage: 0, wp: 0, timeLeft: def.timeLimit };
      startBeacon.group.visible = false;
      hud.announce(def.brief);
      hud.setObjective(objectiveText());
      return true;
    },
  };
}
