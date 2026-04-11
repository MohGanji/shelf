/**
 * Tron: Light Cycles — Game State Machine
 *
 * States: BOOT → LOBBY → LEVEL / GARAGE / EDITOR
 *
 * This is the entry point. On boot, it loads save data, then
 * transitions to the LOBBY state.
 */

import { loadSaveData, saveSaveData } from './data/savedata.js';

// Game states
const GameState = {
  BOOT: 'BOOT',
  LOBBY: 'LOBBY',
  LEVEL: 'LEVEL',
  GARAGE: 'GARAGE',
  EDITOR: 'EDITOR',
  PAUSE: 'PAUSE',
  PLAYER_DEREZ: 'PLAYER_DEREZ',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
};

let currentState = GameState.BOOT;
let saveData = null;

/**
 * Boot sequence: load save data, then transition to lobby.
 */
function boot() {
  console.log('[TRON] Booting...');
  saveData = loadSaveData();
  console.log('[TRON] Save data loaded:', saveData.progress);

  // Transition to LOBBY
  currentState = GameState.LOBBY;
  console.log('[TRON] State → LOBBY');
}

// Run boot on module load
boot();

export { GameState, currentState, saveData, saveSaveData };
