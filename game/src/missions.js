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
  { kind: 'taxi', x: 1600, y: 1455, label: 'Taxi Stand — Central Plaza' },
  { kind: 'packages', x: 2600, y: 2000, label: 'Package Depot — Old Foundry' },
  { kind: 'vigilante', x: 1600, y: 1000, label: 'Vigilante Call — Sunport Strip' },
];

/** The Strip Sprint route: five checkpoints east along the Strip's y=1400 road. */
export const RACE_CHECKPOINTS = [
  { x: 400, y: 1400 },
  { x: 700, y: 1400 },
  { x: 1000, y: 1400 },
  { x: 1300, y: 1400 },
  { x: 1550, y: 1400 },
];

/** The gold coupe for Harbor Heist, parked at Marina Row. */
const HEIST_SPOT = { x: 2630, y: 230, angle: 0 };

function setToast(state, text) {
  state.toast = { text, timer: 4 };
}

/** Park the gold coupe at Marina Row (removing any earlier one first). */
function spawnHeistCar(state) {
  state.cars = state.cars.filter((c) => !c.isHeist);
  const car = createCar('parked', HEIST_SPOT.x, HEIST_SPOT.y, HEIST_SPOT.angle, '#f0c040', { driver: 'none' });
  car.isHeist = true;
  state.cars.push(car);
  return car;
}

/** Three rival cars for the Strip Sprint, ahead of the player on the race road. */
function spawnRivals(state) {
  state.cars = state.cars.filter((c) => !c.isRival);
  const spots = [600, 850, 1100];
  const colors = ['#4a90d9', '#d94a6a', '#7ab648'];
  for (let i = 0; i < 3; i += 1) {
    const car = createCar('traffic', spots[i], 1400 + (i % 2 === 0 ? -20 : 20), 0, colors[i],
      { driver: 'ai', ai: { axis: 'h', road: 1400, dir: 1, speed: 300 } });
    car.speed = 300;
    car.isRival = true;
    state.cars.push(car);
  }
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return;
  const place = PLACES[def.place];
  state.mission = {
    index, id: def.id, title: def.title, objective: def.objective,
    briefing: def.briefing, reward: def.reward,
    stage: (def.id === 'courier' || def.id === 'kingpin') ? 'pickup' : 'active',
    target: { x: place.x, y: place.y, label: place.name },
    timer: def.timer || 0, timerMax: def.timer || 0,
    text: def.briefing, enemiesLeft: 0, collected: 0,
    survive: !!def.survive, checkpoints: null, heistCar: null,
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
  if (def.id === 'heist') {
    const car = spawnHeistCar(state);
    state.mission.heistCar = car;
    state.mission.stage = 'steal';
    state.mission.target = { x: car.x, y: car.y, label: 'Gold coupe — Marina Row' };
  }
  if (def.id === 'race') {
    spawnRivals(state);
    state.mission.checkpoints = RACE_CHECKPOINTS.map((c) => ({ ...c }));
    state.mission.stage = 'race';
    state.mission.target = { x: RACE_CHECKPOINTS[0].x, y: RACE_CHECKPOINTS[0].y, label: 'Checkpoint 1/5' };
  }
  if (def.id === 'sky') {
    state.wanted = 4;
    state.heat = 0;
    state.audio.wantedUp();
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
  // The "Mission Complete" panel the HUD shows for a few seconds.
  state.missionComplete = {
    title: m.title, reward: pay,
    missionsDone: state.stats.missionsDone, cash: Math.floor(state.cash),
    timer: 4,
  };
  saveGame(state);
  if (m.index + 1 < MISSIONS.length) {
    startMission(state, m.index + 1);
  } else {
    state.storyDone = true;
    // The ending screen after the finale: Mara's sign-off and the run's stats.
    state.ending = {
      cash: Math.floor(state.cash), earned: state.stats.earned,
      missionsDone: state.stats.missionsDone, stolen: state.stats.stolen,
      clockMin: state.clockMin,
    };
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
      // A survival mission is won by outlasting the clock, not beaten by it.
      if (m.survive) {
        completeMission(state);
        return;
      }
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
    return;
  }
  if (m.id === 'heist') {
    const car = m.heistCar;
    if (!car || car.health <= 0) {
      failMission(state, 'the coupe was wrecked');
      return;
    }
    if (m.stage === 'steal') {
      // Keep the marker on the coupe until the player is driving it.
      m.target = { x: car.x, y: car.y, label: 'Gold coupe — Marina Row' };
      if (!p.onFoot && p.car === car) {
        m.stage = 'deliver';
        m.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: PLACES.safehouse.name };
        m.objective = 'Bring the gold coupe home to the safehouse — keep it in one piece';
        setToast(state, 'Coupe stolen! Get it home — don\'t scratch it!');
        state.audio.pickup();
      }
      return;
    }
    // Delivering: out of the coupe means back to stealing it.
    if (p.onFoot || p.car !== car) {
      m.stage = 'steal';
      m.target = { x: car.x, y: car.y, label: 'Gold coupe — Marina Row' };
      setToast(state, 'Get back in the gold coupe!');
      return;
    }
    const home = PLACES.safehouse;
    if (distance(p.x, p.y, home.x, home.y) < 160) {
      if (car.health < 50) failMission(state, 'the coupe is too damaged');
      else completeMission(state);
    }
    return;
  }
  if (m.id === 'race') {
    // Checkpoints only count behind the wheel — this is a race, not a walk.
    if (!p.onFoot && p.car && m.checkpoints) {
      const next = m.checkpoints[m.collected];
      if (next && distance(p.x, p.y, next.x, next.y) < 100) {
        m.collected += 1;
        state.audio.pickup();
        if (m.collected >= m.checkpoints.length) {
          completeMission(state);
          return;
        }
        const following = m.checkpoints[m.collected];
        m.target = { x: following.x, y: following.y, label: `Checkpoint ${m.collected + 1}/5` };
        setToast(state, `Checkpoint ${m.collected}/5!`);
      }
    }
    return;
  }
  if (m.id === 'sky') {
    // Survive: the timer does the work; the helicopter and the PD do the rest.
    return;
  }
  if (m.id === 'kingpin') {
    if (m.stage === 'pickup') {
      const t = PLACES.marina;
      if (distance(p.x, p.y, t.x, t.y) < 110) {
        m.stage = 'deliver';
        m.target = { x: PLACES.foundry.x, y: PLACES.foundry.y, label: PLACES.foundry.name };
        m.objective = 'Five stars on you — deliver the package to the Old Foundry';
        m.timer = 120;
        m.timerMax = 120;
        state.wanted = 5;
        state.heat = 0;
        state.audio.wantedUp();
        setToast(state, 'Package grabbed! Five stars — run for the Foundry!');
        state.audio.pickup();
      }
      return;
    }
    const t = PLACES.foundry;
    if (distance(p.x, p.y, t.x, t.y) < 160) completeMission(state);
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
    // The waiting passenger gets in; the stand empties until the next fare.
    state.taxiPassenger = null;
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
      // A new passenger shows up at the stand after a while.
      if (s.kind === 'taxi') state.taxiPassenger = { x: SIDE_SPOTS[0].x, y: SIDE_SPOTS[0].y };
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
      state.taxiPassenger = { x: SIDE_SPOTS[0].x, y: SIDE_SPOTS[0].y };
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
