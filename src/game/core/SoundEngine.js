export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.loops = new Map();
    this.loopNodes = new Map();
    this.htmlPools = new Map();
    this.htmlLoops = new Map();
    this.buffers = new Map();
    this.bufferPromises = new Map();
    this.preloadStarted = false;
    this.baseGain = 0.42;
    this.duck = 0;
  }

  async unlock() {
    this.ensureContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // Kick off audio preloading once we have a running AudioContext.
    this.preload();
    // Best-effort: try to get the tap SFX loaded for the first interaction.
    try {
      await Promise.race([
        this.loadBuffer("tap"),
        new Promise((resolve) => window.setTimeout(resolve, 140)),
      ]);
    } catch {
      // ignored
    }
    this.tap();
  }

  ensureContext() {
    if (this.ctx) return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    this.ctx = new AudioContextCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.baseGain;
    this.master.connect(this.ctx.destination);
  }

  sfxManifest() {
    // Paths are relative to index.html (this repo loads assets from ./public/...).
    return {
      tap: { url: "./public/assets/sfx/tap.mp3", gain: 0.7, rateJitter: 0.03 },
      cluck: { url: "./public/assets/sfx/cluck.mp3", gain: 0.85, rateJitter: 0.05 },
      sparkle: { url: "./public/assets/sfx/sparkle.mp3", gain: 0.75, rateJitter: 0.04 },
      boing: { url: "./public/assets/sfx/boing.mp3", gain: 0.9, rateJitter: 0.04 },
      bubblePop: { url: "./public/assets/sfx/bubble_pop.mp3", gain: 0.65, rateJitter: 0.05 },
      tractorHorn: { url: "./public/assets/sfx/tractor_horn.mp3", gain: 0.85, rateJitter: 0.02 },
      eggDrop: { url: "./public/assets/sfx/egg_drop.mp3", gain: 0.7, rateJitter: 0.03 },
      hatch: { url: "./public/assets/sfx/hatch.mp3", gain: 0.95, rateJitter: 0.02 },
      flush: { url: "./public/assets/sfx/flush.mp3", gain: 0.9, rateJitter: 0.02 },
      fireworkBurst: { url: "./public/assets/sfx/firework_burst.mp3", gain: 0.95, rateJitter: 0.03 },
      jetpackLoop: { url: "./public/assets/sfx/jetpack_loop.mp3", gain: 0.42 },
      rainLoop: { url: "./public/assets/sfx/rain_loop.mp3", gain: 0.32 },
      discoLoop: { url: "./public/assets/sfx/disco_loop.mp3", gain: 0.35 },
    };
  }

  currentMixGain() {
    // Mirrors setDuck() behavior; used for HTMLAudioElement fallback where we can't route via master gain.
    return this.baseGain * (1 - this.duck * 0.42);
  }

  preload() {
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    if (this.preloadStarted) return;
    this.preloadStarted = true;
    const manifest = this.sfxManifest();
    for (const key of Object.keys(manifest)) {
      // Fire and forget; we fall back to procedural synthesis on failures.
      this.loadBuffer(key).catch(() => {});
    }
  }

  getHtmlPool(key, size = 3) {
    let pool = this.htmlPools.get(key);
    if (pool) return pool;
    pool = { idx: 0, size, audios: [] };
    this.htmlPools.set(key, pool);
    return pool;
  }

  playHtmlOneShot(key, { gain = 1, rate = 1 } = {}) {
    const manifest = this.sfxManifest();
    const entry = manifest[key];
    if (!entry || !entry.url) return false;

    // Audio element playback tends to be more forgiving than decodeAudioData on some platforms.
    const pool = this.getHtmlPool(key, 4);
    const i = pool.idx++ % pool.size;
    let audio = pool.audios[i];
    if (!audio) {
      audio = new Audio(entry.url);
      audio.preload = "auto";
      pool.audios[i] = audio;
    }

    const targetVolume = Math.max(
      0,
      Math.min(1, this.currentMixGain() * (entry.gain || 1) * gain),
    );
    audio.volume = targetVolume;

    try {
      const jitter = entry.rateJitter || 0;
      const jitterFactor = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, rate * jitterFactor));
    } catch {
      // ignored (some browsers restrict playbackRate in certain states)
    }

    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignored
    }

    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  }

  startHtmlLoop(loopName, key, { gain = 1 } = {}) {
    if (this.htmlLoops.has(loopName)) return true;
    const manifest = this.sfxManifest();
    const entry = manifest[key];
    if (!entry || !entry.url) return false;

    const audio = new Audio(entry.url);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, this.currentMixGain() * (entry.gain || 1) * gain));
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    this.htmlLoops.set(loopName, audio);
    return true;
  }

  stopHtmlLoop(loopName) {
    const audio = this.htmlLoops.get(loopName);
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignored
    }
    this.htmlLoops.delete(loopName);
  }

  async decodeAudio(arrayBuffer) {
    if (!this.ctx) return null;
    // Safari historically used callback-style decodeAudioData.
    const res = this.ctx.decodeAudioData(arrayBuffer);
    if (res && typeof res.then === "function") return await res;
    return await new Promise((resolve, reject) => {
      this.ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err),
      );
    });
  }

  async loadBuffer(key) {
    this.ensureContext();
    if (!this.ctx) return null;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const existing = this.bufferPromises.get(key);
    if (existing) return await existing;

    const manifest = this.sfxManifest();
    const entry = manifest[key];
    if (!entry) return null;

    const p = (async () => {
      const res = await fetch(entry.url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Failed to load SFX ${key}: HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = await this.decodeAudio(arrayBuffer);
      if (!buffer) return null;
      this.buffers.set(key, buffer);
      return buffer;
    })();

    this.bufferPromises.set(key, p);
    try {
      return await p;
    } finally {
      // Keep the promise around only if it succeeded; otherwise allow retries later.
      if (!this.buffers.has(key)) this.bufferPromises.delete(key);
    }
  }

  playSample(key, { gain = 1, rate = 1 } = {}) {
    this.ensureContext();
    if (!this.ctx || !this.master) return false;

    const buffer = this.buffers.get(key);
    if (!buffer) {
      // If we're still loading/decoding, prefer playing the authored SFX via HTML audio
      // over the procedural synth, so you hear the new sound immediately.
      if (this.playHtmlOneShot(key, { gain, rate })) {
        this.loadBuffer(key).catch(() => {});
        return true;
      }
      // Start loading in the background for next time.
      this.loadBuffer(key).catch(() => {});
      return false;
    }

    const manifest = this.sfxManifest();
    const entry = manifest[key] || {};

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const jitter = entry.rateJitter || 0;
    const jitterFactor = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1;
    source.playbackRate.value = Math.max(0.5, Math.min(2.0, rate * jitterFactor));

    const amp = this.ctx.createGain();
    amp.gain.value = (entry.gain || 1) * gain;

    source.connect(amp);
    amp.connect(this.master);

    source.start();
    return true;
  }

  startLoopSample(loopName, key, { gain = 1, fadeIn = 0.08 } = {}) {
    this.ensureContext();
    if (!this.ctx || !this.master) return false;
    if (this.loopNodes.has(loopName)) return true;

    const buffer = this.buffers.get(key);
    if (!buffer) {
      if (this.startHtmlLoop(loopName, key, { gain })) {
        this.loadBuffer(key).catch(() => {});
        return true;
      }
      this.loadBuffer(key).catch(() => {});
      // If a procedural loop is running, upgrade to the sample loop once decoding succeeds.
      this.loadBuffer(key)
        .then(() => {
          if (this.loopNodes.has(loopName)) return;
          if (!this.loops.has(loopName)) return;
          this.stopLoop(loopName);
          this.startLoopSample(loopName, key, { gain, fadeIn });
        })
        .catch(() => {});
      return false;
    }

    const manifest = this.sfxManifest();
    const entry = manifest[key] || {};
    const targetGain = (entry.gain || 1) * gain;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const amp = this.ctx.createGain();
    const t = this.ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetGain), t + fadeIn);

    source.connect(amp);
    amp.connect(this.master);
    source.start();

    this.loopNodes.set(loopName, { source, amp });
    return true;
  }

  stopLoopSample(loopName, { fadeOut = 0.12 } = {}) {
    this.stopHtmlLoop(loopName);
    const node = this.loopNodes.get(loopName);
    if (!node || !this.ctx) return;

    const t = this.ctx.currentTime;
    node.amp.gain.cancelScheduledValues(t);
    node.amp.gain.setTargetAtTime(0.0001, t, Math.max(0.02, fadeOut / 6));

    // BufferSource.stop() can't be scheduled with a Gain node envelope reliably across browsers,
    // so we stop it shortly after the fade starts.
    window.setTimeout(() => {
      try {
        node.source.stop();
      } catch {
        // ignored
      }
    }, Math.ceil((fadeOut + 0.08) * 1000));

    this.loopNodes.delete(loopName);
  }

  setDuck(amount) {
    this.duck = Math.max(0, Math.min(0.75, amount));
    if (!this.ctx || !this.master) return;
    const target = this.baseGain * (1 - this.duck * 0.42);
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(target, t, 0.12);
  }

  stopAllLoops() {
    for (const name of Array.from(this.loopNodes.keys())) {
      this.stopLoopSample(name, { fadeOut: 0.08 });
    }
    for (const name of Array.from(this.htmlLoops.keys())) {
      this.stopHtmlLoop(name);
    }
    for (const name of this.loops.keys()) {
      this.stopLoop(name);
    }
  }

  startLoop(name, intervalMs, callback) {
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    if (this.loops.has(name)) return;

    callback();
    const timer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== "running") return;
      callback();
    }, intervalMs);
    this.loops.set(name, timer);
  }

  stopLoop(name) {
    const timer = this.loops.get(name);
    if (!timer) return;
    clearInterval(timer);
    this.loops.delete(name);
  }

  playTone({
    freq = 440,
    type = "sine",
    duration = 0.2,
    gain = 0.18,
    attack = 0.005,
    release = 0.12,
    startAt = 0,
    freqEnd = null,
  }) {
    this.ensureContext();
    if (!this.ctx || !this.master) return;

    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startAt);
    if (typeof freqEnd === "number") {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd),
        this.ctx.currentTime + startAt + duration,
      );
    }

    amp.gain.setValueAtTime(0.0001, this.ctx.currentTime + startAt);
    amp.gain.exponentialRampToValueAtTime(gain, this.ctx.currentTime + startAt + attack);
    amp.gain.exponentialRampToValueAtTime(
      0.0001,
      this.ctx.currentTime + startAt + Math.max(attack + 0.02, duration - release),
    );

    osc.connect(amp);
    amp.connect(this.master);

    osc.start(this.ctx.currentTime + startAt);
    osc.stop(this.ctx.currentTime + startAt + duration + 0.03);
  }

  playNoise({ duration = 0.16, gain = 0.09, lowpass = 9000, highpass = 160, playbackRate = 1 }) {
    this.ensureContext();
    if (!this.ctx || !this.master) return;

    if (!this.noiseBuffer) {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = playbackRate;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpass;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = lowpass;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(gain, this.ctx.currentTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    source.connect(hp);
    hp.connect(lp);
    lp.connect(amp);
    amp.connect(this.master);

    source.start();
    source.stop(this.ctx.currentTime + duration + 0.02);
  }

  tap() {
    if (this.playSample("tap")) return;
    this.playTone({ freq: 640, duration: 0.07, gain: 0.05, type: "triangle", freqEnd: 820 });
  }

  cluck() {
    if (this.playSample("cluck")) return;
    this.playTone({ freq: 520, type: "square", duration: 0.09, gain: 0.05, freqEnd: 640 });
    this.playTone({ freq: 460, type: "square", duration: 0.1, gain: 0.048, startAt: 0.08, freqEnd: 380 });
    this.playNoise({ duration: 0.06, gain: 0.025, lowpass: 4200, highpass: 800, playbackRate: 1.5 });
  }

  fireworkBurst() {
    if (this.playSample("fireworkBurst")) return;
    this.playTone({ freq: 180, type: "triangle", duration: 0.22, gain: 0.09, freqEnd: 48 });
    this.playNoise({ duration: 0.2, gain: 0.11, lowpass: 5200, highpass: 1200, playbackRate: 1.15 });
  }

  jetpackStart() {
    if (this.startLoopSample("jetpack", "jetpackLoop")) return;
    this.startLoop("jetpack", 90, () => {
      this.playNoise({ duration: 0.1, gain: 0.09, lowpass: 2600, highpass: 300, playbackRate: 0.85 });
      this.playTone({ freq: 120, type: "sawtooth", duration: 0.12, gain: 0.028, freqEnd: 140 });
    });
  }

  jetpackStop() {
    this.stopLoopSample("jetpack");
    this.stopLoop("jetpack");
  }

  discoStart() {
    if (this.startLoopSample("disco", "discoLoop")) return;
    this.startLoop("disco", 340, () => {
      this.playTone({ freq: 78, type: "sine", duration: 0.12, gain: 0.11, freqEnd: 44 });
      this.playNoise({ duration: 0.04, gain: 0.04, lowpass: 9000, highpass: 3000, playbackRate: 1.6 });
      this.playTone({ freq: 440, type: "square", duration: 0.05, gain: 0.03, startAt: 0.08 });
    });
  }

  discoStop() {
    this.stopLoopSample("disco");
    this.stopLoop("disco");
  }

  rainStart() {
    if (this.startLoopSample("rain", "rainLoop")) return;
    this.startLoop("rain", 85, () => {
      this.playNoise({ duration: 0.08, gain: 0.02, lowpass: 7000, highpass: 2600, playbackRate: 1.75 });
    });
  }

  rainStop() {
    this.stopLoopSample("rain");
    this.stopLoop("rain");
  }

  flush() {
    if (this.playSample("flush")) return;
    this.playTone({ freq: 620, type: "triangle", duration: 0.45, gain: 0.09, freqEnd: 120 });
    this.playNoise({ duration: 0.5, gain: 0.07, lowpass: 4800, highpass: 180 });
  }

  eggDrop() {
    if (this.playSample("eggDrop")) return;
    this.playTone({ freq: 410, type: "triangle", duration: 0.12, gain: 0.06, freqEnd: 280 });
  }

  hatch() {
    if (this.playSample("hatch")) return;
    this.playTone({ freq: 740, type: "triangle", duration: 0.2, gain: 0.08, freqEnd: 980 });
    this.playTone({ freq: 520, type: "triangle", duration: 0.16, gain: 0.06, startAt: 0.06, freqEnd: 700 });
  }

  tractorHorn() {
    if (this.playSample("tractorHorn")) return;
    this.playTone({ freq: 220, type: "sawtooth", duration: 0.2, gain: 0.08 });
    this.playTone({ freq: 174, type: "sawtooth", duration: 0.22, gain: 0.08, startAt: 0.08 });
  }

  boing() {
    if (this.playSample("boing")) return;
    this.playTone({ freq: 320, type: "triangle", duration: 0.2, gain: 0.075, freqEnd: 120 });
  }

  bubblePop() {
    if (this.playSample("bubblePop")) return;
    this.playTone({ freq: 900, type: "sine", duration: 0.06, gain: 0.05, freqEnd: 1200 });
  }

  sparkle() {
    if (this.playSample("sparkle")) return;
    this.playTone({ freq: 1200, type: "triangle", duration: 0.08, gain: 0.035, freqEnd: 1640 });
  }
}
