// Screen shake: one small helper so the physics (vehicles, police) can shake the
// camera without importing the renderer. The renderer reads state.shake in
// toWorld; main.js counts its timer down every step.
export function addShake(state, mag) {
  const current = state.shake ? state.shake.mag : 0;
  state.shake = { mag: Math.max(current, mag), timer: 0.35 };
}
