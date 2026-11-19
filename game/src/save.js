// Save game for Solmar Shores: cash, completed missions and the best
// (highest) wanted level, in localStorage. Everything is validated on
// load so a corrupt or foreign value falls back to a fresh game.
const KEY = 'solmar-shores-save-v1';

export function loadSave() {
  const fresh = { cash: 0, completed: [], bestWanted: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return fresh;
    return {
      cash: typeof data.cash === 'number' && data.cash >= 0 ? Math.floor(data.cash) : 0,
      completed: Array.isArray(data.completed)
        ? data.completed.filter((id) => typeof id === 'string')
        : [],
      bestWanted:
        typeof data.bestWanted === 'number'
          ? Math.max(0, Math.min(5, Math.floor(data.bestWanted)))
          : 0,
    };
  } catch {
    return fresh;
  }
}

export function saveGame(data) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cash: Math.max(0, Math.floor(data.cash || 0)),
        completed: Array.isArray(data.completed) ? data.completed : [],
        bestWanted: Math.max(0, Math.min(5, Math.floor(data.bestWanted || 0))),
      }),
    );
  } catch {
    // Storage full or blocked: the game keeps running without a save.
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
