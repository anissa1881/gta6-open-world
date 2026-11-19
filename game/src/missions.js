// Missions and side jobs. Mara Voss's story chain is four jobs; side jobs (taxi,
// package runs, vigilante work) start at marked spots around the city. Each
// mission is a small state machine: a stage, a target on the map, and a timer
// where the story needs one. Completing a job pays cash and advances the story.
import { MISSIONS, PLACES, SIDE_JOBS } from './config.js';
import { distance, randomPick } from './random.js';
import { makePed } from './pedestrians.js';
import { createCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';
import { saveGame } from './save.js';

export const SIDE_SPOTS = [
  { kind: 'taxi', x: 1600, y: 1400, label: 'Taxi Stand — Central Plaza' },
  { kind: 'packages', x: 2600, y: 2000, label: 'Package Depot — Old Foundry' },
  { kind: 'vigilante', x: 1600, y: 1000, label: 'Vigilante Call — Sunport Strip' },
];

function setToast(state, text) {
  state.toast = { text, timer: 4 };
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return;
  const place = PLACES[def.place];
  state.mission = {
    index, id: def.id, title: def.title, objective: def.objective,
    briefing: def.briefing, reward: def.reward,
    stage: def.id === 'courier' ? 'pickup' : 'active',
    target: { x: place.x, y: place.y, label: place.name },
    timer: def.timer || 0, timerMax: def.timer || 0,
    text: def.briefing, enemiesLeft: 0, collected: 0,
  };
  setToast(state, `${def.title} — ${def.objective}`);
  state.audio.missionSting();
  if (def.id === 'tail') {
    state.wanted = 3;
    state.heat = 0;
    state.audio.wantedUp();
  }
  if (def.id === 'showdown') {
    spawnCrew(state);
  }
}

function spawnCrew(state) {
  const base = PLACES.dockside;
  let count = 0;
  for (let i = 0; i < 3; i += 1) {
    const ped = makePed(state, base.x + (i - 1) * 90, base.y + 60 + (i % 2) * 60, true);
    ped.state = 'attack';
    state.peds.push(ped);
    count += 1;
  }
  state.mission.enemiesLeft = count;
}

function completeMission(state) {
  const m = state.mission;
  const pay = m.reward;
  state.cash += pay;
  state.stats.missionsDone += 1;
  state.stats.earned += pay;
  state.audio.cash();
  setToast(state, `${m.title} complete! +$${pay}`);
  saveGame(state);
  if (m.index + 1 < MISSIONS.length) {
    startMission(state, m.index + 1);
  } else {
    state.storyDone = true;
    state.mission = {
      index: m.index + 1, id: 'done', title: 'Sunport Is Yours',
      objective: 'Free roam — take side jobs, explore, and keep the city yours.',
      briefing: 'Mara Voss: "Sunport is yours now. Don\'t spend it all in one place."',
      reward: 0, stage: 'done', target: null, timer: 0, timerMax: 0,
      text: 'Story complete! Free roam.', enemiesLeft: 0, collected: 0,
    };
    setToast(state, 'Story complete! Sunport City is yours.');
  }
}

function failMission(state, reason) {
  const m = state.mission;
  setToast(state, `${m.title} failed — ${reason}. Try again.`);
  state.audio.busted();
  startMission(state, m.index);
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (!m || m.stage === 'done' || m.stage === 'idle') return;
  const p = state.player;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'out of time');
      return;
    }
  }
  if (m.id === 'getaway') {
    if (!p.onFoot && p.car) {
      const t = PLACES.strip;
      if (distance(p.x, p.y, t.x, t.y) < 160) completeMission(state);
    }
    return;
  }
  if (m.id === 'courier') {
    if (m.stage === 'pickup') {
      const t = PLACES.marina;
      if (distance(p.x, p.y, t.x, t.y) < 110) {
        m.stage = 'deliver';
        m.target = { x: PLACES.dockside.x, y: PLACES.dockside.y, label: PLACES.dockside.name };
        m.objective = 'Deliver the package to Dockside before the timer ends';
        setToast(state, 'Package picked up! Get it to Dockside — fast!');
        state.audio.pickup();
      }
      return;
    }
    const t = PLACES.dockside;
    if (distance(p.x, p.y, t.x, t.y) < 130) completeMission(state);
    return;
  }
  if (m.id === 'tail') {
    if (state.wanted === 0) completeMission(state);
    return;
  }
  if (m.id === 'showdown') {
    let alive = 0;
    for (const ped of state.peds) {
      if (ped.armed && !ped.dead) alive += 1;
    }
    m.enemiesLeft = alive;
    if (alive === 0) completeMission(state);
  }
}

