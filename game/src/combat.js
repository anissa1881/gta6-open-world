// Combat: punches, pistol shots and bullets. Bullets are simple fast points that
// stop at buildings, dent cars and hurt people. Shooting in public is a crime,
// and so is punching a stranger down.
import { PLAYER } from './config.js';
import { angleDelta, distance } from './random.js';
import { hitsSolid } from './city.js';
import { damagePed } from './pedestrians.js';
import { damageCar, spawnSparks } from './vehicles.js';
import { damagePlayer } from './player.js';

const BULLET_SPEED = 950;
const BULLET_LIFE = 1.1;

export function spawnBullet(state, x, y, angle, from, damage) {
  state.bullets.push({ x, y, angle, speed: BULLET_SPEED, life: BULLET_LIFE, from, damage });
}

/** A punch on foot: everything in an arc in front of the player gets hit. */
export function punch(state) {
  const p = state.player;
  if (!p.onFoot || p.punchCooldown > 0) return;
  p.punchCooldown = PLAYER.punchCooldown;
  state.audio.punch();
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const d = distance(p.x, p.y, ped.x, ped.y);
    if (d > PLAYER.punchRange + 14) continue;
    const want = Math.atan2(ped.y - p.y, ped.x - p.x);
    if (Math.abs(angleDelta(p.angle, want)) > PLAYER.punchArc) continue;
    damagePed(state, ped, PLAYER.punchDamage, true);
    spawnSparks(state, ped.x, ped.y, 4);
  }
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d > 60) continue;
    damageCar(state, car, 8, true);
    spawnSparks(state, car.x, car.y, 3);
  }
}

/** Fire the pistol toward an angle. Returns true when a shot went off. */
export function shootPlayer(state, angle) {
  const p = state.player;
  if (!p.onFoot || p.shootCooldown > 0 || p.ammo <= 0) return false;
  p.shootCooldown = PLAYER.shootCooldown;
  p.ammo -= 1;
  p.aimAngle = angle;
  spawnBullet(state, p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, angle, 'player', 25);
  state.audio.gunshot();
  if (state.shootCrimeTimer <= 0 && state.wanted < 5) {
    state.wanted = Math.min(5, state.wanted + 1);
    state.heat = 0;
    state.shootCrimeTimer = 6;
    state.audio.wantedUp();
  }
  return true;
}

export function updateBullets(state, dt) {
  // Armed pedestrians queue their shots here instead of importing this file.
  if (state.bulletRequests && state.bulletRequests.length) {
    for (const r of state.bulletRequests) spawnBullet(state, r.x, r.y, r.angle, r.from, r.damage);
    state.bulletRequests.length = 0;
  }
  const p = state.player;
  for (const b of state.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (hitsSolid(state.city, b.x, b.y, 2)) {
      spawnSparks(state, b.x, b.y, 3);
      b.dead = true;
      continue;
    }
    let hit = false;
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      if (distance(b.x, b.y, car.x, car.y) < 34) {
        damageCar(state, car, b.damage, b.from === 'player');
        spawnSparks(state, b.x, b.y, 4);
        hit = true;
        break;
      }
    }
    if (hit) { b.dead = true; continue; }
    if (b.from !== 'player') {
      const target = p.onFoot ? p : p.car;
      if (target && distance(b.x, b.y, target.x, target.y) < (p.onFoot ? 16 : 34)) {
        if (p.onFoot) {
          if (damagePlayer(state, b.damage)) state.wasted = true;
        } else if (p.car) {
          damageCar(state, p.car, b.damage, false);
        }
        b.dead = true;
        continue;
      }
    } else {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (distance(b.x, b.y, ped.x, ped.y) < 16) {
          damagePed(state, ped, b.damage, true);
          spawnSparks(state, b.x, b.y, 4);
          hit = true;
          break;
        }
      }
      if (hit) { b.dead = true; continue; }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
}
