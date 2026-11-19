// WebAudio synth SFX for Solmar Shores: engine hum, police siren, cash
// chime, collision thud and UI click — all synthesized, no audio files.
// The context is created on the first user gesture only, so a headless
// run stays silent, and every method is a no-op when audio is
// unavailable, so sound can never break loading or the game loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  // Create the graph on a real gesture (play click or key press). Never
  // throws: a missing AudioContext just leaves the game silent.
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass; gain follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: one triangle osc that alternates pitch while the cops chase.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  // One short note: a sine/triangle/square that fades out.
  function blip(freq, dur, type, vol, delay = 0) {
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* a failed note never breaks the game */
    }
  }

  // speed01: 0..1 while driving, 0 on foot. Pitch and loudness follow it.
  function setEngine(speed01, driving) {
    if (!ctx) return;
    try {
      const s = driving ? Math.max(0, Math.min(1, speed01)) : 0;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(0.05 + 0.12 * s, t, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + 95 * s, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(53 + 98 * s, t, 0.08);
    } catch {
      /* ignore */
    }
  }

  // Two-tone wail, only while the police are on the player. Call per frame.
  function setSiren(on, dt) {
    if (!ctx) return;
    try {
      sirenTimer += dt;
      if (sirenTimer > 0.38) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 960 : 720, ctx.currentTime, 0.03);
      }
      sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.1);
    } catch {
      /* ignore */
    }
  }

  // Cash reward: a bright three-note arpeggio.
  function chime() {
    blip(659, 0.35, 'sine', 0.22, 0);
    blip(784, 0.35, 'sine', 0.22, 0.07);
    blip(988, 0.45, 'sine', 0.22, 0.14);
  }

  // Collision: a low sine that drops in pitch. strength 0..1.
  function thud(strength = 0.5) {
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t0);
      osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * Math.min(1, strength), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch {
      /* ignore */
    }
  }

  function click() {
    blip(880, 0.06, 'square', 0.07);
  }

  function setMuted(m) {
    muted = !!m;
    if (master) {
      try {
        master.gain.value = muted ? 0 : 0.5;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    ensure,
    setEngine,
    setSiren,
    chime,
    thud,
    click,
    setMuted,
    get muted() {
      return muted;
    },
    get ready() {
      return ctx !== null;
    },
  };
}
