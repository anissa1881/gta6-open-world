// Pedestrians: people walking the sidewalks, fleeing from danger, and — when the
// story needs them — armed crew members who shoot back. A pedestrian is a small
// walker with a state: 'walk', 'flee', 'attack' or 'dead'.
import { PALETTE, PEDS, ROAD, WANTED } from './config.js';
import { distance, randomPick } from './random.js';
import { randomSidewalkPoint } from './city.js';
import { daylight } from './daynight.js';
import { startCinematic } from './effects.js';

export function createPedestrians(state) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const spot = randomSidewalkPoint(state.city, state.rng);
    peds.push(makePed(state, spot.x, spot.y, false));
  }
  return peds;
}

export function makePed(state, x, y, armed) {
  return {
    x, y, angle: state.rng() * Math.PI * 2,
    speed: PEDS.walkSpeed * (0.7 + state.rng() * 0.6),
    state: 'walk',
    color: randomPick(state.rng, PALETTE.ped),
    hp: armed ? 70 : 30,
    armed: !!armed,
    shootCooldown: 1 + state.rng(),
    fleeTimer: 0,
    target: null,
    dead: false,
    walkAxis: state.rng() < 0.5 ? 'v' : 'h',
    walkDir: state.rng() < 0.5 ? -1 : 1,
    // Street life: 'stroll' along a sidewalk, 'wait' at a corner, 'cross'
    // over a road at a crosswalk. Crossings make the city read as alive.
    mode: 'stroll',
    waitTimer: 0,
    crossLeft: 0,
    crossAxis: 'h',
    crossDir: 1,
    // Knocked down by a car: 'stumble' counts down, then they get up and flee.
    stumbleTimer: 0,
    lastHit: -10,
  };
}

/** The nearest danger to a pedestrian: a fast car, a bullet, or a chasing cop. */
function dangerNear(state, ped) {
  const p = state.player;
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 200
    && distance(ped.x, ped.y, p.x, p.y) < 220) return { x: p.x, y: p.y };
  // Any fast car — a speeding taxi, a bus, a patrol car — scatters people.
  for (const car of state.cars) {
    if (car.kind === 'traffic' && Math.abs(car.speed) > 240
      && distance(ped.x, ped.y, car.x, car.y) < 180) return { x: car.x, y: car.y };
  }
  for (const b of state.bullets) {
    if (distance(ped.x, ped.y, b.x, b.y) < 160) return { x: b.x, y: b.y };
  }
  return null;
}