/** Start a side job at a marked spot. Returns true when one started. */
export function startSideJob(state, kind) {
  if (state.side) return false;
  const p = state.player;
  if (kind === 'taxi') {
    if (p.onFoot) {
      setToast(state, 'You need a car for a taxi fare.');
      return false;
    }
    const dest = randomPick(state.rng, [PLACES.marina, PLACES.strip, PLACES.foundry, PLACES.safehouse]);
    state.side = { kind, title: SIDE_JOBS.taxi.title, reward: SIDE_JOBS.taxi.reward, target: { x: dest.x, y: dest.y, label: dest.name }, timer: 75, timerMax: 75, collected: 0 };
    setToast(state, 'Taxi fare! Drive the passenger to the marker.');
    return true;
  }
  if (kind === 'packages') {
    const spots = [];
    for (let i = 0; i < 5; i += 1) {
      const pt = randomRoadPoint(state.city, state.rng);
      spots.push({ x: pt.x, y: pt.y, kind: 'package', taken: false });
    }
    state.side = { kind, title: SIDE_JOBS.packages.title, reward: SIDE_JOBS.packages.reward, target: null, timer: 0, timerMax: 0, collected: 0, total: 5 };
    state.pickups.push(...spots);
    setToast(state, 'Package run! Collect 5 packages around the city.');
    return true;
  }
  if (kind === 'vigilante') {
    const spot = randomRoadPoint(state.city, state.rng);
    const car = createCar('traffic', spot.x, spot.y, state.rng() * Math.PI * 2, '#7a3fd0', { driver: 'ai', ai: { axis: 'h', road: spot.y, dir: 1, speed: 200 } });
    car.health = 70;
    car.isTarget = true;
    state.cars.push(car);
    state.side = { kind, title: SIDE_JOBS.vigilante.title, reward: SIDE_JOBS.vigilante.reward, target: null, timer: 120, timerMax: 120, collected: 0, targetCar: car };
    setToast(state, 'Vigilante! Stop the purple getaway car — ram it or shoot it.');
    return true;
  }
  return false;
}

export function updateSideJobs(state, dt) {
  const s = state.side;
  if (!s) return;
  const p = state.player;
  if (s.timer > 0) {
    s.timer -= dt;
    if (s.timer <= 0) {
      setToast(state, `${s.title} failed — out of time.`);
      if (s.kind === 'vigilante' && s.targetCar) s.targetCar.isTarget = false;
      state.side = null;
      return;
    }
  }
  if (s.kind === 'taxi') {
    if (s.target && distance(p.x, p.y, s.target.x, s.target.y) < 130) {
      state.cash += s.reward;
      state.stats.earned += s.reward;
      state.audio.cash();
      setToast(state, `Taxi fare complete! +$${s.reward}`);
      saveGame(state);
      state.side = null;
    }
    return;
  }
  if (s.kind === 'packages') {
    let got = 0;
    for (const pk of state.pickups) if (pk.taken) got += 1;
    s.collected = got;
    if (got >= s.total) {
      state.cash += s.reward;
      state.stats.earned += s.reward;
      state.audio.cash();
      setToast(state, `Package run complete! +$${s.reward}`);
      saveGame(state);
      state.side = null;
    }
    return;
  }
  if (s.kind === 'vigilante') {
    if (!s.targetCar || s.targetCar.health <= 0) {
      state.cash += s.reward;
      state.stats.earned += s.reward;
      state.audio.cash();
      setToast(state, `Getaway car stopped! +$${s.reward}`);
      saveGame(state);
      state.side = null;
    }
  }
}

/** The current objective target for the HUD, minimap and edge arrow. */
export function currentTarget(state) {
  if (state.side && state.side.target) return state.side.target;
  if (state.side && state.side.kind === 'vigilante' && state.side.targetCar) {
    return { x: state.side.targetCar.x, y: state.side.targetCar.y, label: 'Getaway car' };
  }
  if (state.mission && state.mission.target) return state.mission.target;
  return null;
}
