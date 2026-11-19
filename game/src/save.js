// Saving to localStorage: cash, health, story progress, position and stats.
// A save is written when the player reaches the safehouse and when a mission is
// completed, and loaded from the title screen with Continue. Storage can be off
// (private windows): then the save simply lasts this visit only.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(state) {
  const data = {
    version: 1,
    cash: Math.floor(state.cash),
    health: Math.floor(state.health),
    missionIndex: state.mission.index,
    storyDone: state.storyDone,
    playerX: Math.floor(state.player.x),
    playerY: Math.floor(state.player.y),
    stats: state.stats,
    clockMin: state.clockMin,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
