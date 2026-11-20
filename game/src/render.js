// Drawing only: the world state in, pixels out. The camera shows a 1280x720
// window of the 3200x2400 city, scaled to fit the browser window. Flat shapes and
// canvas text — no images, no network. The HUD lives in hud.js; this file paints
// the city, the cars, the people and the effects.
import { DISTRICTS, FONT, FOOD_TRUCK, HELI, PALETTE, PLACES, ROAD, STOREFRONTS, VIEW, WORLD } from './config.js';
import { currentTarget } from './missions.js';
import { SIDE_SPOTS } from './missions.js';
import { STUNT_RAMPS } from './stunts.js';
import { inSafehouse } from './city.js';
import { daylight, lightPhase } from './daynight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  /** The last world transform, so the pointer can be mapped back to the world. */
  let lastTransform = { eff: 1, e: 0, f: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** A stable per-building number from its position, for rooftop details. */
  function roofHash(b) {
    let h = (b.x * 374761393 + b.y * 668265263 + b.w * 974634211 + b.h * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /** A rooftop AC unit: a pale box with a dark fan dot. */
  function roofAC(x, y) {
    context.fillStyle = '#c8c4b8';
    context.fillRect(x, y, 18, 13);
    context.fillStyle = '#5a5a60';
    context.beginPath();
    context.arc(x + 9, y + 6, 4, 0, Math.PI * 2);
    context.fill();
  }

  /** A small rooftop vent: a dark pipe with a lighter rim. */
  function roofVent(x, y) {
    context.fillStyle = '#8a8578';
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4a463e';
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawGround(state) {
    const city = state.city;
    // District ground tints.
    for (const d of DISTRICTS) {
      context.fillStyle = d.tint;
      context.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    }
    // Water on the east edge.
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(city.water.x, city.water.y, city.water.w, city.water.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(city.water.x + 14, city.water.y, city.water.w - 14, city.water.h);
    // Beach strip.
    context.fillStyle = PALETTE.sand;
    context.fillRect(city.water.x - 26, 0, 26, WORLD.height);
    // Roads: vertical roads run full-length (the spine); horizontal roads
    // are drawn only between vertical roads, so an intersection is one
    // flat asphalt square — no sidewalk band or lane line crossing it.
    // The old full-length strips made intersections read as two stacked
    // roads, and the crossing dashes piled up on each other.
    const half = ROAD.width / 2;
    const sw = half + 10;
    for (const vx of city.lines.vertical) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(vx - sw, 0, ROAD.width + 20, WORLD.height);
      context.fillStyle = PALETTE.road;
      context.fillRect(vx - half, 0, ROAD.width, WORLD.height);
    }
    const edges = [0, ...city.lines.vertical, WORLD.width];
    for (const hy of city.lines.horizontal) {
      for (let i = 0; i < edges.length - 1; i += 1) {
        const x0 = edges[i] === 0 ? 0 : edges[i] + half;
        const x1 = edges[i + 1] === WORLD.width ? WORLD.width : edges[i + 1] - half;
        if (x1 - x0 < 8) continue;
        context.fillStyle = PALETTE.sidewalk;
        context.fillRect(x0, hy - sw, x1 - x0, ROAD.width + 20);
        context.fillStyle = PALETTE.road;
        context.fillRect(x0, hy - half, x1 - x0, ROAD.width);
      }
    }
    // Centre dashes: one shared 64 px pattern per road, but a dash never
    // enters an intersection, so dashes from crossing roads never overlap.
    context.fillStyle = PALETTE.roadLine;
    for (const vx of city.lines.vertical) {
      for (let y = 0; y < WORLD.height; y += 64) {
        if (city.lines.horizontal.some((hy) => y + 34 > hy - half - 4 && y < hy + half + 4)) continue;
        context.fillRect(vx - 3, y, 6, 34);
      }
    }
    for (const hy of city.lines.horizontal) {
      for (let x = 0; x < WORLD.width; x += 64) {
        if (city.lines.vertical.some((vx) => x + 34 > vx - half - 4 && x < vx + half + 4)) continue;
        context.fillRect(x, hy - 3, 34, 6);
      }
    }
    // Zebra crossings: white stripes across each road just outside every
    // intersection, where pedestrians cross. Never inside the intersection
    // square itself — the crossing stays flat like the rest of the junction.
    context.fillStyle = 'rgba(245, 245, 240, 0.9)';
    for (const vx of city.lines.vertical) {
      for (const hy of city.lines.horizontal) {
        // Across the vertical road, north and south of the junction.
        for (let sx = vx - half + 6; sx < vx + half - 6; sx += 16) {
          context.fillRect(sx, hy - half - 32, 9, 24);
          context.fillRect(sx, hy + half + 8, 9, 24);
        }
        // Across the horizontal road, west and east of the junction.
        for (let sy = hy - half + 6; sy < hy + half - 6; sy += 16) {
          context.fillRect(vx - half - 32, sy, 24, 9);
          context.fillRect(vx + half + 8, sy, 24, 9);
        }
      }
    }
    // Street lamps at every intersection: a faint dot by day, a real pool
    // of light at night, when the city needs them.
    const dark = daylight(state).darkness;
    const lampR = 26 + dark * 34;
    const lampA = 0.10 + dark * 0.35;
    for (const vx of city.lines.vertical) {
      for (const hy of city.lines.horizontal) {
        context.fillStyle = `rgba(255, 214, 120, ${lampA.toFixed(2)})`;
        context.beginPath();
        context.arc(vx + ROAD.width / 2 + 8, hy - ROAD.width / 2 - 8, lampR, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffe9a8';
        context.beginPath();
        context.arc(vx + ROAD.width / 2 + 8, hy - ROAD.width / 2 - 8, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Wet-road sheen in Marina Row: the evening light on the harbour roads.
    context.fillStyle = PALETTE.wetSheen;
    for (const hy of [200, 600]) {
      for (let x = 1700; x < 3100; x += 170) {
        context.fillRect(x, hy - 10, 64, 4);
        context.fillRect(x + 40, hy + 22, 44, 3);
      }
    }
    for (const vx of [1800, 2200, 2600, 3000]) {
      for (let y = 120; y < 900; y += 170) {
        context.fillRect(vx - 10, y, 4, 56);
      }
    }
    // Rain: the roads go dark and glossy, with pale glints along the lanes.
    if (state.weather && state.weather.kind === 'rain') {
      context.fillStyle = 'rgba(10, 20, 40, 0.16)';
      for (const vx of city.lines.vertical) context.fillRect(vx - half, 0, ROAD.width, WORLD.height);
      for (const hy of city.lines.horizontal) {
        for (let i = 0; i < edges.length - 1; i += 1) {
          const x0 = edges[i] === 0 ? 0 : edges[i] + half;
          const x1 = edges[i + 1] === WORLD.width ? WORLD.width : edges[i + 1] - half;
          if (x1 - x0 < 8) continue;
          context.fillRect(x0, hy - half, x1 - x0, ROAD.width);
        }
      }
      context.fillStyle = 'rgba(255, 255, 255, 0.14)';
      for (const vx of city.lines.vertical) {
        for (let y = 60; y < WORLD.height; y += 260) {
          context.fillRect(vx - 24, y, 48, 3);
          context.fillRect(vx + 8, y + 120, 30, 2);
        }
      }
    }
    // Sun glints on the water — only while the sun is up.
    context.fillStyle = `rgba(255, 244, 200, ${(0.35 * (1 - daylight(state).darkness)).toFixed(2)})`;
    for (let y = 90; y < WORLD.height; y += 130) {
      context.fillRect(city.water.x + 34, y, 52, 3);
      context.fillRect(city.water.x + 58, y + 58, 30, 3);
    }
    // District names painted on the ground.
    context.textAlign = 'center';
    for (const d of DISTRICTS) {
      text(d.name.toUpperCase(), (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 44, 'rgba(90, 70, 40, 0.28)', 'center');
    }
  }

  function drawBuildings(state) {
    const light = daylight(state);
    const sh = light.shadow;
    for (const b of state.city.buildings) {
      // The sun throws the shadow: long and slanted morning and evening,
      // short at noon — and at night there is no shadow at all, because
      // there is no sun. That is the whole day/night trick in one rect.
      if (sh.len > 0) {
        context.fillStyle = 'rgba(0,0,0,0.22)';
        context.fillRect(b.x + sh.dx, b.y + sh.dy, b.w, b.h);
      }
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(b.x, b.y, b.w, 10);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftops, seen from above: a parapet edge and rooftop kit (AC units,
      // vents, skylights, a water tank or a garden) — never windows. The old
      // window grid on the top face made the buildings read as if their
      // windows faced the sky; from above you only ever see a roof.
      context.strokeStyle = 'rgba(0,0,0,0.30)';
      context.lineWidth = 3;
      context.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.w > 70 && b.h > 60) {
        const rh = roofHash(b);
        const kind = b.height >= 3 ? 2 : rh % 4;
        const ix = b.x + 14;
        const iy = b.y + 16;
        if (kind === 0) {
          roofAC(ix + 6, iy + 6);
          roofAC(ix + b.w - 42, iy + 10);
          if (b.w > 140) roofAC(ix + Math.floor(b.w / 2) - 9, iy + b.h - 36);
        } else if (kind === 1) {
          context.fillStyle = 'rgba(190, 220, 235, 0.85)';
          context.fillRect(ix + 8, iy + 8, 26, 18);
          context.fillRect(ix + b.w - 48, iy + b.h - 36, 26, 18);
          roofVent(ix + Math.floor(b.w / 2), iy + Math.floor(b.h / 2));
        } else if (kind === 2) {
          context.fillStyle = '#4a4a52';
          context.beginPath();
          context.arc(ix + 22, iy + 22, 13, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = 'rgba(255,255,255,0.35)';
          context.beginPath();
          context.arc(ix + 18, iy + 18, 4, 0, Math.PI * 2);
          context.fill();
          roofAC(ix + b.w - 44, iy + b.h - 38);
        } else {
          context.fillStyle = 'rgba(93, 138, 74, 0.75)';
          context.fillRect(ix + 8, iy + 8, Math.max(30, b.w - 44), 20);
          context.fillStyle = 'rgba(71, 107, 57, 0.8)';
          context.beginPath();
          context.arc(ix + 22, iy + 18, 6, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.arc(ix + 48, iy + 18, 5, 0, Math.PI * 2);
          context.fill();
          roofVent(ix + b.w - 28, iy + b.h - 28);
        }
        // The little room on the roof: a lift machine room on tall
        // buildings, a stair bulkhead on small ones. In a screenshot it
        // reads as one small box — the detail that says "this is a roof".
        if (b.height >= 3) {
          const bx = b.x + Math.floor(b.w / 2) - 11;
          const by = b.y + Math.floor(b.h / 2) - 9;
          context.fillStyle = '#6a6a72';
          context.fillRect(bx - 4, by - 4, 30, 24);
          context.fillStyle = 'rgba(255,255,255,0.25)';
          context.fillRect(bx - 4, by - 4, 30, 5);
          context.strokeStyle = '#3a3a40';
          context.lineWidth = 2;
          context.strokeRect(bx - 4, by - 4, 30, 24);
          context.fillStyle = '#3a3a40';
          context.fillRect(bx + 8, by + 4, 6, 10);
        } else if (b.height === 1) {
          const bx = b.x + b.w - 40;
          const by = b.y + b.h - 34;
          context.fillStyle = '#7a7468';
          context.fillRect(bx, by, 22, 18);
          context.strokeStyle = '#454138';
          context.lineWidth = 2;
          context.strokeRect(bx, by, 22, 18);
          context.fillStyle = '#454138';
          context.fillRect(bx + 8, by + 5, 6, 8);
        }
      }
      // A neon sign on the south edge of a few Strip buildings, glowing
      // after dark: original names only.
      const rh2 = roofHash(b);
      if (rh2 % 7 === 0 && b.y + b.h < WORLD.height - 200) {
        const neon = PALETTE.neon[rh2 % PALETTE.neon.length];
        const names = ['TACOS', 'NEON', 'BAR', '24H'];
        const label = names[rh2 % names.length];
        const nx = b.x + Math.floor(b.w / 2) - 24;
        const ny = b.y + b.h - 4;
        if (light.isNight) {
          context.fillStyle = neon;
          context.globalAlpha = 0.35;
          context.fillRect(nx - 6, ny - 6, 60, 22);
          context.globalAlpha = 1;
        }
        context.fillStyle = neon;
        context.fillRect(nx, ny, 48, 10);
        text(label, nx + 24, ny + 9, 9, '#141414', 'center');
      }
    }
    for (const t of state.city.trees) {
      // Trees throw a shadow too — only while the sun is up.
      if (sh.len > 0) {
        context.fillStyle = PALETTE.treeDark;
        context.beginPath();
        context.arc(t.x + 3 + sh.dx * 0.3, t.y + 4 + sh.dy * 0.3, t.r, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** Stunt ramps: a yellow chevron wedge on the road, facing the jump. */
  function drawRamps() {
    for (const ramp of STUNT_RAMPS) {
      context.save();
      context.translate(ramp.x, ramp.y);
      context.rotate(ramp.angle);
      context.fillStyle = '#f2c230';
      context.fillRect(-30, -24, 60, 48);
      // Black chevrons pointing the way off the lip.
      context.fillStyle = '#1a1a1a';
      for (let i = 0; i < 3; i += 1) {
        const cx = -22 + i * 18;
        context.beginPath();
        context.moveTo(cx, -24);
        context.lineTo(cx + 10, 0);
        context.lineTo(cx, 24);
        context.lineTo(cx + 6, 24);
        context.lineTo(cx + 16, 0);
        context.lineTo(cx + 6, -24);
        context.closePath();
        context.fill();
      }
      // The lip: a darker edge the car leaves the ground from.
      context.fillStyle = '#b98a1d';
      context.fillRect(24, -24, 6, 48);
      context.strokeStyle = 'rgba(20,20,20,0.7)';
      context.lineWidth = 2;
      context.strokeRect(-30, -24, 60, 48);
      context.restore();
      // A small label above the ramp, so it reads as a feature, not a stain.
      text('JUMP', ramp.x, ramp.y - 34, 13, '#ff9a3c', 'center');
    }
  }

  function drawCarShape(car) {
    // An airborne car: its shadow stays on the ground while the body lifts
    // and grows a little, so the jump reads in a still frame.
    if (car.air && car.air.h > 1) {
      context.fillStyle = `rgba(0,0,0,${(0.30 * (1 - car.air.h / 60)).toFixed(2)})`;
      context.beginPath();
      context.ellipse(car.x, car.y + 6, car.length / 2, car.width / 2, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.save();
    if (car.air && car.air.h > 0) {
      const lift = car.air.h;
      context.translate(car.x, car.y - lift);
      const s = 1 + lift * 0.006;
      context.scale(s, s);
    } else {
      context.translate(car.x, car.y);
    }
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-car.length / 2 + 4, -car.width / 2 + 5, car.length, car.width, 8);
    context.fill();
    context.fillStyle = car.color;
    roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 8);
    context.fill();
    // Windshield and rear window.
    context.fillStyle = 'rgba(30,40,55,0.85)';
    context.fillRect(car.length / 2 - 20, -car.width / 2 + 5, 12, car.width - 10);
    context.fillRect(-car.length / 2 + 6, -car.width / 2 + 5, 10, car.width - 10);
    if (car.body === 'bus') {
      // A city bus: a long window strip down the side.
      context.fillStyle = 'rgba(200, 230, 245, 0.9)';
      context.fillRect(-car.length / 2 + 10, -car.width / 2 + 5, car.length - 32, 8);
      context.fillRect(-car.length / 2 + 10, car.width / 2 - 13, car.length - 32, 8);
    } else if (car.body === 'taxi') {
      // A taxi: a roof sign, so it reads as a cab from above.
      context.fillStyle = '#fff8c0';
      context.fillRect(-8, -6, 16, 12);
      context.fillStyle = '#222';
      text('TAXI', 0, 4, 8, '#222', 'center');
    } else if (car.body === 'truck') {
      // A box truck: the cargo box is a paler slab behind the cab.
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(-car.length / 2 + 4, -car.width / 2 + 4, car.length - 30, car.width - 8);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 2;
      context.strokeRect(-car.length / 2 + 4, -car.width / 2 + 4, car.length - 30, car.width - 8);
    }
    // Headlights.
    context.fillStyle = '#fff8c0';
    context.fillRect(car.length / 2 - 2, -car.width / 2 + 4, 3, 6);
    context.fillRect(car.length / 2 - 2, car.width / 2 - 10, 3, 6);
    if (car.kind === 'police') {
      context.fillStyle = '#f4f4f4';
      context.fillRect(-8, -car.width / 2, 16, car.width);
      context.fillStyle = PALETTE.policeCar;
      text('PD', 0, 5, 13, PALETTE.policeCar, 'center');
    }
    if (car.isTarget) {
      context.strokeStyle = '#ff4fd8';
      context.lineWidth = 3;
      roundRect(-car.length / 2 - 4, -car.width / 2 - 4, car.length + 8, car.width + 8, 10);
      context.stroke();
    }
    // Damage: a wrecked car is darker and tilted.
    if (car.health <= 0) {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 8);
      context.fill();
    } else if (car.health < 55) {
      context.fillStyle = 'rgba(0,0,0,0.2)';
      context.fillRect(-car.length / 2, -car.width / 2, car.length / 2, car.width);
    }
    // Crash damage that stays on the car: a dented rear panel and a
    // cracked windshield, so a hard hit is still visible afterwards.
    if (car.dented) {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(-car.length / 2 + 8, 0, 9, 11, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.beginPath();
      context.ellipse(-car.length / 2 + 16, -car.width / 2 + 6, 6, 4, 0, 0, Math.PI * 2);
      context.fill();
    }
    if (car.cracked) {
      // A spiderweb of cracks across the windshield.
      const wx = car.length / 2 - 14;
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(wx, 0);
      context.lineTo(wx - 6, -8);
      context.moveTo(wx, 0);
      context.lineTo(wx + 6, -7);
      context.moveTo(wx, 0);
      context.lineTo(wx - 6, 8);
      context.moveTo(wx, 0);
      context.lineTo(wx + 6, 7);
      context.moveTo(wx, 0);
      context.lineTo(wx - 2, -11);
      context.moveTo(wx, 0);
      context.lineTo(wx + 2, 11);
      context.stroke();
    }
    // A fresh hit flashes white on the car, so a rear-end ram is visible.
    if (car.flash > 0) {
      context.globalAlpha = Math.min(0.55, car.flash * 2);
      context.fillStyle = '#ffffff';
      roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 8);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = '#ff5a3c';
      context.lineWidth = 2;
      roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 8);
      context.stroke();
    }
    context.restore();
  }

  function drawPedShape(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.dead) {
      context.rotate(Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(20,20,20,0.6)';
      context.lineWidth = 2;
      context.stroke();
      context.restore();
      return;
    }
    if (ped.state === 'stumble') {
      // Knocked down by a car: flat on the road, seeing stars, then up
      // and running. Cartoonish, no blood — they always get back up.
      context.rotate(Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(20,20,20,0.6)';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(12, 0, 5.5, 0, Math.PI * 2);
      context.fill();
      // Dizzy stars circling the head.
      context.fillStyle = '#ffd23f';
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2 + (ped.stumbleTimer || 0) * 4;
        context.beginPath();
        context.arc(12 + Math.cos(a) * 10, Math.sin(a) * 10, 2.5, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      return;
    }
    // Soft ground shadow, so the walker reads against any ground or road.
    context.fillStyle = 'rgba(0,0,0,0.30)';
    context.beginPath();
    context.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(ped.angle);
    context.fillStyle = ped.armed ? '#c0392b' : ped.color;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(20,20,20,0.65)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(5, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(20,20,20,0.5)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = '#222';
    context.fillRect(9, -2, 8, 4);
    context.restore();
  }

  function drawMarkers(state) {
    const cam = state.camera;
    const target = currentTarget(state);
    const time = state.time;
    // Safehouse.
    const sh = PLACES.safehouse;
    context.save();
    context.strokeStyle = '#2fae4e';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(sh.x, sh.y, 46 + Math.sin(time * 2) * 4, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#2fae4e';
    text('H', sh.x, sh.y + 10, 30, '#2fae4e', 'center');
    context.restore();
    // Side-job spots.
    if (!state.side) {
      for (const spot of SIDE_SPOTS) {
        context.fillStyle = '#7a3fd0';
        context.beginPath();
        context.arc(spot.x, spot.y, 20, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff';
        text(spot.kind === 'taxi' ? 'T' : spot.kind === 'packages' ? 'P' : 'V', spot.x, spot.y + 7, 20, '#fff', 'center');
      }
    }
    // Pickups.
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(time * 3 + pk.x) * 3;
      context.fillStyle = '#ffd23f';
      context.beginPath();
      context.moveTo(pk.x, pk.y - 14 + bob);
      context.lineTo(pk.x + 12, pk.y + bob);
      context.lineTo(pk.x, pk.y + 14 + bob);
      context.lineTo(pk.x - 12, pk.y + bob);
      context.closePath();
      context.fill();
      context.strokeStyle = '#8a6d00';
      context.lineWidth = 2;
      context.stroke();
    }
    // Sunport packages: ten hidden glowing parcels around the city.
    // Collect all ten for a $500 bonus.
    if (state.sunportPackages) {
      for (const pk of state.sunportPackages) {
        if (pk.taken) continue;
        const bob = Math.sin(time * 3 + pk.x * 0.7) * 3;
        const glow = 16 + Math.sin(time * 4 + pk.y) * 4;
        context.fillStyle = 'rgba(255, 210, 63, 0.30)';
        context.beginPath();
        context.arc(pk.x, pk.y + bob, glow, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffd23f';
        context.beginPath();
        context.moveTo(pk.x, pk.y - 12 + bob);
        context.lineTo(pk.x + 10, pk.y + bob);
        context.lineTo(pk.x, pk.y + 12 + bob);
        context.lineTo(pk.x - 10, pk.y + bob);
        context.closePath();
        context.fill();
        context.strokeStyle = '#8a6d00';
        context.lineWidth = 2;
        context.stroke();
      }
    }
    // The taxi passenger waiting at the stand (hidden while a fare runs).
    if (state.taxiPassenger && !state.side) {
      const tp = state.taxiPassenger;
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(tp.x, tp.y, 22 + Math.sin(time * 3) * 3, 0, Math.PI * 2);
      context.stroke();
      drawPedShape({ x: tp.x, y: tp.y, angle: -Math.PI / 2, color: '#ffd23f', armed: false, dead: false });
      text('TAXI', tp.x, tp.y - 26, 14, '#ffd23f', 'center');
    }
    // Storefronts on the sidewalk edge: a striped awning and a painted sign.
    for (const shop of STOREFRONTS) {
      context.fillStyle = shop.color;
      context.fillRect(shop.x - 30, shop.y - 8, 60, 14);
      context.fillStyle = 'rgba(255,255,255,0.65)';
      for (let sx = shop.x - 30; sx < shop.x + 30; sx += 12) {
        context.fillRect(sx, shop.y - 8, 6, 14);
      }
      context.fillStyle = '#141414';
      context.fillRect(shop.x - 34, shop.y - 24, 68, 14);
      text(shop.name, shop.x, shop.y - 13, 10, '#f4efe2', 'center');
    }
    // The food truck by Central Plaza: eat here to get your health back.
    {
      const ft = FOOD_TRUCK;
      context.save();
      context.translate(ft.x, ft.y);
      context.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(-38, -14, 80, 34, 8);
      context.fill();
      context.fillStyle = '#e8e8e8';
      roundRect(-40, -18, 80, 34, 8);
      context.fill();
      context.fillStyle = '#e84c3d';
      context.fillRect(-40, -18, 80, 12);
      context.fillStyle = '#2f8f7a';
      context.fillRect(-40, -6, 80, 6);
      context.fillStyle = '#141414';
      text('FOOD', 0, 12, 12, '#141414', 'center');
      context.restore();
    }
    // Mission / side-job target: a pulsing ring, or an edge arrow when off-screen.
    if (target) {
      const pulse = 26 + Math.sin(time * 4) * 6;
      const inView = target.x >= cam.x - 40 && target.x <= cam.x + VIEW.width + 40
        && target.y >= cam.y - 40 && target.y <= cam.y + VIEW.height + 40;
      if (inView) {
        context.strokeStyle = PALETTE.marker;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(target.x, target.y, pulse, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = PALETTE.marker;
        context.beginPath();
        context.moveTo(target.x, target.y - 18);
        context.lineTo(target.x + 12, target.y + 10);
        context.lineTo(target.x - 12, target.y + 10);
        context.closePath();
        context.fill();
      } else {
        // Arrow at the screen edge pointing at the target.
        const cx = cam.x + VIEW.width / 2;
        const cy = cam.y + VIEW.height / 2;
        const a = Math.atan2(target.y - cy, target.x - cx);
        const ax = cx + Math.cos(a) * (VIEW.width / 2 - 60);
        const ay = cy + Math.sin(a) * (VIEW.height / 2 - 60);
        context.save();
        context.translate(ax, ay);
        context.rotate(a);
        context.fillStyle = PALETTE.marker;
        context.beginPath();
        context.moveTo(18, 0);
        context.lineTo(-12, -14);
        context.lineTo(-12, 14);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
    void inSafehouse;
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      context.globalAlpha = alpha;
      if (pt.kind === 'star') {
        // A 4-point impact star: bright, so a crash reads in a still frame.
        context.strokeStyle = pt.color;
        context.lineWidth = 3;
        const s = pt.size;
        context.beginPath();
        context.moveTo(pt.x - s, pt.y);
        context.lineTo(pt.x + s, pt.y);
        context.moveTo(pt.x, pt.y - s);
        context.lineTo(pt.x, pt.y + s);
        context.stroke();
        context.fillStyle = pt.color;
        context.beginPath();
        context.arc(pt.x, pt.y, s * 0.35, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size * (pt.kind === 'smoke' ? 1 + (1 - alpha) : 1), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHelicopter(state, h) {
    const p = state.player;
    // Long shadow on the ground, thrown by the low sun — gone at night.
    const heliDark = daylight(state).darkness;
    context.fillStyle = `rgba(0,0,0,${(0.20 * (1 - heliDark)).toFixed(2)})`;
    context.beginPath();
    context.ellipse(h.x + 26, h.y + 34, 34, 12, 0, 0, Math.PI * 2);
    context.fill();
    // Spotlight cone down onto the player, and its pool of light.
    context.fillStyle = PALETTE.spotlight;
    context.beginPath();
    context.moveTo(h.x - 8, h.y + 6);
    context.lineTo(h.x + 8, h.y + 6);
    context.lineTo(p.x + HELI.spotRadius, p.y + HELI.spotRadius * 0.7);
    context.lineTo(p.x - HELI.spotRadius, p.y + HELI.spotRadius * 0.7);
    context.closePath();
    context.fill();
    context.beginPath();
    context.ellipse(p.x, p.y, HELI.spotRadius, HELI.spotRadius * 0.7, 0, 0, Math.PI * 2);
    context.fill();
    // The helicopter itself: body, tail, spinning rotor, blinking light.
    context.save();
    context.translate(h.x, h.y + h.bob * 0.4);
    context.rotate(h.angle);
    context.fillStyle = PALETTE.heli;
    context.beginPath();
    context.ellipse(0, 0, 34, 17, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-56, -4, 26, 8);
    context.fillStyle = '#9fc4e8';
    context.beginPath();
    context.ellipse(15, 0, 12, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = 'bold 14px sans-serif';
    context.textAlign = 'center';
    context.fillText('PD', -5, 5);
    context.restore();
    context.save();
    context.translate(h.x, h.y + h.bob * 0.4);
    context.rotate(h.rotor);
    context.strokeStyle = 'rgba(40, 48, 60, 0.8)';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-44, 0);
    context.lineTo(44, 0);
    context.stroke();
    context.restore();
    if (Math.sin(state.time * 6 + h.phase) > 0) {
      context.fillStyle = PALETTE.heliLight;
      context.beginPath();
      context.arc(h.x, h.y + h.bob * 0.4, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** Traffic lights at the four central intersections, cycling red/yellow/green. */
  function drawTrafficLights(state) {
    for (const light of state.city.trafficLights) {
      const phase = lightPhase(state, light);
      const px = light.x + ROAD.width / 2 + 10;
      const py = light.y - ROAD.width / 2 - 10;
      // The pole.
      context.fillStyle = '#2a2a2a';
      context.fillRect(px - 2, py - 6, 4, 26);
      // The housing with three lamps; the live one is bright.
      context.fillStyle = '#141414';
      roundRect(px - 8, py - 26, 16, 26, 4);
      context.fill();
      const lamps = [phase.v === 'red' ? '#ff3b30' : '#5a2a28', phase.v === 'yellow' ? '#ffd23f' : '#5a4a28', phase.v === 'green' ? '#58c96b' : '#284a2a'];
      for (let i = 0; i < 3; i += 1) {
        context.fillStyle = lamps[i];
        context.beginPath();
        context.arc(px, py - 20 + i * 8, 4, 0, Math.PI * 2);
        context.fill();
      }
      // A red light throws a small red pool on the road below it.
      if (phase.v === 'red') {
        context.fillStyle = 'rgba(255, 59, 48, 0.18)';
        context.beginPath();
        context.arc(light.x, light.y, 26, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** Paint the world through the camera. Assumes the caller set the transform. */
  function drawWorld(state) {
    drawGround(state);
    drawRamps();
    drawBuildings(state);
    drawTrafficLights(state);
    drawMarkers(state);
    // Skid marks from handbrake turns, fading as they age.
    for (const skid of state.skids) {
      context.save();
      context.translate(skid.x, skid.y);
      context.rotate(skid.angle);
      context.globalAlpha = (skid.life / skid.maxLife) * 0.35;
      context.fillStyle = '#141414';
      context.fillRect(-22, -4, 44, 7);
      context.restore();
    }
    context.globalAlpha = 1;
    for (const car of state.cars) drawCarShape(car);
    for (const officer of state.police) {
      context.fillStyle = PALETTE.police;
      context.beginPath();
      context.arc(officer.x, officer.y, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#dfe8f4';
      context.beginPath();
      context.arc(officer.x, officer.y, 6, 0, Math.PI * 2);
      context.fill();
    }
    for (const ped of state.peds) drawPedShape(ped);
    // The player on foot: a bright figure with a facing tick.
    const p = state.player;
    if (p.onFoot) {
      context.save();
      context.translate(p.x, p.y);
      if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) context.globalAlpha = 0.35;
      context.rotate(p.angle);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(0, 0, 14, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#222';
      context.fillRect(10, -3, 12, 6);
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(2, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // Bullets.
    context.fillStyle = '#ffe66d';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Helicopters fly above the street, spotlights and all.
    for (const h of state.helis) drawHelicopter(state, h);
    // A spotlight sweeping the ground ahead of an inbound helicopter:
    // the warning that the eye in the sky is about to arrive.
    if (state.heliSweep && state.heliSweep.timer > 0) {
      const s = state.heliSweep;
      const prog = 1 - s.timer / s.duration;
      const sx = s.x + (state.player.x - s.x) * prog;
      const sy = s.y + (state.player.y - s.y) * prog;
      context.fillStyle = PALETTE.spotlight;
      context.beginPath();
      context.ellipse(sx, sy, 130, 90, 0, 0, Math.PI * 2);
      context.fill();
    }
    drawParticles(state);
    // The day/night wash over the whole frame: warm by day, dark blue at
    // night. Day and night must read differently at a glance.
    const zoom = state.zoom || 1;
    const light = daylight(state);
    const vx0 = state.camera.x;
    const vy0 = state.camera.y;
    const vw = VIEW.width / zoom;
    const vh = VIEW.height / zoom;
    if (light.tint.alpha > 0.005) {
      context.fillStyle = light.tint.color + light.tint.alpha.toFixed(2) + ')';
      context.fillRect(vx0, vy0, vw, vh);
    }
    // Night lights, painted over the dark wash so they punch through:
    // lamp pools at the intersections, headlight cones in front of every
    // car (the player's are brighter), and a stronger heli spotlight.
    if (light.isNight) {
      for (const lx of state.city.lines.vertical) {
        for (const ly of state.city.lines.horizontal) {
          context.fillStyle = 'rgba(255, 214, 120, 0.30)';
          context.beginPath();
          context.arc(lx + ROAD.width / 2 + 8, ly - ROAD.width / 2 - 8, 58, 0, Math.PI * 2);
          context.fill();
        }
      }
      for (const car of state.cars) {
        const bright = car.kind === 'player' ? 0.34 : 0.22;
        const reach = car.kind === 'player' ? 150 : 100;
        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.angle);
        context.fillStyle = `rgba(255, 240, 170, ${bright})`;
        context.beginPath();
        context.moveTo(car.length / 2, -10);
        context.lineTo(car.length / 2 + reach, -34);
        context.lineTo(car.length / 2 + reach, 34);
        context.lineTo(car.length / 2, 10);
        context.closePath();
        context.fill();
        context.restore();
      }
      for (const h of state.helis) {
        context.fillStyle = 'rgba(255, 240, 170, 0.30)';
        context.beginPath();
        context.ellipse(state.player.x, state.player.y, HELI.spotRadius, HELI.spotRadius * 0.7, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Rain, drawn in the air above everything: streaks slanting down and
    // splash rings where they land. Positions are a pure function of time,
    // so a staged screenshot gets the same rain every time.
    if (state.weather && state.weather.kind === 'rain') {
      const intensity = state.weather.intensity || 0.7;
      const count = Math.floor(150 * intensity);
      const t = state.time;
      context.strokeStyle = PALETTE.rainStreak;
      context.lineWidth = 2;
      context.beginPath();
      for (let i = 0; i < count; i += 1) {
        const hx = (i * 997.3) % 1000;
        const hy = (i * 613.7) % 1000;
        const x = vx0 + ((hx + t * 140) % vw);
        const y = vy0 + ((hy + t * 900) % vh);
        context.moveTo(x, y);
        context.lineTo(x - 6, y + 18);
      }
      context.stroke();
      context.strokeStyle = PALETTE.rainSplash;
      context.lineWidth = 1;
      context.beginPath();
      for (let i = 0; i < 36; i += 1) {
        const hx = (i * 331.7) % 1000;
        const hy = (i * 771.3) % 1000;
        const x = vx0 + ((hx + t * 140) % vw);
        const y = vy0 + ((hy + t * 900) % vh);
        const r = 3 + ((t * 8 + i) % 5);
        context.moveTo(x + r, y);
        context.arc(x, y, r, 0, Math.PI * 2);
      }
      context.stroke();
      // A lightning flash, briefly, while the storm is on.
      if (state.lightning > 0) {
        context.fillStyle = `rgba(255, 255, 255, ${(state.lightning * 1.2).toFixed(2)})`;
        context.fillRect(vx0, vy0, vw, vh);
      }
    }
  }

  /** Switch the transform to the camera (world space). */
  function toWorld(state) {
    const cam = state.camera;
    const zoom = state.zoom || 1;
    const eff = view.scale * zoom;
    const visibleW = VIEW.width / zoom;
    const visibleH = VIEW.height / zoom;
    const cx = cam.x + visibleW / 2;
    const cy = cam.y + visibleH / 2;
    const scx = view.x + (VIEW.width * view.scale) / 2;
    const scy = view.y + (VIEW.height * view.scale) / 2;
    // Screen shake: a few pixels of jitter while the timer runs.
    let ox = 0;
    let oy = 0;
    if (state.shake && state.shake.timer > 0) {
      ox = (Math.random() - 0.5) * state.shake.mag * 2;
      oy = (Math.random() - 0.5) * state.shake.mag * 2;
    }
    const e = scx - cx * eff + ox;
    const f = scy - cy * eff + oy;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(eff, 0, 0, eff, e, f);
    lastTransform = { eff, e, f };
  }

  /** Screen pixels (as the pointer reports them) back to world coordinates. */
  function screenToWorld(mx, my) {
    const t = lastTransform;
    return { x: (mx - t.e) / t.eff, y: (my - t.f) / t.eff };
  }

  /** Switch the transform to logical screen space (1280x720). */
  function toScreen() {
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawWorld, toWorld, toScreen, screenToWorld, view, ctx: context };
}
