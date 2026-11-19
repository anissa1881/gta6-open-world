// Sunport City — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between five screens: title, play, paused, busted and wasted.
//
// ?seed=N fixes the city. ?shot=chase|downtown|drive|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CAR, FOOD_TRUCK, MISSIONS, PACKAGE_BONUS, PLACES, STEP, STOREFRONTS, SUNPORT_PACKAGES, VIEW, WORLD } from './config.js';
import { createRandom, clamp, distance } from './random.js';
import { createCity, inSafehouse, randomSidewalkPoint } from './city.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_ENTER, ACTION_MAP, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createPlayer, updatePlayerOnFoot, nearestCar, enterCar, exitCar } from './player.js';
import { updatePlayerCar } from './vehicles.js';
import { createTraffic, createParkedCars, updateTraffic } from './traffic.js';
import { createPedestrians, updatePedestrians } from './pedestrians.js';
import { updateWanted, updatePolice } from './police.js';
import { updateHelicopters } from './helicopter.js';
import { SIDE_SPOTS, startMission, startSideJob, updateMissions, updateSideJobs } from './missions.js';
import { punch, shootPlayer, updateBullets } from './combat.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { drawHud } from './hud.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

/** Build a fresh world: city, player, traffic, pedestrians and Mara's first job. */
function createState(seedValue) {
  const rng = createRandom(seedValue);
  const state = {
    seed: seedValue, rng, audio: createAudio(), radio: createRadio(),
    city: null, time: 0, clockMin: 8 * 60 + 15,
    cash: 150, health: 100, wanted: 0, wantedTimer: 0, heat: 0, shootCrimeTimer: 0,
    storyDone: false, mapBig: false, toast: null, busted: false, wasted: false,
    stats: { stolen: 0, missionsDone: 0, earned: 0 },
    player: null, cars: [], peds: [], police: [], helis: [], bullets: [], bulletRequests: [],
    particles: [], skids: [], pickups: [], mission: null, side: null,
    camera: { x: 0, y: 0 }, zoom: 1, shake: null,
    missionComplete: null, ending: null,
    savedAtSafehouse: false,
    // The living city: weather that comes and goes, ten hidden Sunport
    // packages, and the passenger waiting at the taxi stand.
    weather: { kind: 'clear', intensity: 0, timer: 45 + rng() * 40 },
    lightning: 0,
    sunportPackages: [],
    taxiPassenger: { x: SIDE_SPOTS[0].x, y: SIDE_SPOTS[0].y },
    nearFood: false,
  };
  state.city = createCity(rng);
  state.player = createPlayer(300, 200);
  state.cars = [...createParkedCars(state), ...createTraffic(state)];
  state.peds = createPedestrians(state);
  for (let i = 0; i < SUNPORT_PACKAGES; i += 1) {
    const spot = randomSidewalkPoint(state.city, rng);
    state.sunportPackages.push({ x: spot.x, y: spot.y, taken: false });
  }
  startMission(state, 0);
  updateCamera(state);
  return state;
}

/**
 * The camera follows the player smoothly and zooms with speed: a little closer
 * on foot, a little wider at full speed. The zoom changes the visible window,
 * so the camera is clamped to what the zoomed view actually shows.
 */
function updateCamera(state) {
  const p = state.player;
  const speed = p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0);
  const targetZoom = p.onFoot ? 1.06 : (speed > 380 ? 0.92 : 1.0);
  state.zoom += (targetZoom - state.zoom) * 0.12;
  const visibleW = VIEW.width / state.zoom;
  const visibleH = VIEW.height / state.zoom;
  const tx = clamp(p.x - visibleW / 2, 0, WORLD.width - visibleW);
  const ty = clamp(p.y - visibleH / 2, 0, WORLD.height - visibleH);
  state.camera.x += (tx - state.camera.x) * 0.12;
  state.camera.y += (ty - state.camera.y) * 0.12;
}

function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const skid of state.skids) skid.life -= dt;
  state.skids = state.skids.filter((skid) => skid.life > 0);
}

/** The mouse aim in world coordinates, from the pointer's screen position. */
function aimAngle(state, input) {
  const p = state.player;
  const world = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  return Math.atan2(world.y - p.y, world.x - p.x);
}

/** True when a pedestrian or a car is close enough in front of the player to punch. */
function punchTargetNear(state) {
  const p = state.player;
  for (const ped of state.peds) {
    if (!ped.dead && distance(p.x, p.y, ped.x, ped.y) < 62) return true;
  }
  for (const car of state.cars) {
    if (car.health > 0 && distance(p.x, p.y, car.x, car.y) < 72) return true;
  }
  return false;
}

