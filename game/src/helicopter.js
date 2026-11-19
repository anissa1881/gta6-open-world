// The police helicopter: the Sunport PD's eye in the sky. It appears at wanted
// level 3 and up (one heli at 3-4 stars, two at 5), follows the player with a
// spotlight, and keeps the player spotted so patrol cars keep coming. It never
// shoots — the pressure is the chase it brings, not the bullets.
import { HELI } from './config.js';
import { clamp, distance } from './random.js';

export function createHelicopter(x, y, phase) {
  return {
    x, y, angle: 0, rotor: 0,
    phase: phase || 0, // circling offset so two helis do not stack
    bob: 0,
  };
}

/** How many helicopters the current wanted level calls for. */
export function wantedHelis(wanted) {
  if (wanted >= 5) return 2;
  if (wanted >= 3) return 1;
  return 0;
}

/** True when a helicopter has the player in sight (it marks them for the PD). */
export function heliSeesPlayer(state) {
  const p = state.player;
  for (const h of state.helis) {
    if (distance(h.x, h.y, p.x, p.y) < HELI.seeRange) return true;
  }
  return false;
}

/** Keep the helicopter count matched to the wanted level; helis circle the player. */
export function updateHelicopters(state, dt) {
  const want = wantedHelis(state.wanted);
  const p = state.player;
  while (state.helis.length < want) {
    const a = state.rng() * Math.PI * 2;
    state.helis.push(createHelicopter(
      p.x + Math.cos(a) * 500,
      p.y + Math.sin(a) * 500,
      state.helis.length * Math.PI,
    ));
  }
  if (state.helis.length > want) state.helis.length = want;
  for (const h of state.helis) {
    // Circle the player at a hover distance, drifting with a slow orbit.
    h.phase += dt * 0.35;
    const tx = p.x + Math.cos(h.phase) * HELI.hover;
    const ty = p.y + Math.sin(h.phase) * HELI.hover;
    const d = distance(h.x, h.y, tx, ty);
    if (d > 4) {
      const step = Math.min(HELI.speed * dt, d);
      h.x += ((tx - h.x) / d) * step;
      h.y += ((ty - h.y) / d) * step;
    }
    h.x = clamp(h.x, 60, 3140);
    h.y = clamp(h.y, 60, 2340);
    h.angle = Math.atan2(p.y - h.y, p.x - h.x);
    h.rotor += dt * 28;
    h.bob = Math.sin(state.time * 2 + h.phase) * 6;
  }
}
