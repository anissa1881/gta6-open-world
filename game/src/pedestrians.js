// Pedestrians: people walking the sidewalks, fleeing from danger, and — when the
// story needs them — armed crew members who shoot back. A pedestrian is a small
// walker with a state: 'walk', 'flee', 'attack' or 'dead'.
import { PALETTE, PEDS, WANTED } from './config.js';
import { distance, randomPick } from './random.js';
import { randomSidewalkPoint } from './city.js';

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
  };
}

/** The nearest danger to a pedestrian: a fast car, a bullet, or a chasing cop. */
function dangerNear(state, ped) {
  const p = state.player;
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 200
    && distance(ped.x, ped.y, p.x, p.y) < 220) return { x: p.x, y: p.y };
  for (const b of state.bullets) {
    if (distance(ped.x, ped.y, b.x, b.y) < 160) return { x: b.x, y: b.y };
  }
  return null;
}

export function updatePedestrians(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.dead) continue;
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
      // Stroll along the sidewalk; turn at intersections sometimes.
      if (ped.walkAxis === 'v') ped.y += ped.walkDir * ped.speed * dt;
      else ped.x += ped.walkDir * ped.speed * dt;
      ped.angle = ped.walkAxis === 'v'
        ? (ped.walkDir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (ped.walkDir > 0 ? 0 : Math.PI);
      if (state.rng() < 0.002) {
        ped.walkAxis = ped.walkAxis === 'v' ? 'h' : 'v';
        ped.walkDir = state.rng() < 0.5 ? -1 : 1;
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