function tryEnter(state) {
  const p = state.player;
  if (!p.onFoot) {
    // A taxi fare starts from the car: drive up to the stand and press E.
    // (On foot, E only enters a car — the fare needs a car to drive.)
    if (!state.side) {
      for (const spot of SIDE_SPOTS) {
        if (spot.kind === 'taxi' && distance(p.x, p.y, spot.x, spot.y) < 95) {
          if (startSideJob(state, spot.kind)) return;
        }
      }
    }
    exitCar(state);
    state.audio.click();
    return;
  }
  if (!state.side) {
    for (const spot of SIDE_SPOTS) {
      if (distance(p.x, p.y, spot.x, spot.y) < 95) {
        if (startSideJob(state, spot.kind)) return;
      }
    }
  }
  // Buy a snack at a storefront: a little cash for a little health.
  for (const shop of STOREFRONTS) {
    if (distance(p.x, p.y, shop.x, shop.y) < 70) {
      if (state.cash >= shop.price) {
        state.cash -= shop.price;
        state.health = Math.min(100, state.health + shop.health);
        state.toast = { text: `${shop.name}! +${shop.health} health — $${shop.price}`, timer: 3 };
        state.audio.cash();
      } else {
        state.toast = { text: `Not enough cash for ${shop.name} ($${shop.price}).`, timer: 3 };
      }
      return;
    }
  }
  const car = nearestCar(state, CAR.enterRange);
  if (car) {
    enterCar(state, car);
    state.audio.click();
  }
}

function applySave(state, data) {
  state.cash = data.cash;
  state.health = data.health;
  state.clockMin = data.clockMin || state.clockMin;
  state.stats = data.stats || state.stats;
  state.player.x = data.playerX;
  state.player.y = data.playerY;
  if (data.storyDone) {
    state.storyDone = true;
    startMission(state, MISSIONS.length - 1);
    state.mission = {
      index: MISSIONS.length, id: 'done', title: 'Sunport Is Yours',
      objective: 'Free roam — take side jobs, explore, and keep the city yours.',
      briefing: '', reward: 0, stage: 'done', target: null, timer: 0, timerMax: 0,
      text: 'Story complete! Free roam.', enemiesLeft: 0, collected: 0,
    };
  } else if (typeof data.missionIndex === 'number' && data.missionIndex > 0) {
    startMission(state, Math.min(data.missionIndex, MISSIONS.length - 1));
  }
  updateCamera(state);
}

/** After Busted or Wasted: lose some cash, cool the heat, wake up at the safehouse. */
function respawn(state) {
  state.wanted = 0;
  state.wantedTimer = 0;
  state.police.length = 0;
  state.helis.length = 0;
  state.shake = null;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.audio.siren(false);
  state.audio.engine(0);
  state.health = 60;
  state.cash = Math.floor(state.cash * 0.8);
  if (state.player.car) {
    state.player.car.driver = 'none';
    state.player.car.kind = 'parked';
    state.player.car.speed = 0;
    state.player.car = null;
  }
  state.player.onFoot = true;
  state.player.x = 300;
  state.player.y = 200;
  state.player.ammo = 120;
  state.busted = false;
  state.wasted = false;
  updateCamera(state);
}

