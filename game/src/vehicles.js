// Cars: creating them, driving the player's car, wrecking them, and the smoke
// a wrecked car gives off. Traffic and police movement live in their own files;
// this file is the shared car body and the player's driving physics.
import { CAR } from './config.js';
import { angleDelta, clamp, distance } from './random.js';
import { hitsSolid, resolveCircle } from './city.js';
import { addShake } from './effects.js';

let nextId = 1;

export function createCar(kind, x, y, angle, color, options) {
  const opt = options || {};
  return {
    id: nextId += 1,
    kind, // 'player' | 'traffic' | 'police' | 'parked'
    x, y, angle, speed: 0,
    length: CAR.length, width: CAR.width,
    color, health: CAR.health,
    driver: opt.driver || (kind === 'traffic' ? 'ai' : 'none'),
    ai: opt.ai || null,
    smokeTimer: 0, dead: false, honkTimer: 0,
    flash: 0, lastCrashFx: -10,
  };
}

/** Drive the player's car with W/S accelerate/brake and A/D steering. */
export function updatePlayerCar(state, input, dt) {
  const car = state.player.car;
  if (!car) return;
  const throttle = -input.moveY(); // W is up: moveY is -1, so throttle is +1
  const steer = input.moveX();
  const handbrake = input.handbrake();

  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    car.speed -= (car.speed > 10 ? CAR.brake : CAR.reverseAccel) * dt;
  }
  // Drag and rolling resistance, stronger with the handbrake.
  car.speed -= car.speed * (handbrake ? 2.4 : 0.55) * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;

  const steerAmount = steer * CAR.steer * dt * clamp(Math.abs(car.speed) / 120, 0.25, 1)
    * (car.speed < 0 ? -1 : 1) * (handbrake ? 1.6 : 1);
  car.angle += steerAmount;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (hitsSolid(state.city, nx, ny, 24)) {
    // A hard hit: bounce, damage and smoke.
    if (Math.abs(car.speed) > 180) {
      damageCar(state, car, Math.abs(car.speed) * 0.06, true);
      state.audio.crash();
      addShake(state, Math.min(10, Math.abs(car.speed) * 0.02));
      spawnSmoke(state, nx, ny, 6);
    }
    car.speed *= -0.35;
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Handbrake at speed: skid marks on the road and a puff of dust.
  if (handbrake && Math.abs(car.speed) > 180) {
    const bx = car.x - Math.cos(car.angle) * 26;
    const by = car.y - Math.sin(car.angle) * 26;
    state.skids.push({ x: bx, y: by, angle: car.angle, life: 4, maxLife: 4 });
    if (state.skids.length > 240) state.skids.splice(0, state.skids.length - 240);
    if (state.rng() < 0.6) {
      state.particles.push({
        x: bx + (state.rng() - 0.5) * 16, y: by + (state.rng() - 0.5) * 16,
        vx: (state.rng() - 0.5) * 40, vy: -20 - state.rng() * 20,
        life: 0.6, maxLife: 0.6, size: 5 + state.rng() * 5,
        color: 'rgba(190, 170, 130, 0.5)', kind: 'dust',
      });
    }
  }
  const fixed = resolveCircle(state.city, car.x, car.y, 24);
  car.x = fixed.x;
  car.y = fixed.y;

  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  state.player.speed = Math.abs(car.speed);
  state.audio.engine(Math.abs(car.speed) / CAR.maxSpeed);
  updateCarSmoke(state, car, dt);
}

/** Damage a car; a wrecked car stops, smokes and can no longer be driven. */
export function damageCar(state, car, amount, byPlayer) {
  if (car.health <= 0) return;
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0) {
    car.dead = true;
    car.speed = 0;
    spawnSmoke(state, car.x, car.y, 14);
    if (byPlayer && car.kind === 'traffic') {
      // Ramming a stranger's car in front of the law is a crime.
      if (state.wanted > 0) state.heat = 0;
    }
  }
}

