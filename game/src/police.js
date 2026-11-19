// The wanted level and the Sunport PD. Stars rise with crime and fall when the
// player breaks line of sight and stays hidden. Patrol cars chase and ram; foot
// officers run the player down on foot, and if one holds on long enough the
// player is Busted. A police helicopter overhead keeps the player spotted.
import { PALETTE, POLICE, WANTED } from './config.js';
import { clamp, distance } from './random.js';
import { createCar, steerToward, damageCar, spawnSparks } from './vehicles.js';
import { damagePlayer } from './player.js';
import { nearestRoad, randomRoadPoint, resolveCircle } from './city.js';
import { heliSeesPlayer } from './helicopter.js';
import { addShake } from './effects.js';

function policeSeesPlayer(state) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    if (distance(car.x, car.y, p.x, p.y) < 650) return true;
  }
  for (const officer of state.police) {
    if (distance(officer.x, officer.y, p.x, p.y) < 420) return true;
  }
  // A helicopter overhead keeps the player spotted for the whole PD.
  if (state.helis && heliSeesPlayer(state)) return true;
  return false;
}

/** Cool the wanted level down while the player stays out of sight. */
export function updateWanted(state, dt) {
  if (state.wanted <= 0) {
    state.wantedTimer = 0;
    return;
  }
  if (policeSeesPlayer(state)) {
    state.wantedTimer = 0;
    state.heat = 0;
    return;
  }
  state.wantedTimer += dt;
  if (state.wantedTimer >= WANTED.decaySeconds) {
    state.wantedTimer = 0;
    state.wanted = Math.max(0, state.wanted - 1);
    if (state.wanted === 0) state.toast = { text: 'Heat is off. You are clean — for now.', timer: 3 };
  }
}

/** Keep the number of patrol cars and foot officers matched to the wanted level. */
export function updatePoliceSpawns(state) {
  const p = state.player;
  const wantCars = state.wanted === 0 ? 0 : Math.min(3, state.wanted);
  const wantOfficers = state.wanted >= 2 ? Math.min(2, state.wanted - 1) : 0;
  let cars = 0;
  for (const car of state.cars) if (car.kind === 'police' && car.health > 0) cars += 1;
  while (cars < wantCars) {
    const spot = randomRoadPoint(state.city, state.rng);
    // Spawn off-screen but on a road, so the chase arrives instead of appearing.
    // With a helicopter marking the player, the patrol arrives closer and faster.
    const spawnDist = state.helis && state.helis.length > 0 ? 520 : 700;
    const dx = spot.x - p.x;
    const dy = spot.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const sx = p.x + (dx / d) * spawnDist;
    const sy = p.y + (dy / d) * spawnDist;
    const road = nearestRoad(state.city, sx, sy);
    const car = createCar(
      'police',
      road.axis === 'v' ? road.coord : clamp(sx, 120, state.city.width - 160),
      road.axis === 'h' ? road.coord : clamp(sy, 120, state.city.height - 120),
      Math.atan2(p.y - sy, p.x - sx),
      PALETTE.policeCar,
      { driver: 'ai' },
    );
    car.speed = 200;
    state.cars.push(car);
    cars += 1;
  }
  while (state.police.length < wantOfficers) {
    const a = state.rng() * Math.PI * 2;
    const officer = {
      x: p.x + Math.cos(a) * 420,
      y: p.y + Math.sin(a) * 420,
      angle: 0, speed: POLICE.footSpeed, hp: 40, holdTimer: 0,
    };
    const fixed = resolveCircle(state.city, officer.x, officer.y, 14);
    officer.x = fixed.x;
    officer.y = fixed.y;
    state.police.push(officer);
  }
  if (state.wanted === 0) {
    state.cars = state.cars.filter((c) => c.kind !== 'police' || c.health <= 0);
    state.police.length = 0;
    state.audio.siren(false);
  } else {
    state.audio.siren(true);
  }
}

export function updatePolice(state, dt) {
  const p = state.player;
  updatePoliceSpawns(state);
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.health <= 0) continue;
    const d = steerToward(car, p.x, p.y, dt, POLICE.carSpeed);
    const fixed = resolveCircle(state.city, car.x, car.y, 24);
    car.x = fixed.x;
    car.y = fixed.y;
    // Ram: a hard touch hurts the player or their car.
    const target = p.onFoot ? p : p.car;
    if (target && distance(car.x, car.y, target.x, target.y) < 52) {
      if (p.onFoot) {
        if (damagePlayer(state, POLICE.ramDamage)) state.wasted = true;
      } else if (p.car) {
        damageCar(state, p.car, POLICE.ramDamage, false);
        if (p.car.health <= 0) {
          state.toast = { text: 'Your car is wrecked! Get out and run!', timer: 3 };
        }
      }
      spawnSparks(state, car.x, car.y, 3);
      state.audio.crash();
      addShake(state, 7);
      car.speed *= 0.4;
      // Back off a little so the ram does not stick every frame.
      car.x -= Math.cos(car.angle) * 30;
      car.y -= Math.sin(car.angle) * 30;
    }
    if (d < 900 && car.health < 55) {
      // A smoking patrol car is still a patrol car.
    }
  }
  for (const officer of state.police) {
    const d = distance(officer.x, officer.y, p.x, p.y);
    officer.angle = Math.atan2(p.y - officer.y, p.x - officer.x);
    if (p.onFoot) {
      officer.x += Math.cos(officer.angle) * officer.speed * dt;
      officer.y += Math.sin(officer.angle) * officer.speed * dt;
      const fixed = resolveCircle(state.city, officer.x, officer.y, 14);
      officer.x = fixed.x;
      officer.y = fixed.y;
      if (d < 30) {
        officer.holdTimer += dt;
        if (officer.holdTimer >= POLICE.catchSeconds) state.busted = true;
      } else {
        officer.holdTimer = Math.max(0, officer.holdTimer - dt);
      }
    } else {
      // The player is in a car: officers stand their ground and watch.
      officer.holdTimer = 0;
    }
  }
  // A wrecked patrol car is towed away.
  state.cars = state.cars.filter((c) => !(c.kind === 'police' && c.health <= 0 && c.dead));
}
