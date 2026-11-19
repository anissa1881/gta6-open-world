// Keyboard and pointer input. Held keys give a movement direction; one-shot presses
// (confirm, pause, enter a car, punch/shoot, map zoom, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and never
// counted twice. Mouse position is kept in screen pixels; the game converts it to a
// world aim with the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_ATTACK = 8;
export const ACTION_MAP = 16;
export const ACTION_MUTE = 32;
export const ACTION_RADIO = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const ATTACK = new Set(['KeyF']);
const MAP = new Set(['KeyM']);
const MUTE = new Set(['KeyN']);
const RADIO = new Set(['KeyR']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code)
      || RIGHT.has(event.code) || RUN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    // Space is both the handbrake (held) and confirm (one-shot).
    if (event.code === 'Space') {
      held.add(event.code);
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (ATTACK.has(event.code)) actions |= ACTION_ATTACK;
    else if (MAP.has(event.code)) actions |= ACTION_MAP;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (RADIO.has(event.code)) actions |= ACTION_RADIO;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function axis(neg, pos) {
    let value = 0;
    for (const code of neg) if (held.has(code)) value -= 1;
    for (const code of pos) if (held.has(code)) value += 1;
    return value;
  }

  return {
    mouse,
    /** -1/0/1 on each axis, from WASD or the arrow keys. */
    moveX() { return axis(LEFT, RIGHT); },
    moveY() { return axis(UP, DOWN); },
    /** True while either Shift is held (run on foot). */
    running() {
      for (const code of RUN) if (held.has(code)) return true;
      return false;
    },
    /** True while Space is held (handbrake in a car). */
    handbrake() { return held.has('Space'); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
