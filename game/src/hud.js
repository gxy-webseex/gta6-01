// HUD for Solmar Shores: cash, wanted stars, speed, contextual prompt and
// the start overlay. Day 1 shows empty wanted stars and $0; Day 2 fills them.
export function createHud() {
  const cashEl = document.getElementById('cash');
  const wantedEl = document.getElementById('wanted');
  const flashEl = document.getElementById('wanted-flash');
  const speedEl = document.getElementById('speed');
  const promptEl = document.getElementById('prompt');
  const startEl = document.getElementById('start');
  const playBtn = document.getElementById('play-btn');
  const statusEl = document.getElementById('status');
  const objectiveEl = document.getElementById('objective');
  const progressEl = document.getElementById('progress');
  const newGameBtn = document.getElementById('newgame-btn');

  let started = false;
  let onStart = null;
  playBtn.addEventListener('click', () => {
    startEl.style.display = 'none';
    started = true;
    if (onStart) onStart();
  });

  function setCash(cash) {
    cashEl.textContent = `$${Math.floor(cash).toLocaleString('en-US')}`;
  }

  function setWanted(level) {
    const filled = '★'.repeat(Math.max(0, Math.min(5, level)));
    const empty = '☆'.repeat(5 - Math.max(0, Math.min(5, level)));
    wantedEl.textContent = filled + empty;
  }

  function setSpeed(kmh, label) {
    speedEl.innerHTML = `${Math.round(kmh)}<small>${label}</small>`;
  }

  function setPrompt(text) {
    if (text) {
      promptEl.textContent = text;
      promptEl.style.display = 'block';
    } else {
      promptEl.style.display = 'none';
    }
  }

  function announce(text) {
    statusEl.textContent = text;
  }

  // Short red WANTED flash across the wanted stars when the level rises.
  function flashWanted() {
    flashEl.classList.remove('show');
    void flashEl.offsetWidth; // restart the CSS animation
    flashEl.classList.add('show');
  }

  // Persistent mission objective line (top centre); hidden when no job
  // is running.
  function setObjective(text) {
    if (text) {
      objectiveEl.textContent = text;
      objectiveEl.style.display = 'block';
    } else {
      objectiveEl.style.display = 'none';
    }
  }

  // Start-screen progress line for a returning player.
  function setProgress(text) {
    if (text) {
      progressEl.textContent = text;
      progressEl.style.display = 'block';
    } else {
      progressEl.style.display = 'none';
    }
  }

  let onNewGame = null;
  function showNewGame(show) {
    newGameBtn.style.display = show ? 'inline-block' : 'none';
  }
  newGameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onNewGame) onNewGame();
  });

  return {
    setCash,
    setWanted,
    setSpeed,
    setPrompt,
    announce,
    flashWanted,
    setObjective,
    setProgress,
    showNewGame,
    set onNewGame(fn) { onNewGame = fn; },
    get started() { return started; },
    set onStart(fn) { onStart = fn; },
  };
}
