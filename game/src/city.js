// Sunport City itself: a 3200x2400 coastal grid city. Roads run on a 400 px grid,
// blocks between them hold buildings, trees and parked cars, and the east edge is
// Marina Row's water. Everything is generated once from a seed, so the same seed
// always builds the same city.
import { DISTRICTS, PALETTE, PLACES, ROAD, WORLD } from './config.js';
import { clamp, randomInt, randomPick } from './random.js';

const ROAD_HALF = ROAD.width / 2;

/** The road lines of the grid, in world coordinates. */
export function roadLines() {
  const vertical = [];
  const horizontal = [];
  for (let x = ROAD.first; x < WORLD.width; x += ROAD.spacing) vertical.push(x);
  for (let y = ROAD.first; y < WORLD.height; y += ROAD.spacing) horizontal.push(y);
  return { vertical, horizontal };
}

export function createCity(random) {
  const lines = roadLines();
  const buildings = [];
  const trees = [];
  const parkedSpots = [];

  // One or two buildings per block, with a gap for a yard or a parking spot.
  for (let vi = 0; vi < lines.vertical.length - 1; vi += 1) {
    for (let hi = 0; hi < lines.horizontal.length - 1; hi += 1) {
      const x0 = lines.vertical[vi] + ROAD_HALF + 26;
      const x1 = lines.vertical[vi + 1] - ROAD_HALF - 26;
      const y0 = lines.horizontal[hi] + ROAD_HALF + 26;
      const y1 = lines.horizontal[hi + 1] - ROAD_HALF - 26;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const count = random() < 0.45 ? 1 : 2;
      for (let b = 0; b < count; b += 1) {
        const w = randomInt(random, 90, Math.max(95, Math.floor((x1 - x0) / count) - 24));
        const h = randomInt(random, 80, Math.max(85, y1 - y0 - 24));
        const x = count === 1
          ? x0 + Math.floor((x1 - x0 - w) / 2)
          : x0 + b * Math.floor((x1 - x0) / count) + 8;
        const y = y0 + randomInt(random, 4, Math.max(5, y1 - y0 - h - 4));
        buildings.push({
          x, y, w, h,
          color: randomPick(random, PALETTE.buildingRoof),
          height: randomInt(random, 1, 3),
        });
      }
      // A tree or two on the block's sidewalk edge.
      if (random() < 0.7) {
        trees.push({ x: x0 + randomInt(random, 0, x1 - x0), y: y0 - 14, r: 12 });
      }
      if (random() < 0.5) {
        trees.push({ x: x0 + randomInt(random, 0, x1 - x0), y: y1 + 14, r: 12 });
      }
    }
  }

  // Parked cars sit along the roads, just off the driving lane.
  for (let i = 0; i < 26; i += 1) {
    const vertical = random() < 0.5;
    const line = randomPick(random, vertical ? lines.vertical : lines.horizontal);
    const along = randomInt(random, 260, (vertical ? WORLD.height : WORLD.width) - 260);
    const offset = (random() < 0.5 ? -1 : 1) * (ROAD_HALF - 18);
    parkedSpots.push({
      x: vertical ? line + offset : along,
      y: vertical ? along : line + offset,
      angle: vertical ? (offset > 0 ? Math.PI / 2 : -Math.PI / 2) : (offset > 0 ? 0 : Math.PI),
    });
  }

  const water = { x: WORLD.width - 120, y: 0, w: 120, h: WORLD.height };

  return { lines, buildings, trees, parkedSpots, water, width: WORLD.width, height: WORLD.height };
}

/** The district a point is in, by name. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Sunport City';
}

/** True when a point is on a road (within the driving lane). */
export function isOnRoad(city, x, y) {
  for (const vx of city.lines.vertical) if (Math.abs(x - vx) <= ROAD_HALF) return true;
  for (const hy of city.lines.horizontal) if (Math.abs(y - hy) <= ROAD_HALF) return true;
  return false;
}

/** The nearest road line to a point, as {axis:'v'|'h', coord}. */
export function nearestRoad(city, x, y) {
  let best = { axis: 'v', coord: city.lines.vertical[0], d: Infinity };
  for (const vx of city.lines.vertical) {
    const d = Math.abs(x - vx);
    if (d < best.d) best = { axis: 'v', coord: vx, d };
  }
  for (const hy of city.lines.horizontal) {
    const d = Math.abs(y - hy);
    if (d < best.d) best = { axis: 'h', coord: hy, d };
  }
  return best;
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(city, random) {
  const vertical = random() < 0.5;
  if (vertical) {
    return {
      x: randomPick(random, city.lines.vertical) + randomInt(random, -24, 24),
      y: randomInt(random, 120, WORLD.height - 120),
    };
  }
  return {
    x: randomInt(random, 120, WORLD.width - 160),
    y: randomPick(random, city.lines.horizontal) + randomInt(random, -24, 24),
  };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(city, random) {
  const p = randomRoadPoint(city, random);
  const road = nearestRoad(city, p.x, p.y);
  if (road.axis === 'v') p.x += (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 12);
  else p.y += (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 12);
  p.x = clamp(p.x, 40, WORLD.width - 160);
  p.y = clamp(p.y, 40, WORLD.height - 40);
  return p;
}

/** True when a circle overlaps any building or the water. */
export function hitsSolid(city, x, y, r) {
  if (x - r < 0 || x + r > WORLD.width || y - r < 0 || y + r > WORLD.height) return true;
  if (x + r > city.water.x && y > city.water.y && y < city.water.y + city.water.h) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/**
 * Push a circle out of buildings, the water and the world edge. Returns the
 * corrected {x, y}. A circle fully inside a building is pushed to its nearest edge.
 */
export function resolveCircle(city, x, y, r) {
  let nx = clamp(x, r, WORLD.width - r);
  let ny = clamp(y, r, WORLD.height - r);
  if (nx + r > city.water.x) nx = city.water.x - r;
  for (const b of city.buildings) {
    if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
      const pushLeft = nx + r - b.x;
      const pushRight = b.x + b.w - (nx - r);
      const pushUp = ny + r - b.y;
      const pushDown = b.y + b.h - (ny - r);
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) nx = b.x - r;
      else if (min === pushRight) nx = b.x + b.w + r;
      else if (min === pushUp) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return { x: nx, y: ny };
}

/** The safehouse zone: a circle around the Palm Heights house. */
export function inSafehouse(x, y) {
  const dx = x - PLACES.safehouse.x;
  const dy = y - PLACES.safehouse.y;
  return dx * dx + dy * dy < 130 * 130;
}
