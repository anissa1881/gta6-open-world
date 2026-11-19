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
import { RACE_CHECKPOINTS, SIDE_SPOTS } from './missions.js';

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

function addTrafficCar(state, x, y, angle, color, body) {
  const car = createCar('traffic', x, y, angle, color, { driver: 'ai', body: body || 'sedan', ai: { axis: 'h', road: y, dir: 1, speed: 150 } });
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

// A group of pedestrians crossing the road together, in vivid shirt colours
// so they read as people at a glance: staged in the middle of the frame.
const CROSS_COLORS = ['#f2c230', '#2f6fd0', '#ff7a2a', '#58c96b', '#ff4fd8', '#9b59b6'];

function addCrossingGroup(state, spots) {
  spots.forEach(([x, y], i) => {
    const ped = makePed(state, x, y, false);
    ped.state = 'walk';
    ped.mode = 'cross';
    ped.crossAxis = 'h';
    ped.crossDir = 1;
    ped.crossLeft = 120;
    ped.color = CROSS_COLORS[i % CROSS_COLORS.length];
    state.peds.push(ped);
  });
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
  state.weather = { kind: 'clear', intensity: 0, timer: 60 };
  state.lightning = 0;
  state.taxiPassenger = { x: SIDE_SPOTS[0].x, y: SIDE_SPOTS[0].y };
  state.nearFood = false;
  state.health = 100;
  state.mapBig = false;
  state.busted = false;
  state.wasted = false;

  if (name === 'downtown') {
    // On foot downtown, early morning: pedestrians, traffic, the Strip all
    // around. Long building shadows, rooftop lift/stair boxes, a pedestrian
    // crossing at the lights, and the taxi passenger waiting at the stand.
    state.clockMin = 8 * 60;
    state.cash = 150;
    state.wanted = 0;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = 1600;
    state.player.y = 1120;
    state.player.angle = -Math.PI / 2;
    setMission(state, 0, 'active', 0);
    addPeds(state, [
      [1520, 940], [1680, 940], [1450, 1120], [1750, 1120],
      [1380, 980], [1820, 980], [1560, 1180], [1700, 1180],
    ]);
    // One pedestrian mid-crossing at the crosswalk by the lights, plus a
    // whole group crossing the Strip intersection in the middle of the frame.
    const crosser = state.peds[0];
    crosser.mode = 'cross';
    crosser.crossAxis = 'h';
    crosser.crossDir = 1;
    crosser.crossLeft = 90;
    crosser.x = 1420;
    crosser.y = 1000;
    addCrossingGroup(state, [
      [1540, 1000], [1570, 1012], [1600, 995], [1630, 1008], [1660, 1000],
    ]);
    addTrafficCar(state, 1400, 1000, 0, '#4a90d9');
    addTrafficCar(state, 1850, 1000, Math.PI, '#e8a13c');
    addTrafficCar(state, 1400, 800, Math.PI / 2, '#7ab648');
    addTrafficCar(state, 1500, 1400, 0, '#d94a6a');
    addTrafficCar(state, 1700, 1400, 0, '#2f8f7a', 'bus');
    const parked = createCar('parked', 1420, 1060, 0, '#e8e8e8', { driver: 'none' });
    state.cars.push(parked);
    frameCamera(state);
    return { screen: 'play' };
  }

  if (name === 'drive') {
    // Strip Sprint at night: racing the Strip under the lamps and neon,
    // headlights on, the moon in the corner of the screen.
    state.clockMin = 22 * 60 + 10;
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
    addTrafficCar(state, 900, 1000, 0, '#f2c230', 'taxi');
    addPeds(state, [[750, 1330], [900, 1470], [500, 1330], [700, 1330], [850, 1470], [1000, 1330], [1150, 1470]]);
    state.toast = { text: 'Mara Voss: "Checkpoint 2/5 — floor it!"', timer: 4 };
    frameCamera(state);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // The Kingpin finale at night: five stars, two helis, lamps and
    // headlights, and the run to the Old Foundry.
    state.clockMin = 21 * 60 + 40;
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
    addTrafficCar(state, 1750, 2000, 0, '#8a7a5a', 'truck');
    addPeds(state, [[2400, 1940], [2550, 2060], [2300, 2080], [2350, 1940], [2500, 1940], [2450, 2080], [2250, 1940]]);
    state.toast = { text: 'Mara Voss: "Last run, Kingpin. Bring it home!"', timer: 4 };
    frameCamera(state);
    return { screen: 'play' };
  }

  // 'chase' (the cover): a 4-star police chase on the Strip at dusk, in the
  // rain — long shadows, wet roads, headlights, the heli overhead, and a
  // police car ramming the player's car from behind: bumpers touching,
  // sparks and smoke at the contact point, flash on the player's car.
  state.clockMin = 17 * 60 + 45;
  state.weather = { kind: 'rain', intensity: 0.8, timer: 60 };
  state.cash = 480;
  state.wanted = 4;
  placePlayerCar(state, 1400, 1000, 0, 380);
  // The ram just landed: the player's car keeps its dent and cracked
  // windshield, so the crash reads in the still frame.
  state.player.car.dented = true;
  state.player.car.cracked = true;
  state.player.car.health = 45;
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
  addTrafficCar(state, 1750, 1000, 0, '#2f8f7a', 'bus');
  addTrafficCar(state, 1050, 1400, 0, '#f2c230', 'taxi');
  addPeds(state, [[1500, 940], [1350, 1120], [1700, 1120], [1250, 940], [1450, 1120], [1550, 1120]]);
  // A group crossing the Strip just west of the chase, in the middle of the frame.
  addCrossingGroup(state, [
    [1080, 1000], [1110, 1012], [1140, 995], [1170, 1008], [1200, 1000],
  ]);
  state.toast = { text: 'Mara Voss: "Eyes in the sky — four stars and counting!"', timer: 4 };
  frameCamera(state);
  return { screen: 'play' };
}
