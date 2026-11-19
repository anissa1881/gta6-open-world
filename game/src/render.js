// Drawing only: the world state in, pixels out. The camera shows a 1280x720
// window of the 3200x2400 city, scaled to fit the browser window. Flat shapes and
// canvas text — no images, no network. The HUD lives in hud.js; this file paints
// the city, the cars, the people and the effects.
import { DISTRICTS, FONT, PALETTE, PLACES, ROAD, VIEW, WORLD } from './config.js';
import { currentTarget } from './missions.js';
import { SIDE_SPOTS } from './missions.js';
import { inSafehouse } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

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
    // Roads: sidewalk border, then asphalt, then centre dashes.
    for (const vx of city.lines.vertical) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(vx - ROAD.width / 2 - 10, 0, ROAD.width + 20, WORLD.height);
      context.fillStyle = PALETTE.road;
      context.fillRect(vx - ROAD.width / 2, 0, ROAD.width, WORLD.height);
    }
    for (const hy of city.lines.horizontal) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, hy - ROAD.width / 2 - 10, WORLD.width, ROAD.width + 20);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, hy - ROAD.width / 2, WORLD.width, ROAD.width);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const vx of city.lines.vertical) {
      for (let y = 0; y < WORLD.height; y += 64) {
        context.fillRect(vx - 3, y, 6, 34);
      }
    }
    for (const hy of city.lines.horizontal) {
      for (let x = 0; x < WORLD.width; x += 64) {
        context.fillRect(x, hy - 3, 34, 6);
      }
    }
    // District names painted on the ground.
    context.textAlign = 'center';
    for (const d of DISTRICTS) {
      text(d.name.toUpperCase(), (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 44, 'rgba(90, 70, 40, 0.28)', 'center');
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      // Shadow, then roof, then a darker top edge for a hint of height.
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(b.x, b.y, b.w, 10);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      if (b.height >= 2) {
        context.fillStyle = 'rgba(0,0,0,0.15)';
        for (let wy = b.y + 22; wy < b.y + b.h - 12; wy += 24) {
          for (let wx = b.x + 14; wx < b.x + b.w - 12; wx += 26) {
            context.fillRect(wx, wy, 10, 12);
          }
        }
      }
    }
    for (const t of state.city.trees) {
      context.fillStyle = PALETTE.treeDark;
      context.beginPath();
      context.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCarShape(car) {
    context.save();
    context.translate(car.x, car.y);
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
      context.restore();
      return;
    }
    context.rotate(ped.angle);
    context.fillStyle = ped.armed ? '#c0392b' : ped.color;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(4, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#222';
    context.fillRect(8, -2, 8, 4);
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
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size * (pt.kind === 'smoke' ? 1 + (1 - alpha) : 1), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  /** Paint the world through the camera. Assumes the caller set the transform. */
  function drawWorld(state) {
    drawGround(state);
    drawBuildings(state);
    drawMarkers(state);
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
    drawParticles(state);
  }

  /** Switch the transform to the camera (world space). */
  function toWorld(state) {
    const cam = state.camera;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - cam.x * view.scale, view.y - cam.y * view.scale);
  }

  /** Switch the transform to logical screen space (1280x720). */
  function toScreen() {
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawWorld, toWorld, toScreen, view, ctx: context };
}
