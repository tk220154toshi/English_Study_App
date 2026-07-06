// stage.js — the "runtime" for Command mode. An original placeholder android
// (rename/reskin as you like) that executes an action program and can speak via
// the browser's SpeechSynthesis. Swap in your own art/voice at the marked seams.
(function () {
  const SVG = `
    <div id="sv-root">
      <svg viewBox="0 0 160 220" width="150" height="205" aria-hidden="true">
        <g id="sv-fig">
          <g id="sv-gest">
            <!-- shadow -->
            <ellipse id="sv-shadow" cx="80" cy="212" rx="34" ry="6" fill="rgba(0,0,0,.35)"/>
            <!-- antenna -->
            <line x1="80" y1="30" x2="80" y2="14" stroke="#7fd7c4" stroke-width="3"/>
            <circle cx="80" cy="11" r="4" fill="#7fd7c4"/>
            <!-- legs -->
            <rect id="sv-legL" x="66" y="150" width="12" height="52" rx="6" fill="#3a6ea5"/>
            <rect id="sv-legR" x="82" y="150" width="12" height="52" rx="6" fill="#3a6ea5"/>
            <!-- arms -->
            <rect id="sv-armL" x="40" y="78" width="12" height="56" rx="6" fill="#5b8fd0"/>
            <rect id="sv-armR" x="108" y="78" width="12" height="56" rx="6" fill="#5b8fd0"/>
            <!-- body -->
            <rect x="54" y="74" width="52" height="80" rx="16" fill="#4a7fc0"/>
            <rect x="70" y="92" width="20" height="20" rx="5" fill="#bfe9df"/>
            <!-- head -->
            <g id="sv-head">
              <rect x="52" y="30" width="56" height="48" rx="16" fill="#dfeaf5"/>
              <rect x="60" y="44" width="40" height="20" rx="8" fill="#12202e"/>
              <circle id="sv-eyeL" cx="72" cy="54" r="4.5" fill="#7fe3ff"/>
              <circle id="sv-eyeR" cx="88" cy="54" r="4.5" fill="#7fe3ff"/>
            </g>
          </g>
        </g>
      </svg>
      <div id="sv-bubble" class="sv-bubble"></div>
    </div>`;

  const STEP = 30, XMIN = -190, XMAX = 190;
  let root, fig, gest, parts = {};
  let x = 0, facing = 1, stopFlag = false;

  // ---- voice (TTS) -------------------------------------------------------
  let muted = false, rate = 1, pitch = 1, currentVoice = null;
  const synth = window.speechSynthesis || null;

  function getVoices() { return synth ? synth.getVoices() : []; }
  function setVoice(uriOrName) {
    const v = getVoices().find((x) => x.voiceURI === uriOrName || x.name === uriOrName);
    currentVoice = v || null;
  }
  function setMuted(m) { muted = !!m; if (muted && synth) synth.cancel(); }
  function setRate(r) { rate = Number(r) || 1; }
  function setPitch(p) { pitch = Number(p) || 1; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function anim(el, frames, opts) {
    if (!el || !el.animate) return Promise.resolve();
    try { return el.animate(frames, Object.assign({ easing: 'ease-in-out', fill: 'none' }, opts)).finished.catch(() => {}); }
    catch { return Promise.resolve(); }
  }

  function showBubble(t) {
    const b = parts.bubble; if (!b) return;
    b.textContent = t; b.classList.add('show');
  }
  function hideBubbleSoon() { const b = parts.bubble; if (b) setTimeout(() => b.classList.remove('show'), 600); }

  // SEAM: replace this with a call to a licensed/cloud TTS (e.g. POST /api/tts)
  // if you want a specific character voice. Browser TTS is used by default.
  function speak(text) {
    return new Promise((resolve) => {
      if (!text) return resolve();
      showBubble(text);
      if (muted || !synth) { setTimeout(() => { hideBubbleSoon(); resolve(); }, Math.min(2600, 500 + text.length * 45)); return; }
      const u = new SpeechSynthesisUtterance(text);
      if (currentVoice) { u.voice = currentVoice; u.lang = currentVoice.lang; } else { u.lang = 'en-US'; }
      u.rate = rate; u.pitch = pitch;
      let done = false; const fin = () => { if (done) return; done = true; hideBubbleSoon(); resolve(); };
      u.onend = fin; u.onerror = fin;
      try { synth.cancel(); synth.speak(u); } catch { fin(); }
      setTimeout(fin, 12000); // safety
    });
  }

  // ---- positioning -------------------------------------------------------
  function applyPos(durMs = 100) {
    root.style.transitionDuration = durMs + 'ms';
    root.style.transform = `translateX(${x}px)`;
    fig.style.transform = `scaleX(${facing})`;
  }

  async function walk(sign, count) {
    count = Math.max(1, count || 1);
    facing = sign < 0 ? -1 : 1;
    const target = Math.max(XMIN, Math.min(XMAX, x + sign * count * STEP));
    const dur = Math.max(320, Math.abs(target - x) / STEP * 260);
    x = target;
    // leg swing while walking
    anim(parts.legL, [{ transform: 'rotate(0)' }, { transform: 'rotate(22deg)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(0)' }], { duration: 520, iterations: Math.ceil(dur / 520) });
    anim(parts.legR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(22deg)' }, { transform: 'rotate(0)' }], { duration: 520, iterations: Math.ceil(dur / 520) });
    anim(parts.armL, [{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(16deg)' }, { transform: 'rotate(0)' }], { duration: 520, iterations: Math.ceil(dur / 520) });
    anim(gest, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 260, iterations: Math.ceil(dur / 260) });
    applyPos(dur);
    await sleep(dur);
  }

  // ---- individual actions ------------------------------------------------
  const A = {
    move: (s) => {
      const d = s.direction || 'forward';
      const sign = (d === 'back' || d === 'left') ? -1 : 1;
      return walk(sign, s.count);
    },
    turn: async (s) => {
      if (s.direction === 'around') { facing *= -1; await anim(gest, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 220 }); applyPos(0); await anim(gest, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 220 }); }
      else { facing = s.direction === 'left' ? -1 : 1; applyPos(160); await anim(gest, [{ transform: 'rotate(0)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }], { duration: 300 }); }
    },
    wave: () => anim(parts.armR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-150deg)' }, { transform: 'rotate(-125deg)' }, { transform: 'rotate(-150deg)' }, { transform: 'rotate(-125deg)' }, { transform: 'rotate(0)' }], { duration: 1300 }),
    raise_arm: (s) => {
      const arm = s.direction === 'left' ? parts.armL : parts.armR;
      const deg = s.direction === 'left' ? 150 : -150;
      return anim(arm, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }], { duration: 500, fill: 'forwards' });
    },
    lower_arm: () => Promise.all([
      anim(parts.armL, [{ transform: 'rotate(0)' }], { duration: 400, fill: 'forwards' }),
      anim(parts.armR, [{ transform: 'rotate(0)' }], { duration: 400, fill: 'forwards' }),
    ]),
    nod: () => anim(parts.head, [{ transform: 'translateY(0)' }, { transform: 'translateY(6px) rotate(6deg)' }, { transform: 'translateY(0)' }, { transform: 'translateY(6px) rotate(6deg)' }, { transform: 'translateY(0)' }], { duration: 900 }),
    shake_head: () => anim(parts.head, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(0)' }], { duration: 900 }),
    jump: async (s) => { for (let i = 0; i < Math.max(1, s.count || 1); i++) await anim(gest, [{ transform: 'translateY(0)' }, { transform: 'translateY(-42px)' }, { transform: 'translateY(0)' }], { duration: 520 }); },
    spin: async (s) => { for (let i = 0; i < Math.max(1, s.count || 1); i++) { facing *= -1; await anim(gest, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(-1)' }], { duration: 260 }); facing *= -1; await anim(gest, [{ transform: 'scaleX(-1)' }, { transform: 'scaleX(1)' }], { duration: 260 }); } },
    bow: () => anim(gest, [{ transform: 'rotate(0)' }, { transform: 'rotate(32deg)' }, { transform: 'rotate(32deg)' }, { transform: 'rotate(0)' }], { duration: 1100 }),
    sit: () => { parts.root.classList.add('sitting'); return anim(gest, [{ transform: 'translateY(0)' }, { transform: 'translateY(26px)' }], { duration: 500, fill: 'forwards' }); },
    stand: () => { parts.root.classList.remove('sitting'); return anim(gest, [{ transform: 'translateY(26px)' }, { transform: 'translateY(0)' }], { duration: 500, fill: 'forwards' }); },
    point: (s) => {
      const left = s.direction === 'left';
      const arm = left ? parts.armL : parts.armR;
      const deg = left ? 95 : -95;
      return anim(arm, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: 'rotate(0)' }], { duration: 1200 });
    },
    clap: async (s) => {
      for (let i = 0; i < Math.max(2, s.count || 2); i++) {
        await Promise.all([
          anim(parts.armL, [{ transform: 'rotate(0)' }, { transform: 'rotate(70deg)' }], { duration: 180 }),
          anim(parts.armR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-70deg)' }], { duration: 180 }),
        ]);
        await Promise.all([
          anim(parts.armL, [{ transform: 'rotate(70deg)' }, { transform: 'rotate(0)' }], { duration: 180 }),
          anim(parts.armR, [{ transform: 'rotate(-70deg)' }, { transform: 'rotate(0)' }], { duration: 180 }),
        ]);
      }
    },
    dance: async () => {
      for (let i = 0; i < 3; i++) {
        anim(parts.armL, [{ transform: 'rotate(0)' }, { transform: 'rotate(-120deg)' }, { transform: 'rotate(0)' }], { duration: 600 });
        anim(parts.armR, [{ transform: 'rotate(0)' }, { transform: 'rotate(120deg)' }, { transform: 'rotate(0)' }], { duration: 600 });
        await anim(gest, [{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(-10px) rotate(-8deg)' }, { transform: 'translateX(10px) rotate(8deg)' }, { transform: 'translateX(0) rotate(0)' }], { duration: 600 });
      }
    },
    look: (s) => { const deg = s.direction === 'left' ? -18 : 18; return anim(parts.head, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: 'rotate(0)' }], { duration: 900 }); },
    wait: (s) => sleep(Math.max(200, (s.seconds || 0.5) * 1000)),
    speak: (s) => speak(s.text || ''),
    idle: () => anim(gest, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 700 }),
  };

  async function perform(step) {
    const fn = A[step.action] || A.idle;
    try { await fn(step); } catch { /* keep going */ }
  }

  // ---- public API --------------------------------------------------------
  function init(mount) {
    mount.innerHTML = SVG;
    root = mount.querySelector('#sv-root');
    fig = mount.querySelector('#sv-fig');
    gest = mount.querySelector('#sv-gest');
    parts = {
      root, head: mount.querySelector('#sv-head'),
      armL: mount.querySelector('#sv-armL'), armR: mount.querySelector('#sv-armR'),
      legL: mount.querySelector('#sv-legL'), legR: mount.querySelector('#sv-legR'),
      bubble: mount.querySelector('#sv-bubble'),
    };
    reset();
  }

  function reset() {
    x = 0; facing = 1; stopFlag = false;
    if (root) { root.classList.remove('sitting'); applyPos(0); }
    if (synth) synth.cancel();
  }

  function stop() { stopFlag = true; if (synth) synth.cancel(); }

  async function run(program, opts = {}) {
    stopFlag = false;
    for (const step of program || []) {
      if (stopFlag) break;
      if (opts.onTrace) opts.onTrace(step);
      await perform(step);
      await sleep(140);
    }
  }

  window.EngcStage = { init, reset, run, stop, speak, getVoices, setVoice, setMuted, setRate, setPitch };
})();