export function updatePedestrians(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (ped.state === 'stumble') {
      // Knocked down by a car: lying on the road, then up and running off.
      ped.stumbleTimer -= dt;
      if (ped.stumbleTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 2;
      }
      continue;
    }
    if (ped.state === 'attack') {
      // Armed crew: close in and shoot at the player.
      const d = distance(ped.x, ped.y, p.x, p.y);
      ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
      if (d > 260) {
        ped.x += Math.cos(ped.angle) * 150 * dt;
        ped.y += Math.sin(ped.angle) * 150 * dt;
      }
      ped.shootCooldown -= dt;
      if (ped.shootCooldown <= 0 && d < 520) {
        // Queue the shot; combat.js fires it (this file must not import combat).
        state.bulletRequests.push({ x: ped.x, y: ped.y, angle: ped.angle, from: 'enemy', damage: 7 });
        ped.shootCooldown = 1.1 + state.rng() * 0.8;
        state.audio.gunshot();
      }
      continue;
    }

    const danger = dangerNear(state, ped);
    if (danger) {
      ped.state = 'flee';
      ped.fleeTimer = 1.6;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - (danger ? danger.y : p.y), ped.x - (danger ? danger.x : p.x));
      ped.angle = away;
      ped.x += Math.cos(away) * PEDS.fleeSpeed * dt;
      ped.y += Math.sin(away) * PEDS.fleeSpeed * dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      // Late at night the streets are quieter: people stroll more slowly.
      const nightSlow = daylight(state).isNight ? 0.7 : 1;
      const speed = ped.speed * nightSlow;
      if (ped.mode === 'wait') {
        // Standing at a corner, waiting to cross.
        ped.waitTimer -= dt;
        if (ped.waitTimer <= 0) {
          ped.mode = 'cross';
          ped.crossLeft = ROAD.width + 40;
          ped.crossAxis = ped.walkAxis === 'v' ? 'h' : 'v';
          ped.crossDir = state.rng() < 0.5 ? -1 : 1;
        }
      } else if (ped.mode === 'cross') {
        // Crossing the road at a crosswalk, a little faster than a stroll.
        const step = speed * 1.3 * dt;
        if (ped.crossAxis === 'v') ped.y += ped.crossDir * step;
        else ped.x += ped.crossDir * step;
        ped.angle = ped.crossAxis === 'v'
          ? (ped.crossDir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (ped.crossDir > 0 ? 0 : Math.PI);
        ped.crossLeft -= step;
        if (ped.crossLeft <= 0) {
          ped.mode = 'stroll';
          ped.walkAxis = ped.crossAxis;
          ped.walkDir = ped.crossDir;
        }
      } else {
        // Stroll along the sidewalk; turn at intersections sometimes.
        if (ped.walkAxis === 'v') ped.y += ped.walkDir * speed * dt;
        else ped.x += ped.walkDir * speed * dt;
        ped.angle = ped.walkAxis === 'v'
          ? (ped.walkDir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (ped.walkDir > 0 ? 0 : Math.PI);
        if (state.rng() < 0.002) {
          ped.walkAxis = ped.walkAxis === 'v' ? 'h' : 'v';
          ped.walkDir = state.rng() < 0.5 ? -1 : 1;
        }
        // Near a corner, sometimes stop and wait to cross the road.
        const nearCorner = state.city.lines.vertical.some((vx) => Math.abs(ped.x - vx) < 110)
          && state.city.lines.horizontal.some((hy) => Math.abs(ped.y - hy) < 110);
        if (nearCorner && state.rng() < 0.0025) {
          ped.mode = 'wait';
          ped.waitTimer = 1 + state.rng() * 2.5;
        }
      }
      if (ped.x < 60 || ped.x > state.city.width - 180 || ped.y < 60 || ped.y > state.city.height - 60) {
        ped.walkDir *= -1;
      }
    }
    // Keep pedestrians out of buildings and water.
    const fixed = { x: ped.x, y: ped.y };
    if (fixed.x < 20) fixed.x = 20;
    if (fixed.y < 20) fixed.y = 20;
    ped.x = fixed.x;
    ped.y = fixed.y;
  }
}

/** Hurt a pedestrian; returns true when they go down. Hitting one is a crime. */
export function damagePed(state, ped, amount, byPlayer) {
  if (ped.dead) return false;
  ped.hp -= amount;
  if (byPlayer && !ped.armed) {
    state.wanted = Math.min(5, state.wanted + WANTED.hitPed);
    state.heat = 0;
  }
  if (ped.hp <= 0) {
    ped.dead = true;
    ped.state = 'dead';
    return true;
  }
  // A hurt pedestrian runs.
  ped.state = 'flee';
  ped.fleeTimer = 2;
  return false;
}

/**
 * The player's car running a pedestrian down: a brief close-up, a thud, a
 * dust burst, and the walker stumbles, gets up and runs off to the sidewalk.
 * Cartoonish, no blood — they always get back up. Hitting one is a crime, so
 * the wanted level rises. Only the player's car does this: traffic passes
 * through pedestrians as before, so the streets never turn into a pile-up.
 */
export function checkCarHits(state) {
  const car = state.player.onFoot ? null : state.player.car;
  if (!car || car.health <= 0 || Math.abs(car.speed) < 80) return;
  // Airborne off a ramp, the car flies over pedestrians — no hit.
  if (car.air) return;
  for (const ped of state.peds) {
    if (ped.dead || ped.state === 'stumble' || ped.armed) continue;
    if (state.time - (ped.lastHit || -10) < 2) continue;
    if (distance(ped.x, ped.y, car.x, car.y) >= 26) continue;
    ped.lastHit = state.time;
    ped.state = 'stumble';
    ped.stumbleTimer = 0.9;
    ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
    for (let i = 0; i < 6; i += 1) {
      state.particles.push({
        x: ped.x + (state.rng() - 0.5) * 16, y: ped.y + (state.rng() - 0.5) * 16,
        vx: (state.rng() - 0.5) * 50, vy: -20 - state.rng() * 30,
        life: 0.5, maxLife: 0.5, size: 5 + state.rng() * 4,
        color: 'rgba(190, 170, 130, 0.6)', kind: 'dust',
      });
    }
    state.audio.thud();
    startCinematic(state, ped.x, ped.y, 0.9);
    state.wanted = Math.min(5, state.wanted + WANTED.hitPed);
    state.heat = 0;
  }
}
