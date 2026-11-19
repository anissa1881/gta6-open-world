// The screenshot scenes behind ?shot=chase|downtown|drive|mission. Each one stages
// a fixed scene from a fresh seeded state — a real frame of the real game, with the
// HUD, the minimap, the wanted stars and the mission objective visible — and the
// same seed always gives the same frame. main.js paints the staged state twice
// and sets window.__shotReady for the screenshot.
import { MISSIONS, PALETTE, PLACES, VIEW, WORLD } from './config.js';
import { createCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { clamp } from './random.js';
import { createHelicopter } from './helicopter.js';
import { RACE_CHECKPOINTS } from './missions.js';

function setMission(state, index, stage, timer) {
  const def = MISSIONS[index];
  const place = PLACES[def.place];
  state.mission = {
    index, id: def.id, title: def.title, objective: def.objective,
    briefing: def.briefing, reward: def.reward,
    stage: stage || (def.id === 'courier' ? 'pickup' : 'active'),
    target: { x: place.x, y: place.y, label: place.name },
    timer: timer || 0, timerMax: timer || 0,
    text: def.briefing, enemiesLeft: 0, collected: 0,
    survive: !!def.survive, checkpoints: null, heistCar: null,
  };
}

function placePlayerCar(state, x, y, angle, speed) {
  const car = createCar('player', x, y, angle, '#e84c3d', { driver: 'player' });
  car.speed = speed;
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

function addTrafficCar(state, x, y, angle, color) {
  const car = createCar('traffic', x, y, angle, color, { driver: 'ai', ai: { axis: 'h', road: y, dir: 1, speed: 150 } });
  car.speed = 150;
  state.cars.push(car);
  return car;
}

function addPoliceCar(state, x, y, angle, speed) {
  const car = createCar('police', x, y, angle, PALETTE.policeCar, { driver: 'ai' });
  car.speed = speed;
  state.cars.push(car);
  return car;
}

function addPeds(state, spots) {
  for (const [x, y] of spots) {
    const ped = makePed(state, x, y, false);
    ped.state = 'walk';
    state.peds.push(ped);
  }
}

function frameCamera(state) {
  const p = state.player;
  state.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  state.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
}

/**
 * Set `state` to the named scene (chase, downtown, drive or mission; any other
 * name is chase) and return the screen to draw over it.
 */
export function stageShot(name, state) {
  state.cars = [];
  state.peds = [];
  state.police = [];
  state.helis = [];
  state.skids = [];
  state.shake = null;
  state.missionComplete = null;
  state.ending = null;
  state.zoom = 1;
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.bulletRequests = [];
  state.side = null;
  state.toast = null;
  state.time = 14;
  state.clockMin = 10 * 60 + 24;
  state.health = 100;
  state.mapBig = false;
  state.busted = false;
  state.wasted = false;

  if (name === 'downtown') {
    // On foot downtown: pedestrians, traffic, the Strip all around.
    state.cash = 150;
    state.wanted = 0;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = 1600;
    state.player.y = 1060;
    state.player.angle = -Math.PI / 2;
    setMission(state, 0, 'active', 0);
    addPeds(state, [
      [1520, 940], [1680, 940], [1450, 1120], [1750, 1120],
      [1380, 980], [1820, 980], [1560, 1180], [1700, 1180],
    ]);
    addTrafficCar(state, 1400, 1000, 0, '#4a90d9');
    addTrafficCar(state, 1850, 1000, Math.PI, '#e8a13c');
    addTrafficCar(state, 1400, 800, Math.PI / 2, '#7ab648');
    addTrafficCar(state, 1500, 1400, 0, '#d94a6a');
    const parked = createCar('parked', 1420, 1060, 0, '#e8e8e8', { driver: 'none' });
    state.cars.push(parked);
    frameCamera(state);
    return { screen: 'play' };
  }

  if (name === 'drive') {
    // Strip Sprint: racing the Strip, checkpoint 2 of 5, rivals ahead.
    state.cash = 1200;
    state.wanted = 2;
    placePlayerCar(state, 600, 1400, 0, 460);
    setMission(state, 5, 'race', 62);
    state.mission.checkpoints = RACE_CHECKPOINTS.map((c) => ({ ...c }));
    state.mission.collected = 1;
    state.mission.target = { x: 700, y: 1400, label: 'Checkpoint 2/5' };
    state.mission.timerMax = 100;
    for (const [x, color] of [[820, '#4a90d9'], [1010, '#d94a6a'], [1210, '#7ab648']]) {
      const rival = createCar('traffic', x, 1400 + (x % 2 === 0 ? -20 : 20), 0, color,
        { driver: 'ai', ai: { axis: 'h', road: 1400, dir: 1, speed: 300 } });
      rival.speed = 300;
      rival.isRival = true;
      state.cars.push(rival);
    }
    addTrafficCar(state, 1450, 1000, 0, '#e8a13c');
    addTrafficCar(state, 400, 1800, Math.PI, '#5a5a5a');
    addPeds(state, [[750, 1330], [900, 1470], [500, 1330]]);
    state.toast = { text: 'Mara Voss: "Checkpoint 2/5 — floor it!"', timer: 4 };
    frameCamera(state);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // The Kingpin finale: five stars, two helis, and the run to the Old Foundry.
    state.cash = 2400;
    state.wanted = 5;
    placePlayerCar(state, 2200, 2000, 0, 380);
    setMission(state, 7, 'deliver', 45);
    state.mission.objective = 'Five stars on you — deliver the package to the Old Foundry';
    state.mission.target = { x: PLACES.foundry.x, y: PLACES.foundry.y, label: PLACES.foundry.name };
    state.mission.timerMax = 120;
    const heli1 = createHelicopter(2200, 1820, 0);
    heli1.angle = Math.atan2(2000 - 1820, 2200 - 2200);
    const heli2 = createHelicopter(2450, 2180, Math.PI);
    heli2.angle = Math.atan2(2000 - 2180, 2200 - 2450);
    state.helis.push(heli1, heli2);
    addPoliceCar(state, 2020, 2000, 0, 430);
    addPoliceCar(state, 2080, 2075, 0, 410);
    addTrafficCar(state, 1500, 2000, 0, '#4a90d9');
    addPeds(state, [[2400, 1940], [2550, 2060], [2300, 2080]]);
    state.toast = { text: 'Mara Voss: "Last run, Kingpin. Bring it home!"', timer: 4 };
    frameCamera(state);
    return { screen: 'play' };
  }

  // 'chase' (the cover): a 4-star police chase on the Strip, heli overhead.
  // A police car rams the player's car from behind: bumpers touching,
  // sparks and smoke at the contact point, flash on the player's car.
  state.cash = 480;
  state.wanted = 4;
  placePlayerCar(state, 1400, 1000, 0, 380);
  setMission(state, 6, 'survive', 88);
  state.mission.objective = 'Survive 90 seconds with the police helicopter on you';
  const heli = createHelicopter(1520, 880, 0);
  heli.angle = Math.atan2(1000 - 880, 1400 - 1520);
  state.helis.push(heli);
  const rammer = addPoliceCar(state, 1336, 1000, 0, 430);
  addPoliceCar(state, 1300, 1075, 0, 410);
  state.police.push({ x: 1150, y: 940, angle: 0, speed: 250, hp: 40, holdTimer: 0 });
  const cx = state.player.car.x - 32; // the player's rear bumper
  const cy = state.player.car.y;
  state.player.car.flash = 0.3;
  rammer.flash = 0.15;
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    state.particles.push({
      x: cx, y: cy, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160,
      life: 0.3, maxLife: 0.3, size: 3, color: '#ffd23f', kind: 'spark',
    });
  }
  for (const [ox, oy] of [[-8, -6], [6, 4], [0, 8]]) {
    state.particles.push({
      x: cx + ox, y: cy + oy, vx: 0, vy: 0,
      life: 0.45, maxLife: 0.45, size: 8, color: '#fff3a0', kind: 'star',
    });
  }
  for (let i = 0; i < 5; i += 1) {
    state.particles.push({
      x: cx - 10 + i * 6, y: cy - 8 + (i % 2) * 12,
      vx: 0, vy: -20, life: 0.9, maxLife: 0.9, size: 9,
      color: 'rgba(120,120,120,0.55)', kind: 'smoke',
    });
  }
  addTrafficCar(state, 1620, 1000, 0, '#4a90d9');
  addTrafficCar(state, 1560, 1000, 0, '#e8a13c');
  addTrafficCar(state, 1180, 1400, Math.PI, '#7ab648');
  addPeds(state, [[1500, 940], [1350, 1120], [1700, 1120], [1250, 940]]);
  state.toast = { text: 'Mara Voss: "Eyes in the sky — four stars and counting!"', timer: 4 };
  frameCamera(state);
  return { screen: 'play' };
}
