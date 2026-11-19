// Screen shake: one small helper so the physics (vehicles, police) can shake the
// camera without importing the renderer. The renderer reads state.shake in
// toWorld; main.js counts its timer down every step.
export function addShake(state, mag) {
  const current = state.shake ? state.shake.mag : 0;
  state.shake = { mag: Math.max(current, mag), timer: 0.35 };
}

/**
 * A cinematic moment: the camera pushes in close on (x, y) and the world
 * runs in slow motion for `seconds` (real time). Skippable with any key
 * (main.js clears state.cine on input). One at a time, with a cooldown, so
 * a crash pile-up never traps the player in cutscenes. Only during play.
 */
export function startCinematic(state, x, y, seconds) {
  if (state.screen !== 'play') return false;
  if (state.cine) return false;
  if (state.time - (state.lastCine || -100) < 6) return false;
  state.lastCine = state.time;
  state.cine = { x, y, timer: seconds, duration: seconds };
  return true;
}
