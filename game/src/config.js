// Sunport City — every tuning number, colour, place and mission in one place.
// The world is a fixed 3200x2400 coastal grid city; the renderer shows a 1280x720
// window of it through a camera that follows the player. No rule below depends on
// the screen size, and nothing here loads over the network.

export const WORLD = { width: 3200, height: 2400 };

/** The logical view the renderer paints, scaled to fit the browser window. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const ROAD = { width: 96, spacing: 400, first: 200 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 235,
  runSpeed: 330,
  punchRange: 46,
  punchArc: 1.1,
  punchDamage: 34,
  punchCooldown: 0.45,
  shootCooldown: 0.28,
  ammoStart: 120,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  steer: 2.6,
  grip: 3.2,
  health: 100,
  enterRange: 70,
};

export const TRAFFIC = { count: 30, speed: 150, speedJitter: 45, minGap: 90 };
export const PEDS = { count: 46, walkSpeed: 55, fleeSpeed: 170 };
export const POLICE = { carSpeed: 560, footSpeed: 250, ramDamage: 9, catchSeconds: 1.2 };

/** The police helicopter: speed, how close it hovers, and its spotlight reach. */
export const HELI = { speed: 330, hover: 190, spotRadius: 190, seeRange: 700, max: 2 };

/** Player rank, from missions done and cash: Street, Hustler, Wheelman, Fixer, Kingpin. */
export const RANKS = [
  { name: 'Street', missions: 0, cash: 0 },
  { name: 'Hustler', missions: 2, cash: 800 },
  { name: 'Wheelman', missions: 4, cash: 2000 },
  { name: 'Fixer', missions: 6, cash: 4000 },
  { name: 'Kingpin', missions: 8, cash: 7000 },
];

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  ramCar: 1,
  decaySeconds: 9,
  loseSeconds: 12,
};

export const MONEY = { start: 150, missionBonus: 50 };

/** Named places in the city, so missions and the HUD never hard-code raw coordinates. */
export const PLACES = {
  safehouse: { x: 300, y: 300, name: 'Safehouse — Palm Heights' },
  strip: { x: 1600, y: 1000, name: 'Sunport Strip' },
  marina: { x: 2750, y: 300, name: 'Marina Row' },
  dockside: { x: 400, y: 2000, name: 'Dockside' },
  foundry: { x: 2600, y: 2000, name: 'Old Foundry' },
  plaza: { x: 1600, y: 1400, name: 'Central Plaza' },
};

export const DISTRICTS = [
  { name: 'Palm Heights', x0: 0, y0: 0, x1: 1600, y1: 1000, tint: '#f7e8c8' },
  { name: 'Marina Row', x0: 1600, y0: 0, x1: 3200, y1: 1000, tint: '#cfe8f2' },
  { name: 'Sunport Strip', x0: 0, y0: 1000, x1: 1600, y1: 1600, tint: '#fbe3b8' },
  { name: 'Central Plaza', x0: 1600, y0: 1000, x1: 3200, y1: 1600, tint: '#efe6d4' },
  { name: 'Dockside', x0: 0, y0: 1600, x1: 1600, y1: 2400, tint: '#d8d2c4' },
  { name: 'Old Foundry', x0: 1600, y0: 1600, x1: 3200, y1: 2400, tint: '#e0d8c8' },
];

/** The story chain from fixer Mara Voss. Targets are resolved against PLACES at runtime. */
export const MISSIONS = [
  {
    id: 'getaway',
    title: 'Getaway Wheels',
    briefing: 'Mara Voss: "New in Sunport? Prove it. Steal a car — any car — and bring it to the Strip."',
    objective: 'Steal a car and drive it to Sunport Strip',
    reward: 200,
    place: 'strip',
  },
  {
    id: 'courier',
    title: 'Sunport Courier',
    briefing: 'Mara Voss: "A package is waiting at Marina Row. Deliver it to Dockside — fast. The clock is running."',
    objective: 'Pick up the package at Marina Row, deliver to Dockside before the timer ends',
    reward: 350,
    place: 'marina',
    timer: 95,
  },
  {
    id: 'tail',
    title: 'Lose the Tail',
    briefing: 'Mara Voss: "The Sunport PD is on you — three stars. Break line of sight and stay hidden until the heat dies."',
    objective: 'Lose your 3-star wanted level',
    reward: 400,
    place: 'plaza',
    timer: 150,
  },
  {
    id: 'showdown',
    title: 'Dockside Showdown',
    briefing: 'Mara Voss: "The Dockside crew double-crossed us. Go to the docks and settle it. Watch your back."',
    objective: 'Defeat the Dockside crew at the docks',
    reward: 600,
    place: 'dockside',
  },
  {
    id: 'heist',
    title: 'Harbor Heist',
    briefing: 'Mara Voss: "A gold GT coupe is parked at Marina Row — the harbourmaster\'s pride. Steal it and bring it home to the safehouse. Scratch it up and the deal is off."',
    objective: 'Steal the gold coupe at Marina Row and bring it to the safehouse undamaged',
    reward: 700,
    place: 'marina',
  },
  {
    id: 'race',
    title: 'Strip Sprint',
    briefing: 'Mara Voss: "Street race on the Strip tonight. Five checkpoints, three rivals, one winner. Be in a car and hit every checkpoint before the clock runs out."',
    objective: 'Race the Strip: hit all 5 checkpoints before the timer ends',
    reward: 800,
    place: 'strip',
    timer: 100,
  },
  {
    id: 'sky',
    title: 'Eyes in the Sky',
    briefing: 'Mara Voss: "Four stars and a police heli is on you. Survive 90 seconds — the heli will keep the patrol cars coming, so don\'t stop moving."',
    objective: 'Survive 90 seconds with the police helicopter on you',
    reward: 900,
    place: 'plaza',
    timer: 90,
    survive: true,
  },
  {
    id: 'kingpin',
    title: 'Sunport Kingpin',
    briefing: 'Mara Voss: "One last job. Pick up the Kingpin\'s package at Marina Row, then run five stars of heat all the way to the Old Foundry. Do this and Sunport is yours."',
    objective: 'Pick up the package at Marina Row, then deliver it to the Old Foundry at 5 stars',
    reward: 1000,
    place: 'marina',
    timer: 120,
  },
];

