// Traffic: ordinary cars driving the road grid. Each one follows a road line in a
// lane, turns at intersections, and slows for the car ahead. They are the city's
// background life — and the cars the player steals.
import { PALETTE, TRAFFIC } from './config.js';
import { randomPick } from './random.js';
import { collideCars, createCar, updateCarSmoke } from './vehicles.js';

export function createTraffic(state) {
  const cars = [];
  const { city, rng } = state;
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const vertical = rng() < 0.5;
    const line = randomPick(rng, vertical ? city.lines.vertical : city.lines.horizontal);
    const along = 240 + rng() * ((vertical ? city.height : city.width) - 480);
    const dir = rng() < 0.5 ? -1 : 1;
    const lane = 20;
    const car = createCar(
      'traffic',
      vertical ? line + lane * (dir > 0 ? 1 : -1) : along,
      vertical ? along : line + lane * (dir > 0 ? 1 : -1),
      vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      randomPick(rng, PALETTE.trafficCar),
      { driver: 'ai', ai: { axis: vertical ? 'v' : 'h', road: line, dir, speed: TRAFFIC.speed + (rng() - 0.5) * TRAFFIC.speedJitter } },
    );
    car.speed = car.ai.speed;
    cars.push(car);
  }
  return cars;
}

/** Parked cars the player can steal, placed on the city's parking spots. */
export function createParkedCars(state) {
  return state.city.parkedSpots.map((spot) => createCar(
    'parked',
    spot.x, spot.y, spot.angle,
    randomPick(state.rng, PALETTE.trafficCar),
    { driver: 'none' },
  ));
}

function carAhead(state, car) {
  let best = Infinity;
  for (const other of state.cars) {
    if (other === car || other.kind === 'parked' || other.health <= 0) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
    if (forward > 0 && forward < best && side < 34) best = forward;
  }
  return best;
}

export function updateTraffic(state, dt) {
  const { city, rng } = state;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.health <= 0) continue;
    const ai = car.ai;
    // Slow for the car ahead so traffic does not pile up.
    const gap = carAhead(state, car);
    const wantSpeed = gap < TRAFFIC.minGap ? Math.max(0, ai.speed * (gap / TRAFFIC.minGap)) : ai.speed;
    car.speed += (wantSpeed - car.speed) * Math.min(1, 2 * dt);

    // Move along the current road.
    if (ai.axis === 'v') car.y += ai.dir * car.speed * dt;
    else car.x += ai.dir * car.speed * dt;

    // Turn at an intersection, sometimes.
    const along = ai.axis === 'v' ? car.y : car.x;
    const crossings = ai.axis === 'v' ? city.lines.horizontal : city.lines.vertical;
    for (const line of crossings) {
      if (Math.abs(along - line) < 14 && rng() < 0.012) {
        const turnVertical = ai.axis === 'h';
        ai.axis = turnVertical ? 'v' : 'h';
        ai.road = line;
        ai.dir = rng() < 0.5 ? -1 : 1;
        if (turnVertical) {
          car.x = line + 20 * (ai.dir > 0 ? 1 : -1);
          car.y = along;
          car.angle = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.y = line + 20 * (ai.dir > 0 ? 1 : -1);
          car.x = along;
          car.angle = ai.dir > 0 ? 0 : Math.PI;
        }
        break;
      }
    }

    // Wrap around the city edge instead of driving into the water or off the map.
    if (ai.axis === 'v' && (car.y < 140 || car.y > city.height - 140)) {
      ai.dir *= -1;
      car.angle += Math.PI;
    }
    if (ai.axis === 'h' && (car.x < 140 || car.x > city.width - 200)) {
      ai.dir *= -1;
      car.angle += Math.PI;
    }
    updateCarSmoke(state, car, dt);
  }
  // Keep traffic from stacking on top of itself at intersections.
  const moving = state.cars.filter((c) => c.kind === 'traffic' && c.health > 0);
  for (let i = 0; i < moving.length; i += 1) {
    for (let j = i + 1; j < moving.length; j += 1) {
      collideCars(moving[i], moving[j]);
    }
  }
}
