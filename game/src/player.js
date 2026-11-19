// The player on foot: walking, running, entering and leaving cars, taking damage.
// Driving itself lives in vehicles.js; this file is only the person.
import { CAR, PLAYER, WANTED } from './config.js';
import { clamp, distance } from './random.js';
import { resolveCircle } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2,
    vx: 0, vy: 0, speed: 0,
    onFoot: true, car: null,
    punchCooldown: 0, shootCooldown: 0, aimAngle: -Math.PI / 2,
    ammo: PLAYER.ammoStart, invulnerable: 0, bustedTimer: 0,
    inSafehouse: false, savedFlash: 0,
  };
}

/** Move the player on foot. Returns nothing; mutates player and reads input. */
export function updatePlayerOnFoot(state, input, dt) {
  const p = state.player;
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my) || 1;
  const run = input.running();
  const speed = run ? PLAYER.walkSpeed * 1.45 : PLAYER.walkSpeed;
  p.vx = (mx / len) * speed * (mx || my ? 1 : 0);
  p.vy = (my / len) * speed * (mx || my ? 1 : 0);
  p.speed = Math.hypot(p.vx, p.vy);
  if (p.speed > 1) p.angle = Math.atan2(p.vy, p.vx);
  const next = resolveCircle(state.city, p.x + p.vx * dt, p.y + p.vy * dt, PLAYER.radius);
  p.x = next.x;
  p.y = next.y;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.savedFlash = Math.max(0, p.savedFlash - dt);
}

/** The nearest drivable car within enter range, or null. */
export function nearestCar(state, maxRange) {
  const p = state.player;
  let best = null;
  let bestD = maxRange || CAR.enterRange;
  for (const car of state.cars) {
    if (car.health <= 0 || car.driver === 'player') continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Get into a car. Returns the car, or null when nothing is close enough. */
export function enterCar(state, car) {
  const p = state.player;
  if (!car || car.health <= 0) return null;
  const wasParked = car.kind === 'parked' || car.kind === 'traffic';
  if (wasParked && car.kind !== 'police') {
    state.stats.stolen += 1;
    addWanted(state, WANTED.stealCar, 'car stolen');
  }
  if (car.kind === 'police') addWanted(state, 2, 'police car stolen');
  car.driver = 'player';
  car.kind = 'player';
  p.car = car;
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  return car;
}

/** Get out of the car, stepping to its side. */
export function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.driver = 'none';
  car.kind = 'parked';
  car.speed = 0;
  const side = resolveCircle(state.city, car.x + Math.cos(car.angle + Math.PI / 2) * 44, car.y + Math.sin(car.angle + Math.PI / 2) * 44, PLAYER.radius);
  p.x = side.x;
  p.y = side.y;
  p.onFoot = true;
  p.car = null;
}

/** Hurt the player; returns true when the player is wasted. */
export function damagePlayer(state, amount) {
  const p = state.player;
  if (p.invulnerable > 0) return false;
  state.health = Math.max(0, state.health - amount);
  p.invulnerable = 0.6;
  if (state.health <= 0) return true;
  return false;
}

export function addWanted(state, stars, reason) {
  if (state.wanted >= 5) return;
  state.wanted = clamp(state.wanted + stars, 0, 5);
  state.heat = 0;
  state.lastCrime = reason || 'crime';
}
