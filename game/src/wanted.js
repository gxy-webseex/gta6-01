// Wanted level for Solmar Shores: 0-5 stars, driven by what the player
// does and cooled by escaping. The HUD stars always show the real level;
// a rise flashes the red WANTED banner (hud.flashWanted).

const MAX_LEVEL = 5;
const ESCAPE_RADIUS = 45; // no police within this: the heat starts to fade
const RAM_COOLDOWN = 3; // seconds between counted police rams
const SPOTTED_COOLDOWN = 5; // seconds between "spotted on foot" raises

export function createWanted(hud) {
  let level = 0;
  let escapeTimer = 0;
  let escapeInterval = 10; // seconds of freedom to lose one star
  let ramCooldown = 0;
  let spottedCooldown = 0;

  function apply() {
    hud.setWanted(level);
  }

  // Raise the level (capped at 5) and flash the HUD when it goes up.
  function raise(n, reason) {
    const before = level;
    level = Math.min(MAX_LEVEL, level + n);
    if (level !== before) {
      apply();
      hud.flashWanted();
      hud.announce(reason);
    }
    escapeTimer = 0;
  }

  // First theft starts the heat at 1 star; each further theft adds one.
  function onTheft() {
    if (level === 0) raise(1, 'Car stolen! The cops are onto you');
    else raise(1, 'Another theft! The heat is rising');
  }

  // The player drove into a police car at speed.
  function onRam() {
    if (ramCooldown > 0) return;
    ramCooldown = RAM_COOLDOWN;
    raise(1, 'You rammed a police car!');
  }

  // A police car got close to the player on foot and made them.
  function onSpotted() {
    if (spottedCooldown > 0) return;
    spottedCooldown = SPOTTED_COOLDOWN;
    raise(1, 'Spotted by the police!');
  }

  function update(dt, nearestPoliceDist) {
    ramCooldown = Math.max(0, ramCooldown - dt);
    spottedCooldown = Math.max(0, spottedCooldown - dt);
    if (level <= 0) {
      escapeTimer = 0;
      return;
    }
    if (nearestPoliceDist === null || nearestPoliceDist > ESCAPE_RADIUS) {
      escapeTimer += dt;
      if (escapeTimer >= escapeInterval) {
        level -= 1;
        escapeTimer = 0;
        apply();
        hud.announce(level > 0 ? 'The heat is dying down…' : 'You lost the cops');
      }
    } else {
      escapeTimer = 0;
    }
  }

  return {
    get level() {
      return level;
    },
    get escapeTimer() {
      return escapeTimer;
    },
    raise,
    onTheft,
    onRam,
    onSpotted,
    update,
    // Verification hook: shorten the escape interval for the test run.
    debugSetEscapeInterval(s) {
      escapeInterval = s;
    },
  };
}
