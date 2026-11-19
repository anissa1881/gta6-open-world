[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/anissa1881/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/anissa1881/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Sunport City — Make GTA 6 (gta6-01)

An original 2D top-down open-world crime game in the spirit of GTA 6, built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). Everything in it — the city, the characters, the
vehicles, the story, the art and the sounds — is original. Nothing is taken from
Rockstar Games or any other commercial game.

You arrive in Sunport City, a sun-soaked coastal city, with $150 and a phone call
from fixer Mara Voss. Steal cars, outrun the Sunport PD, run courier jobs, take
taxi fares, and work your way up the city's underworld — on foot and behind the
wheel, across six districts: Palm Heights, Marina Row, Sunport Strip, Central
Plaza, Dockside and Old Foundry.

## How to play

- **Start:** press Enter / Space (or click) on the title screen. If a save exists,
  press C to continue where you left off.
- **On foot:** WASD or arrow keys to walk, hold Shift to run. F punches; aim with
  the mouse and press F again to shoot (you carry a pistol). E enters the nearest
  car. Walk into your safehouse in Palm Heights to save.
- **Driving:** W / Up accelerates, S / Down brakes and reverses, A D / Left Right
  steer, Space is the handbrake. E exits the car. Cars take damage and smoke when
  they are wrecked; a wrecked car will not drive.
- **Wanted level:** stealing cars, hitting pedestrians, shooting and ramming cars
  raise your wanted stars (1–5). The Sunport PD sends patrol cars and foot
  officers who chase and ram you. Break line of sight and stay hidden to cool
  the heat down. If an officer catches you on foot, you are Busted; if your
  health hits zero, you are Wasted.
- **Missions:** follow the yellow marker. Mara Voss's story chain is four jobs:
  1. Getaway Wheels — steal a car and bring it to Sunport Strip.
  2. Sunport Courier — pick up a package at Marina Row and deliver it to
     Dockside before the timer runs out.
  3. Lose the Tail — shake a 3-star wanted level.
  4. Dockside Showdown — settle things with the Dockside crew.
  Completing a job pays cash. Side jobs appear as markers around the city:
  taxi fares, package runs and vigilante work.
- **HUD:** health and cash top-left, wanted stars top-right, the current
  objective across the top, a clock, and a minimap bottom-right (M toggles it
  bigger). Esc or P pauses. Mute with N.

## How to run

No build step, no network. Serve the `game/` folder with any static server and
open `index.html` in a desktop browser:

```
node serve.ts
# open http://localhost:8080
```

Screenshots are staged deterministically with `?shot=chase|downtown|drive|mission`
(plus `&seed=N`); see `shots.json`.

## Files

- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` + `game/src/` — the game itself, plain ES modules:
  `main.js` (loop and screens), `city.js` (the city), `player.js`,
  `vehicles.js`, `traffic.js`, `pedestrians.js`, `police.js` (wanted level and
  pursuit), `missions.js` (story chain and side jobs), `combat.js`,
  `hud.js` (HUD and minimap), `render.js` (canvas drawing), `audio.js`
  (synthesised sound), `save.js`, `input.js`, `config.js`, `random.js`,
  `shots.js` (deterministic screenshot scenes).
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `screenshots/` — 4 real renders of the game, the first by name is the cover.

## License

MIT — see `LICENSE`.

## Build notes (recorded session, 2026-11-19)

Built in a recorded make.fun session after the recording started, from the
design in `../makefun/gta6-01-plan.md` (kept outside this repo). The user chose
2D top-down over 3D: with the deadline five days out, a complete 2D city
scores higher on the judge's first criterion (completeness) than a half-built
3D one. The starter Block Dodger game was replaced completely; the only
starter files kept are the plumbing (`main.ts`, `serve.ts`,
`vendor/makefun-game.ts`, `LICENSE`, `shots.json` shape).

Screenshots are real renders of the game in headless Chromium (Playwright),
staged deterministically with `?shot=chase|downtown|drive|mission&seed=7` —
no editing or compositing. Play-tested live in the same browser: title →
start → walk → shoot → wanted level → police response, with zero console
errors.

Known limitations, honestly noted: police cars steer straight at the player
and can cut across sidewalks while chasing; pedestrians sometimes clip a
building corner when they change direction; traffic has no traffic lights.
Desktop keyboard + mouse only, as the bounty asks.
