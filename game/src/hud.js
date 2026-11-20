// The HUD and the minimap, and the menu panels. Everything here is drawn in
// logical screen space (1280x720) after the renderer switches the transform:
// health and cash top-left, wanted stars top-right, the objective across the
// top, the clock and district bottom-left, and the minimap bottom-right.
import { FONT, FOOD_TRUCK, PALETTE, PLACES, RANKS, ROAD, STOREFRONTS, VIEW, WORLD } from './config.js';
import { currentTarget } from './missions.js';
import { districtAt } from './city.js';
import { daylight } from './daynight.js';
import { hasSave } from './save.js';
import { STUNT_RAMPS, nearestRamp } from './stunts.js';

const fonts = new Map();
function text(ctx, value, x, y, size, color, align) {
  if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
  ctx.font = fonts.get(size);
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The player's street rank, from missions done and cash earned. */
export function rankFor(state) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (state.stats.missionsDone >= r.missions || Math.floor(state.cash) >= r.cash) rank = r.name;
  }
  return rank;
}

function drawMinimap(ctx, state, big) {
  const w = big ? 340 : 210;
  const h = big ? 255 : 158;
  const x = VIEW.width - w - 18;
  const y = VIEW.height - h - 18;
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, h - 6);
  ctx.clip();
  // City blocks: a dark map bed, so the streets read as light roads on it.
  ctx.fillStyle = '#232b33';
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  // Water on the east edge.
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x + state.city.water.x * sx, y, state.city.water.w * sx, h);
  // The actual street network: each road drawn at its true width, light
  // grey on the dark blocks, with a thin dark centre line down the middle
  // so every street reads as a street, GTA-style.
  const roadW = ROAD.width * sx;
  const roadH = ROAD.width * sy;
  ctx.fillStyle = '#aeb6bf';
  for (const vx of state.city.lines.vertical) ctx.fillRect(x + vx * sx - roadW / 2, y, roadW, h);
  for (const hy of state.city.lines.horizontal) ctx.fillRect(x, y + hy * sy - roadH / 2, w, roadH);
  ctx.fillStyle = 'rgba(35,43,51,0.85)';
  for (const vx of state.city.lines.vertical) ctx.fillRect(x + vx * sx - 0.75, y, 1.5, h);
  for (const hy of state.city.lines.horizontal) ctx.fillRect(x, y + hy * sy - 0.75, w, 1.5);
  // Safehouse.
  ctx.fillStyle = '#2fae4e';
  ctx.fillRect(x + PLACES.safehouse.x * sx - 3, y + PLACES.safehouse.y * sy - 3, 6, 6);
  // Stunt ramps as orange triangles, so the jumps are findable on the map.
  ctx.fillStyle = '#ff9a3c';
  for (const ramp of STUNT_RAMPS) {
    ctx.save();
    ctx.translate(x + ramp.x * sx, y + ramp.y * sy);
    ctx.rotate(ramp.angle);
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Traffic as grey dots, police as red dots.
  ctx.fillStyle = 'rgba(200,200,200,0.8)';
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    ctx.fillRect(x + car.x * sx - 1, y + car.y * sy - 1, 2, 2);
  }
  ctx.fillStyle = '#ff3b30';
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Helicopters as orange dots with a ring.
  for (const h of state.helis) {
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.arc(x + h.x * sx, y + h.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff9a3c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + h.x * sx, y + h.y * sy, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Objective target.
  const target = currentTarget(state);
  if (target) {
    ctx.fillStyle = PALETTE.marker;
    ctx.save();
    ctx.translate(x + target.x * sx, y + target.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  // The player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North.
  text(ctx, 'N', x + w - 14, y + 20, 16, PALETTE.text, 'center');
  text(ctx, 'SUNPORT CITY', x + 10, y + 18, 12, PALETTE.muted, 'left');
}

function drawHudPlay(ctx, state) {
  const p = state.player;
  // Top-left: health bar, cash, ammo.
  panel(ctx, 16, 14, 250, 64);
  text(ctx, 'HEALTH', 28, 36, 13, PALETTE.muted, 'left');
  ctx.fillStyle = '#222';
  ctx.fillRect(28, 44, 180, 12);
  ctx.fillStyle = state.health > 30 ? PALETTE.health : PALETTE.healthLow;
  ctx.fillRect(28, 44, 180 * Math.max(0, state.health / 100), 12);
  text(ctx, `$${Math.floor(state.cash)}`, 220, 56, 20, PALETTE.cash, 'left');
  if (p.onFoot) text(ctx, `AMMO ${p.ammo}`, 28, 72, 13, PALETTE.text, 'left');
  // Radio station under the health panel.
  if (state.radio) {
    text(ctx, `♪ ${state.radio.stationName()} — ${state.radio.trackName()}`, 28, 96, 14, PALETTE.muted, 'left');
  }
  // Top-right: wanted stars.
  panel(ctx, VIEW.width - 266, 14, 250, 64);
  text(ctx, state.wanted > 0 ? 'WANTED' : 'CLEAN', VIEW.width - 254, 36, 13, state.wanted > 0 ? '#ff6b5e' : PALETTE.muted, 'left');
  for (let i = 0; i < 5; i += 1) {
    text(ctx, '★', VIEW.width - 254 + i * 34, 66, 28, i < state.wanted ? PALETTE.star : PALETTE.starEmpty, 'left');
  }
  // Top-centre: the objective.
  const m = state.mission;
  const objective = state.side
    ? `${state.side.title}: ${state.side.kind === 'packages' ? `${state.side.collected}/${state.side.total} packages` : 'follow the marker'}`
    : (m ? `${m.title} — ${m.objective}` : '');
  const timer = state.side && state.side.timer > 0 ? state.side.timer : (m && m.timer > 0 ? m.timer : 0);
  if (objective) {
    const w = 640;
    panel(ctx, (VIEW.width - w) / 2, 14, w, 64);
    text(ctx, objective, VIEW.width / 2, 40, 17, PALETTE.text, 'center');
    if (timer > 0) {
      text(ctx, `⏱ ${Math.ceil(timer)}s`, VIEW.width / 2, 66, 18, timer < 15 ? '#ff6b5e' : PALETTE.marker, 'center');
    } else if (m && m.id === 'showdown') {
      text(ctx, `Crew left: ${m.enemiesLeft}`, VIEW.width / 2, 66, 18, PALETTE.marker, 'center');
    } else if (m && m.id === 'race') {
      text(ctx, `Checkpoint ${m.collected + 1}/5 — stay in the car!`, VIEW.width / 2, 66, 18, PALETTE.marker, 'center');
    } else {
      text(ctx, 'Follow the yellow marker', VIEW.width / 2, 66, 15, PALETTE.muted, 'center');
    }
  }
  // Missions done + rank, under the wanted panel — plus Sunport packages and stunt jumps.
  const pkgGot = state.sunportPackages ? state.sunportPackages.filter((pk) => pk.taken).length : 0;
  const pkgTotal = state.sunportPackages ? state.sunportPackages.length : 0;
  const jumpBit = state.stats.jumps > 0 ? `  •  JUMP ${state.stats.jumps}` : '';
  text(ctx, `MISI ${state.stats.missionsDone}/8  •  RANK ${rankFor(state)}  •  PKG ${pkgGot}/${pkgTotal}${jumpBit}`, VIEW.width - 16, 108, 16, PALETTE.panelEdge, 'right');
  // Toast message under the banner.
  if (state.toast && state.toast.timer > 0) {
    ctx.globalAlpha = Math.min(1, state.toast.timer);
    text(ctx, state.toast.text, VIEW.width / 2, 116, 20, PALETTE.marker, 'center');
    ctx.globalAlpha = 1;
  }
  // Arrival warning: a banner with a flashing edge glow, shown while the
  // siren or rotor fades in — before the police or the heli actually arrive.
  if (state.warning && state.warning.timer > 0) {
    const w = state.warning;
    const flash = Math.floor(state.time * 6) % 2 === 0;
    const glowA = (0.10 + 0.08 * Math.sin(state.time * 8)).toFixed(2);
    if (w.kind === 'police') {
      ctx.fillStyle = `rgba(255, 59, 48, ${glowA})`;
      ctx.fillRect(0, 0, 26, VIEW.height);
      ctx.fillStyle = `rgba(47, 111, 208, ${glowA})`;
      ctx.fillRect(VIEW.width - 26, 0, 26, VIEW.height);
    } else {
      ctx.fillStyle = `rgba(255, 154, 60, ${glowA})`;
      ctx.fillRect(0, 0, 26, VIEW.height);
      ctx.fillRect(VIEW.width - 26, 0, 26, VIEW.height);
    }
    const bw = 480;
    const bx = (VIEW.width - bw) / 2;
    ctx.fillStyle = 'rgba(20, 26, 34, 0.92)';
    ctx.fillRect(bx, 190, bw, 44);
    ctx.strokeStyle = w.kind === 'police' ? (flash ? '#ff3b30' : '#2f6fd0') : '#ff9a3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, 190, bw, 44);
    text(ctx, w.text, VIEW.width / 2, 218, 20, '#ffffff', 'center');
  }
  // Bottom-left: day/night icon, clock, district, speed. The sun by day,
  // the moon by night — the corner always says which half of the day it is.
  const day = daylight(state);
  text(ctx, `${day.icon} ${clockText(state.clockMin)}  •  ${districtAt(p.x, p.y)}`, 24, VIEW.height - 20, 17, PALETTE.text, 'left');
  if (!p.onFoot && p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.22);
    text(ctx, `${kmh} km/h`, 24, VIEW.height - 48, 22, PALETTE.text, 'left');
    if (p.car.health < 55) text(ctx, 'CAR DAMAGED', 24, VIEW.height - 74, 16, '#ff6b5e', 'left');
  }
  // Prompts: a storefront to buy from, or the food truck to eat at.
  if (p.onFoot) {
    for (const shop of STOREFRONTS) {
      const dx = p.x - shop.x;
      const dy = p.y - shop.y;
      if (dx * dx + dy * dy < 70 * 70) {
        text(ctx, `E — ${shop.name}: $${shop.price} (+${shop.health} health)`, VIEW.width / 2, VIEW.height - 240, 17, PALETTE.panelEdge, 'center');
      }
    }
    if (state.nearFood) {
      text(ctx, 'Food truck — eating, health coming back…', VIEW.width / 2, VIEW.height - 240, 17, '#7ee081', 'center');
    }
  }
  if (p.inSafehouse) {
    text(ctx, 'SAFEHOUSE — game saved', VIEW.width / 2, VIEW.height - 190, 20, '#7ee081', 'center');
  }
  // A stunt ramp ahead: hit it at speed and the car flies.
  if (!p.onFoot && p.car && !p.car.air) {
    const near = nearestRamp(p.x, p.y);
    if (near.dist < 150 && Math.abs(p.car.speed) < 240) {
      text(ctx, 'Ramp ahead — hit it at speed for a stunt jump!', VIEW.width / 2, VIEW.height - 240, 17, '#ff9a3c', 'center');
    }
  }
  // Controls hint, first minute only, on a dark strip so it reads over any ground.
  if (state.time < 45) {
    ctx.fillStyle = 'rgba(20, 26, 34, 0.75)';
    ctx.fillRect(VIEW.width / 2 - 330, VIEW.height - 216, 660, 30);
    text(ctx, 'WASD move/drive • E enter car • F shoot • Space handbrake • R radio • M map', VIEW.width / 2, VIEW.height - 194, 15, 'rgba(244,239,226,0.95)', 'center');
  }
  drawMinimap(ctx, state, state.mapBig);
  // "Mission Complete" panel: reward and run stats, a few seconds after a job.
  if (state.missionComplete && state.missionComplete.timer > 0) {
    const mc = state.missionComplete;
    ctx.globalAlpha = Math.min(1, mc.timer);
    panel(ctx, 440, 280, 400, 160);
    text(ctx, 'MISSION COMPLETE', 640, 326, 28, PALETTE.panelEdge, 'center');
    text(ctx, mc.title, 640, 360, 20, PALETTE.text, 'center');
    text(ctx, `+$${mc.reward}   •   Missions ${mc.missionsDone}/8   •   Cash $${mc.cash}`, 640, 396, 17, PALETTE.cash, 'center');
    ctx.globalAlpha = 1;
  }
}

function drawTitle(ctx, state) {
  panel(ctx, 240, 120, 800, 480);
  text(ctx, 'SUNPORT CITY', 640, 200, 64, PALETTE.panelEdge, 'center');
  text(ctx, 'An original open-world crime game', 640, 240, 22, PALETTE.text, 'center');
  text(ctx, 'New in town, $150 in your pocket, and a call from fixer Mara Voss.', 640, 282, 19, PALETTE.muted, 'center');
  text(ctx, 'Steal cars. Outrun the Sunport PD. Run her jobs. Own the city.', 640, 310, 19, PALETTE.muted, 'center');
  text(ctx, '8 story missions • police helicopters • street races • 3 radio stations', 640, 340, 17, PALETTE.panelEdge, 'center');
  text(ctx, 'Day & night • rain • taxi fares • hidden packages • food truck • stunt jumps', 640, 366, 17, PALETTE.panelEdge, 'center');
  const lines = [
    'WASD / arrows — walk and drive    •    E — enter / exit car',
    'F — punch / shoot (aim with mouse)    •    Space — handbrake',
    'R — radio    •    Shift — run    •    M — bigger map    •    N — mute    •    Esc — pause',
    'Reach your safehouse in Palm Heights to save your game.',
  ];
  lines.forEach((line, i) => text(ctx, line, 640, 398 + i * 28, 17, PALETTE.text, 'center'));
  text(ctx, 'Press Enter or click to start', 640, 520, 24, PALETTE.panelEdge, 'center');
  if (hasSave()) text(ctx, 'Press C to continue your saved game', 640, 552, 18, PALETTE.cash, 'center');
  if (state.storyDone) text(ctx, 'Story complete — free roam unlocked', 640, 580, 16, PALETTE.cash, 'center');
}

function drawPaused(ctx) {
  panel(ctx, 390, 260, 500, 200);
  text(ctx, 'PAUSED', 640, 330, 44, PALETTE.text, 'center');
  text(ctx, 'Press Esc or P to keep playing', 640, 380, 19, PALETTE.muted, 'center');
  text(ctx, 'Your progress saves at the safehouse', 640, 412, 17, PALETTE.muted, 'center');
}

function drawEnd(ctx, state, kind) {
  panel(ctx, 340, 230, 600, 260);
  if (kind === 'busted') {
    text(ctx, 'BUSTED', 640, 310, 52, '#7aa8ff', 'center');
    text(ctx, 'The Sunport PD caught you. Mara Voss posts your bail —', 640, 356, 18, PALETTE.text, 'center');
    text(ctx, 'but the heat, and your cash, take a hit.', 640, 384, 18, PALETTE.text, 'center');
  } else {
    text(ctx, 'WASTED', 640, 310, 52, '#ff6b5e', 'center');
    text(ctx, 'Sunport City is not kind to the careless.', 640, 356, 18, PALETTE.text, 'center');
    text(ctx, 'You wake up at the clinic, lighter in the pocket.', 640, 384, 18, PALETTE.text, 'center');
  }
  text(ctx, `Cash $${Math.floor(state.cash)}  •  Missions done ${state.stats.missionsDone}`, 640, 428, 18, PALETTE.muted, 'center');
  text(ctx, 'Press Enter to get back out there', 640, 462, 22, PALETTE.panelEdge, 'center');
}

/** Draw the HUD (and the panel for the current screen) in screen space. */
export function drawHud(ctx, state, screen) {
  if (screen === 'title') {
    drawTitle(ctx, state);
    return;
  }
  drawHudPlay(ctx, state);
  if (screen === 'paused') drawPaused(ctx);
  else if (screen === 'busted') drawEnd(ctx, state, 'busted');
  else if (screen === 'wasted') drawEnd(ctx, state, 'wasted');
  if (state.storyDone && screen === 'play') {
    text(ctx, '★ STORY COMPLETE — SUNPORT IS YOURS ★', VIEW.width / 2, 150, 18, PALETTE.panelEdge, 'center');
  }
  // The ending screen after the Kingpin finale, until Enter dismisses it.
  if (state.ending && screen === 'play') {
    const e = state.ending;
    panel(ctx, 340, 190, 600, 320);
    text(ctx, 'SUNPORT KINGPIN', 640, 262, 44, PALETTE.panelEdge, 'center');
    text(ctx, 'Mara Voss: "Sunport is yours now. Eight jobs,', 640, 308, 18, PALETTE.text, 'center');
    text(ctx, 'five stars of heat, and you walked away clean."', 640, 334, 18, PALETTE.text, 'center');
    text(ctx, `Missions ${e.missionsDone}/8  •  Cash $${e.cash}  •  Earned $${e.earned}`, 640, 380, 18, PALETTE.cash, 'center');
    text(ctx, `Cars stolen ${e.stolen}  •  Rank KINGPIN`, 640, 410, 18, PALETTE.muted, 'center');
    text(ctx, 'Press Enter to keep roaming Sunport City', 640, 462, 20, PALETTE.panelEdge, 'center');
  }
}