/** A little smoke every frame while a car is damaged or wrecked; fire below 25 health. */
export function updateCarSmoke(state, car, dt) {
  car.smokeTimer -= dt;
  if (car.health < 55 && car.smokeTimer <= 0) {
    car.smokeTimer = car.health <= 0 ? 0.08 : 0.22;
    spawnSmoke(state, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1);
  }
  if (car.health > 0 && car.health < 25 && state.rng() < 0.25) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * 10 + (state.rng() - 0.5) * 20,
      y: car.y - Math.sin(car.angle) * 10 + (state.rng() - 0.5) * 20,
      vx: (state.rng() - 0.5) * 20, vy: -50 - state.rng() * 40,
      life: 0.35, maxLife: 0.35, size: 6 + state.rng() * 6,
      color: state.rng() < 0.5 ? '#ff7a2a' : '#ffd23f', kind: 'fire',
    });
  }
}

export function spawnSmoke(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x: x + (state.rng() - 0.5) * 20,
      y: y + (state.rng() - 0.5) * 20,
      vx: (state.rng() - 0.5) * 30,
      vy: -30 - state.rng() * 30,
      life: 0.9, maxLife: 0.9, size: 7 + state.rng() * 8,
      color: 'rgba(120,120,120,0.55)', kind: 'smoke',
    });
  }
}

export function spawnSparks(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng() * Math.PI * 2;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * 160, vy: Math.sin(a) * 160,
      life: 0.3, maxLife: 0.3, size: 3,
      color: '#ffd23f', kind: 'spark',
    });
  }
}

/**
 * A rear-end hit, made visible: sparks and a star burst at the contact
 * point, a smoke puff, a white flash on the hit car, a screen shake and a
 * jolt forward. Cooled down per car so a stuck pair does not strobe.
 */
export function spawnCrashFx(state, hitCar, fromCar) {
  if (state.time - (hitCar.lastCrashFx || -10) < 0.5) return;
  hitCar.lastCrashFx = state.time;
  // Contact point: between the two cars, at the hit car's rear bumper.
  const rearX = hitCar.x - Math.cos(hitCar.angle) * (hitCar.length / 2);
  const rearY = hitCar.y - Math.sin(hitCar.angle) * (hitCar.length / 2);
  const cx = (rearX + fromCar.x) / 2;
  const cy = (rearY + fromCar.y) / 2;
  spawnSparks(state, cx, cy, 12);
  for (let i = 0; i < 3; i += 1) {
    const a = state.rng() * Math.PI * 2;
    state.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
      life: 0.45, maxLife: 0.45, size: 6 + state.rng() * 4,
      color: '#fff3a0', kind: 'star',
    });
  }
  spawnSmoke(state, cx, cy, 6);
  hitCar.flash = 0.3;
  fromCar.flash = 0.15;
  addShake(state, 8);
  // Jolt: the hit car is shoved forward in the direction it faces.
  hitCar.speed = (hitCar.speed || 0) + 50;
  hitCar.x += Math.cos(hitCar.angle) * 6;
  hitCar.y += Math.sin(hitCar.angle) * 6;
}

/**
 * Car-on-car contact with a visible rear-end effect: when one car runs
 * into the back of another, the struck car gets sparks, smoke, a flash and
 * a jolt. Side and head-on contact just pushes the cars apart, as before,
 * with a few sparks on a hard knock.
 */
export function handleCarCollision(state, a, b) {
  const hard = collideCars(a, b);
  if (!hard) return;
  // Is b behind a (a was rear-ended by b)?
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const behindA = (dx / d) * Math.cos(a.angle) + (dy / d) * Math.sin(a.angle);
  const behindB = (-dx / d) * Math.cos(b.angle) + (-dy / d) * Math.sin(b.angle);
  if (behindA < -0.6 && b.speed > a.speed + 40) {
    spawnCrashFx(state, a, b);
  } else if (behindB < -0.6 && a.speed > b.speed + 40) {
    spawnCrashFx(state, b, a);
  } else {
    spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 4);
  }
}

/** Push two cars apart when they overlap; returns true on a hard hit. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = 46;
  if (d >= min || d === 0) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const closing = Math.abs(a.speed - b.speed);
  return closing > 120;
}

/** Steer a car toward a target point (used by police and the vigilante target). */
export function steerToward(car, tx, ty, dt, maxSpeed) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDelta(car.angle, want);
  car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
  const target = maxSpeed || CAR.maxSpeed;
  car.speed += (target - car.speed) * Math.min(1, 1.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return distance(car.x, car.y, tx, ty);
}
