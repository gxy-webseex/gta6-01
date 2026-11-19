// Keyboard + mouse-look input for Solmar Shores. Pointer lock gives the
// mouse-look; arrow keys turn the camera too, so the game stays playable
// wherever pointer lock is unavailable (e.g. a headless browser).
export function createInput(canvas) {
  const keys = new Set();
  const freshPresses = new Set(); // one-shot presses, ignores key auto-repeat
  let yaw = 0; // camera yaw, radians; 0 looks toward -z
  let pitch = -0.28; // camera pitch, radians (slightly down)
  let locked = false;
  let yawDelta = 0;
  let pitchDelta = 0;

  const onKey = (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    if (!e.repeat) freshPresses.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  const onMouseMove = (e) => {
    if (!locked) return;
    yawDelta -= e.movementX * 0.0026;
    pitchDelta -= e.movementY * 0.0022;
  };
  document.addEventListener('mousemove', onMouseMove);

  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
  };
  document.addEventListener('pointerlockchange', onLockChange);

  function requestLock() {
    if (document.pointerLockElement !== canvas) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { /* headless or denied: arrow keys still work */ });
      } catch {
        /* pointer lock unavailable */
      }
    }
  }

  // Apply accumulated mouse deltas and arrow-key turning each frame.
  function update(dt) {
    yaw += yawDelta;
    pitch += pitchDelta;
    yawDelta = 0;
    pitchDelta = 0;
    const turn = 2.4 * dt;
    if (keys.has('ArrowLeft')) yaw += turn;
    if (keys.has('ArrowRight')) yaw -= turn;
    if (keys.has('ArrowUp')) pitch += turn * 0.6;
    if (keys.has('ArrowDown')) pitch -= turn * 0.6;
    pitch = Math.max(-1.1, Math.min(0.55, pitch));
  }

  function axis() {
    // Forward/strafe in camera space, from WASD.
    let f = 0;
    let s = 0;
    if (keys.has('KeyW')) f += 1;
    if (keys.has('KeyS')) f -= 1;
    if (keys.has('KeyD')) s += 1;
    if (keys.has('KeyA')) s -= 1;
    return { f, s };
  }

  function pressed(code) {
    // One-shot key check: true once per physical press.
    if (freshPresses.has(code)) {
      freshPresses.delete(code);
      return true;
    }
    return false;
  }

  return {
    keys,
    update,
    axis,
    pressed,
    requestLock,
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    get locked() { return locked; },
  };
}
