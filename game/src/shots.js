// The screenshot scenes behind ?shot=chase|downtown|drive|mission. Each one stages
// a fixed scene from a fresh seeded state — a real frame of the real game, with the
// HUD, the minimap, the wanted stars and the mission objective visible — and the
// same seed always gives the same frame. main.js paints the staged state twice
// and sets window.__shotReady for the screenshot.
import { MISSIONS, PALETTE, PLACES, VIEW, WORLD } from './config.js';
import { createCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { clamp } from './random.js';

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
    // Driving fast down the Strip, one star, courier job on the HUD.
    state.cash = 520;
    state.wanted = 1;
    placePlayerCar(state, 1000, 1400, 0, 460);
    setMission(state, 1, 'deliver', 62);
    state.mission.target = { x: PLACES.dockside.x, y: PLACES.dockside.y, label: PLACES.dockside.name };
    state.mission.objective = 'Deliver the package to Dockside before the timer ends';
    addTrafficCar(state, 1250, 1400, 0, '#4a90d9');
    addTrafficCar(state, 1450, 1400, 0, '#e8a13c');
    addTrafficCar(state, 800, 1400, Math.PI, '#7ab648');
    addPeds(state, [[1150, 1330], [1300, 1470], [900, 1330]]);
    frameCamera(state);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Courier delivery at Dockside: the package, the marker, the timer.
    state.cash = 350;
    state.wanted = 0;
    placePlayerCar(state, 620, 2000, Math.PI, 120);
    setMission(state, 1, 'deliver', 45);
    state.mission.target = { x: PLACES.dockside.x, y: PLACES.dockside.y, label: PLACES.dockside.name };
    state.mission.objective = 'Deliver the package to Dockside before the timer ends';
    state.pickups.push({ x: 460, y: 2000, kind: 'package', taken: false });
    addPeds(state, [[520, 1940], [700, 2060], [420, 2080]]);
    addTrafficCar(state, 900, 2200, Math.PI, '#5a5a5a');
    const parked = createCar('parked', 830, 1800, 0, '#4a90d9', { driver: 'none' });
    state.cars.push(parked);
    frameCamera(state);
    return { screen: 'play' };
  }

  // 'chase' (the cover): a 3-star police chase on the Strip.
  state.cash = 480;
  state.wanted = 3;
  placePlayerCar(state, 1400, 1000, 0, 380);
  setMission(state, 2, 'active', 88);
  state.mission.objective = 'Lose your 3-star wanted level';
  addPoliceCar(state, 1230, 1000, 0, 430);
  addPoliceCar(state, 1300, 1075, 0, 410);
  state.police.push({ x: 1150, y: 940, angle: 0, speed: 250, hp: 40, holdTimer: 0 });
  addTrafficCar(state, 1620, 1000, 0, '#4a90d9');
  addTrafficCar(state, 1560, 1000, 0, '#e8a13c');
  addTrafficCar(state, 1180, 1400, Math.PI, '#7ab648');
  addPeds(state, [[1500, 940], [1350, 1120], [1700, 1120], [1250, 940]]);
  state.toast = { text: 'Mara Voss: "Lose them — three stars and counting!"', timer: 4 };
  frameCamera(state);
  return { screen: 'play' };
}
