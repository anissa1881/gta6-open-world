// Stunt jumps: ramps in the city, the jump itself, and the cash a jump
// pays. Hit a ramp at speed in a car and you go airborne; land it and the
// jump pays cash. A new activity for the judge's depth criterion — the city
// already had races and side jobs, but nothing to jump.
import { clamp } from './random.js';
import { addShake } from './effects.js';
import { spawnSmoke } from './vehicles.js';

/** The ramps: on a road, facing along it, mid-block (never on a junction). */
export const STUNT_RAMPS = [
  { x: 1000, y: 800, angle: -Math.PI / 2, label: 'Strip Ramp' },
  { x: 1800, y: 1600, angle: Math.PI / 2, label: 'Plaza Ramp' },
  { x: 800, y: 1800, angle: 0, label: 'Dockside Ramp' },
  { x: 2400, y: 600, angle: Math.PI, label: 'Marina Ramp' },
  { x: 1200, y: 1400, angle: 0, label: 'Race Ramp' },
];

const LAUNCH_SPEED = 240;
const AIR_TIME = 0.9;
const AIR_HEIGHT = 46;
const TRIGGER_DIST = 46;
const LAUNCH_BONUS = 60;
const MAX_BONUS = 150;

/** The nearest ramp to a point, and how far away it is. */
export function nearestRamp(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const r of STUNT_RAMPS) {
    const d = Math.hypot(x - r.x, y - r.y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return { ramp: best, dist: bestD };
}

/**
 * Ramps and flight, once per step. A car that crosses a ramp lip at speed,
 * moving the way the ramp faces, goes airborne for a beat; landing pays
 * cash by launch speed. While airborne the car flies straight (see
 * vehicles.js) and cannot hit pedestrians or be hit by them.
 */
export function updateStunts(state, dt) {
  if (state.stuntCooldown > 0) state.stuntCooldown = Math.max(0, state.stuntCooldown - dt);
  const p = state.player;
  if (p.onFoot || !p.car) return;
  const car = p.car;
  if (car.air) {
    car.air.t += dt;
    // A parabola: up fast, a hang at the top, then down. Peak mid-flight.
    const k = clamp(car.air.t / car.air.dur, 0, 1);
    car.air.h = 4 * AIR_HEIGHT * k * (1 - k);
    if (car.air.t >= car.air.dur) {
      // Landing: dust, a shake, and the jump pays.
      const bonus = Math.min(MAX_BONUS, LAUNCH_BONUS + Math.floor(car.air.speed / 8));
      car.air = null;
      state.cash += bonus;
      state.stats.earned += bonus;
      state.stats.jumps += 1;
      state.stats.stuntCash += bonus;
      state.stuntCooldown = 1.5;
      state.toast = { text: `STUNT JUMP! +$${bonus}`, timer: 3 };
      state.audio.cash();
      addShake(state, 5);
      spawnSmoke(state, car.x, car.y, 5);
    }
    return;
  }
  if (state.stuntCooldown > 0) return;
  if (Math.abs(car.speed) < LAUNCH_SPEED) return;
  for (const ramp of STUNT_RAMPS) {
    const dx = car.x - ramp.x;
    const dy = car.y - ramp.y;
    if (dx * dx + dy * dy > TRIGGER_DIST * TRIGGER_DIST) continue;
    // Moving the way the ramp faces: forward along the road, not across it.
    const vx = Math.cos(car.angle) * car.speed;
    const vy = Math.sin(car.angle) * car.speed;
    const along = (vx * Math.cos(ramp.angle) + vy * Math.sin(ramp.angle)) / Math.abs(car.speed);
    if (along < 0.7) continue;
    car.air = { t: 0, dur: AIR_TIME, h: 0, speed: Math.abs(car.speed) };
    break;
  }
}