export const SIDE_JOBS = {
  taxi: { title: 'Taxi Fare', reward: 80, text: 'Drive the passenger to the marker.' },
  packages: { title: 'Package Run', reward: 150, text: 'Collect 5 packages around the city.' },
  vigilante: { title: 'Vigilante', reward: 200, text: 'Stop the getaway car — ram it or shoot it.' },
};

export const PALETTE = {
  backdrop: '#1d2733',
  ground: '#e8d9a8',
  sand: '#f2e3b3',
  water: '#3f8fb5',
  waterDeep: '#2f7396',
  road: '#3a3f47',
  roadLine: '#e8d44d',
  sidewalk: '#cfc4a4',
  buildingRoof: ['#c96f4a', '#d9a05b', '#7fa8a0', '#b5677a', '#8a7fb5', '#6f9e6a'],
  buildingEdge: '#5d5346',
  tree: '#5d8a4a',
  treeDark: '#476b39',
  player: '#ffd23f',
  playerCar: '#e84c3d',
  policeCar: '#2f6fd0',
  police: '#24344d',
  ped: ['#e8e0d0', '#d0c0a0', '#a8c8d8', '#d8a8b0', '#b8d0a8'],
  trafficCar: ['#4a90d9', '#d94a6a', '#e8e8e8', '#5a5a5a', '#7ab648', '#e8a13c'],
  marker: '#ffd23f',
  danger: '#e84c3d',
  panel: 'rgba(20, 26, 34, 0.88)',
  panelEdge: '#ffd23f',
  text: '#f4efe2',
  muted: '#b8b09a',
  health: '#58c96b',
  healthLow: '#e84c3d',
  cash: '#7ee081',
  star: '#ffd23f',
  starEmpty: '#5a5a5a',
  heli: '#2f3a4a',
  heliLight: '#ff5a3c',
  spotlight: 'rgba(255, 240, 170, 0.20)',
  lampGlow: 'rgba(255, 214, 120, 0.45)',
  goldenWash: 'rgba(255, 150, 60, 0.07)',
  wetSheen: 'rgba(255, 255, 255, 0.10)',
  skid: 'rgba(20, 20, 20, 0.35)',
  fire: '#ff7a2a',
  /** Night: a dark blue wash over the whole frame (alpha set by the clock). */
  nightTint: 'rgba(8, 14, 40, 0.42)',
  rainStreak: 'rgba(200, 220, 255, 0.35)',
  rainSplash: 'rgba(200, 220, 255, 0.30)',
  headlight: 'rgba(255, 240, 170, 0.28)',
  neon: ['#ff4fd8', '#37e0ff', '#ff9a3c', '#7dff5e'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Sidewalk storefronts you can walk up to and buy from (E): name, price, health. */
export const STOREFRONTS = [
  { name: 'TACOS', x: 1500, y: 1055, color: '#e84c3d', price: 10, health: 15 },
  { name: '24H MART', x: 1700, y: 1455, color: '#4a90d9', price: 10, health: 15 },
  { name: 'NOODLE BAR', x: 1100, y: 1455, color: '#e8a13c', price: 15, health: 25 },
];

/** The food truck parked by Central Plaza: stand near it on foot to eat for free. */
export const FOOD_TRUCK = { x: 1500, y: 1455, name: 'FOOD TRUCK' };

/** Ten hidden Sunport packages scattered on sidewalks; all ten pay a $500 bonus. */
export const SUNPORT_PACKAGES = 10;
export const PACKAGE_BONUS = 500;

/** Where a saved game is kept between visits (this browser only). */
export const SAVE_KEY = 'sunport-city.save.v1';
export const BEST_KEY = 'sunport-city.best.v1';
