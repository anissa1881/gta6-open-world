// The day/night cycle: the game clock (state.clockMin, minutes since midnight)
// drives the light. Morning is soft gold, noon is bright with short shadows,
// golden hour is warm orange, night is dark blue with no building shadows at
// all. Everything here is a pure function of the clock, so a screenshot scene
// can pin a time of day and get the same light every time.
import { clamp } from './random.js';

/**
 * The light at the current clock time:
 * - tint: a full-frame wash {color, alpha} — warm by day, dark blue at night.
 * - darkness: 0 in full daylight, 1 in the dead of night.
 * - shadow: the building-shadow offset {dx, dy, len} — long and slanted in
 *   the morning and evening, short at noon, zero at night.
 * - icon: '☀️' by day, '🌙' at night (the HUD draws it next to the clock).
 * - phase: 'morning' | 'noon' | 'golden' | 'dusk' | 'night'.
 */
export function daylight(state) {
  const min = ((state.clockMin % 1440) + 1440) % 1440;
  // Keyframes: [minutes, darkness, tintColor, tintAlpha, phase]
  const stops = [
    [0, 1, 'rgba(8,14,40,', 0.46, 'night'],
    [300, 1, 'rgba(8,14,40,', 0.46, 'night'], // 05:00
    [360, 0.55, 'rgba(255,150,80,', 0.10, 'morning'], // 06:00 dawn
    [480, 0.08, 'rgba(255,200,110,', 0.05, 'morning'], // 08:00
    [720, 0, 'rgba(255,255,255,', 0, 'noon'], // 12:00
    [960, 0.08, 'rgba(255,190,90,', 0.06, 'golden'], // 16:00
    [1050, 0.35, 'rgba(255,130,50,', 0.10, 'golden'], // 17:30
    [1140, 0.75, 'rgba(60,40,90,', 0.22, 'dusk'], // 19:00
    [1260, 1, 'rgba(8,14,40,', 0.46, 'night'], // 21:00
    [1440, 1, 'rgba(8,14,40,', 0.46, 'night'],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (min >= stops[i][0] && min <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const span = Math.max(1, b[0] - a[0]);
  const t = clamp((min - a[0]) / span, 0, 1);
  const darkness = a[1] + (b[1] - a[1]) * t;
  const alpha = a[3] + (b[3] - a[3]) * t;
  const phase = t < 0.5 ? a[4] : b[4];
  // The sun is up 06:00–19:00; its shadow runs west in the morning, east in
  // the evening — and it is LONG at dawn and dusk, short at noon.
  let shadow = { dx: 0, dy: 0, len: 0 };
  if (min >= 360 && min <= 1140) {
    const dayT = (min - 360) / 780; // 0 at dawn, 1 at dusk
    const len = 30 * (1 - Math.sin(dayT * Math.PI)) + 6;
    const dx = (dayT * 2 - 1) * len;
    shadow = { dx, dy: len * 0.45, len };
  }
  const isNight = darkness > 0.6;
  return {
    darkness, phase, isNight,
    tint: { color: t < 0.5 ? a[2] : b[2], alpha },
    shadow,
    icon: isNight ? '🌙' : '☀️',
    label: isNight ? 'NIGHT' : 'DAY',
  };
}

/** Traffic flow by the clock: rush hour is busier, late night is quiet. */
export function trafficFlow(state) {
  const min = ((state.clockMin % 1440) + 1440) % 1440;
  if ((min >= 420 && min <= 540) || (min >= 1020 && min <= 1140)) return 1.15; // rush
  if (min >= 1320 || min < 300) return 0.75; // late night
  return 1;
}

/**
 * A traffic light's state at one intersection. The cycle is 16 s: vertical
 * green 0–6.5, yellow 6.5–8, red 8–14.5, yellow 14.5–16 — horizontal is the
 * opposite. Returns {v, h} each 'green' | 'yellow' | 'red'.
 */
export function lightPhase(state, light) {
  const t = (state.time + (light.offset || 0) * 4) % 16;
  const v = t < 6.5 ? 'green' : t < 8 ? 'yellow' : t < 14.5 ? 'red' : 'yellow';
  const h = t < 6.5 ? 'red' : t < 8 ? 'yellow' : t < 14.5 ? 'green' : 'yellow';
  return { v, h };
}
