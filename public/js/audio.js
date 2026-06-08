const Audio = (() => {
  let ctx = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function master(gain = 0.3) {
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(ctx.destination);
    return g;
  }

  // Whoosh la aruncare
  function shoot() {
    init();
    const out = master(0.25);
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(out);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  }

  // Boom explozie clădire
  function explodeBuild() {
    init();
    const out = master(0.4);
    // Noise burst
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 200;
    src.connect(f); f.connect(g); g.connect(out);
    g.gain.setValueAtTime(1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    src.start(); src.stop(ctx.currentTime + 0.6);

    // Sub boom
    const sub = ctx.createOscillator();
    const sg  = ctx.createGain();
    sub.connect(sg); sg.connect(out);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.5);
    sg.gain.setValueAtTime(0.8, ctx.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    sub.start(); sub.stop(ctx.currentTime + 0.5);
  }

  // Boom mare - lovire capybara
  function explodeHit() {
    init();
    const out = master(0.55);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300;
    src.connect(f); f.connect(g); g.connect(out);
    g.gain.setValueAtTime(1.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    src.start(); src.stop(ctx.currentTime + 0.8);

    const sub = ctx.createOscillator();
    const sg  = ctx.createGain();
    sub.connect(sg); sg.connect(out);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.8);
    sg.gain.setValueAtTime(1.2, ctx.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    sub.start(); sub.stop(ctx.currentTime + 0.8);
  }

  // Victorie jingle
  function victory() {
    init();
    const out = master(0.3);
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(out);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.15;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    });
  }

  // Înfrângere
  function defeat() {
    init();
    const out = master(0.25);
    const notes = [400, 320, 260, 200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(out);
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    });
  }

  // Upgrade weapon
  function upgrade() {
    init();
    const out = master(0.3);
    [800, 1000, 1300].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(out);
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t); osc.stop(t + 0.2);
    });
  }

  // Muzică ambientală cyberpunk (drone)
  let ambNode = null;
  function startAmbience() {
    init();
    if (ambNode) return;
    const out = master(0.06);
    ambNode = ctx.createOscillator();
    const lfo  = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.3;
    lfoG.gain.value = 8;
    lfo.connect(lfoG);
    lfoG.connect(ambNode.frequency);
    ambNode.type = 'sawtooth';
    ambNode.frequency.value = 55;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 180;
    ambNode.connect(f); f.connect(out);
    lfo.start(); ambNode.start();
  }

  function stopAmbience() {
    if (ambNode) { try { ambNode.stop(); } catch(e) {} ambNode = null; }
  }

  return { shoot, explodeBuild, explodeHit, victory, defeat, upgrade, startAmbience, stopAmbience, init };
})();