function runShot(name) {
  const state = createState(seed);
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.toWorld(state);
    renderer.drawWorld(state);
    renderer.toScreen();
    drawHud(renderer.ctx, state, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let state = createState(seed);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  // Debug handle for play-testing (does not affect gameplay): live state + screen.
  window.__sunport = {
    get state() { return state; },
    get screen() { return screen; },
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    state = createState(seed);
    if (fromSave) {
      const data = loadGame();
      if (data) applySave(state, data);
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    state.audio.ensure();
    state.radio.ensure();
    state.radio.start();
    announce(`Playing in Sunport City. ${state.mission ? state.mission.title : ''}.`);
  }

  // C on the title screen continues a saved game.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && hasSave()) startGame(true);
    if (event.code === 'KeyR' && (screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      respawn(state);
      screen = SCREEN_PLAY;
    }
  });

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = !state.audio.isMuted();
      state.audio.setMuted(muted);
      state.radio.setMuted(muted);
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        respawn(state);
        screen = SCREEN_PLAY;
        announce('Back on the streets of Sunport City.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    // The ending screen waits for Enter before the city opens up again.
    if (state.ending && (actions & ACTION_CONFIRM)) {
      state.ending = null;
      return;
    }
    if (actions & ACTION_MAP) state.mapBig = !state.mapBig;
    if (actions & ACTION_RADIO) {
      const station = state.radio.next();
      state.toast = { text: `Radio: ${station} — ${state.radio.trackName()}`, timer: 3 };
      state.audio.click();
    }
    if (actions & ACTION_ENTER) tryEnter(state);
    if (actions & ACTION_ATTACK) {
      if (state.player.onFoot) {
        if (punchTargetNear(state)) punch(state);
        else shootPlayer(state, aimAngle(state, input));
      }
    }
  }

  function step() {
    state.time += STEP;
    state.clockMin += STEP * 2;
    state.shootCrimeTimer = Math.max(0, state.shootCrimeTimer - STEP);
    if (state.toast) {
      state.toast.timer -= STEP;
      if (state.toast.timer <= 0) state.toast = null;
    }
    if (state.missionComplete) {
      state.missionComplete.timer -= STEP;
      if (state.missionComplete.timer <= 0) state.missionComplete = null;
    }
    if (state.shake) {
      state.shake.timer -= STEP;
      if (state.shake.timer <= 0) state.shake = null;
    }
    // Hit flashes fade out over a few frames.
    for (const car of state.cars) {
      if (car.flash > 0) car.flash = Math.max(0, car.flash - STEP);
    }
    // Weather comes and goes: clear skies, then a rain shower, then clear.
    // A storm at night sometimes throws a lightning flash.
    const w = state.weather;
    w.timer -= STEP;
    if (w.timer <= 0) {
      if (w.kind === 'clear') {
        w.kind = state.rng() < 0.35 ? 'rain' : 'clear';
        w.intensity = 0.5 + state.rng() * 0.5;
        w.timer = 40 + state.rng() * 50;
      } else {
        w.kind = 'clear';
        w.intensity = 0;
        w.timer = 40 + state.rng() * 60;
      }
    }
    if (w.kind === 'rain' && state.clockMin >= 1260) {
      if (state.rng() < 0.002) state.lightning = 0.18;
    }
    if (state.lightning > 0) state.lightning = Math.max(0, state.lightning - STEP);
    state.audio.rain(w.kind === 'rain');
    if (screen === SCREEN_TITLE) {
      // The title screen shows the living city, camera drifting over the Strip.
      updateTraffic(state, STEP);
      updatePedestrians(state, STEP);
      updateParticles(state, STEP);
      state.camera.x = (Math.sin(state.time * 0.05) * 0.5 + 0.5) * (WORLD.width - VIEW.width);
      state.camera.y = (Math.cos(state.time * 0.04) * 0.5 + 0.5) * (WORLD.height - VIEW.height);
      return;
    }
    if (screen !== SCREEN_PLAY) return;

    // The player, on foot or behind the wheel.
    if (state.player.onFoot) {
      updatePlayerOnFoot(state, input, STEP);
      if (input.mouse.down) shootPlayer(state, aimAngle(state, input));
      state.audio.engine(0);
    } else {
      updatePlayerCar(state, input, STEP);
    }

    updateTraffic(state, STEP);
    updatePedestrians(state, STEP);
    updateWanted(state, STEP);
    updatePolice(state, STEP);
    updateHelicopters(state, STEP);
    updateMissions(state, STEP);
    updateSideJobs(state, STEP);
    updateBullets(state, STEP);
    updateParticles(state, STEP);

    // Pick up packages by walking or driving over them.
    const p = state.player;
    for (const pk of state.pickups) {
      if (!pk.taken && distance(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        state.audio.pickup();
      }
    }
    // Sunport packages: ten hidden parcels; all ten pay a $500 bonus.
    let got = 0;
    for (const pk of state.sunportPackages) {
      if (!pk.taken && distance(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        state.audio.pickup();
      }
      if (pk.taken) got += 1;
    }
    if (got >= SUNPORT_PACKAGES && !state.packageBonusPaid) {
      state.packageBonusPaid = true;
      state.cash += PACKAGE_BONUS;
      state.stats.earned += PACKAGE_BONUS;
      state.audio.cash();
      state.toast = { text: `All ${SUNPORT_PACKAGES} Sunport packages! +$${PACKAGE_BONUS}`, timer: 4 };
    }
    // The food truck: stand near it on foot and eat, health comes back.
    state.nearFood = p.onFoot && distance(p.x, p.y, FOOD_TRUCK.x, FOOD_TRUCK.y) < 70;
    if (state.nearFood && state.health < 100) {
      state.health = Math.min(100, state.health + 6 * STEP);
    }
    // Health comes back slowly when the heat is off.
    if (state.wanted === 0 && state.health < 100) state.health = Math.min(100, state.health + 2 * STEP);
    // The safehouse saves the game.
    const atHome = inSafehouse(p.x, p.y);
    p.inSafehouse = atHome;
    if (atHome && !state.savedAtSafehouse) {
      if (saveGame(state)) {
        state.savedAtSafehouse = true;
        p.savedFlash = 2;
        state.toast = { text: 'Safehouse — game saved.', timer: 3 };
      }
    } else if (!atHome) {
      state.savedAtSafehouse = false;
    }
    updateCamera(state);

    if (state.busted) {
      screen = SCREEN_BUSTED;
      state.audio.busted();
      announce('Busted by the Sunport PD.');
    } else if (state.wasted) {
      screen = SCREEN_WASTED;
      state.audio.busted();
      announce('Wasted.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.toWorld(state);
    renderer.drawWorld(state);
    renderer.toScreen();
    drawHud(renderer.ctx, state, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sunport City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
