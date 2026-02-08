export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.loops = new Map();
    this.baseGain = 0.42;
    this.duck = 0;
  }

  async unlock() {
    this.ensureContext();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
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

  setDuck(amount) {
    this.duck = Math.max(0, Math.min(0.75, amount));
    if (!this.ctx || !this.master) return;
    const target = this.baseGain * (1 - this.duck * 0.42);
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(target, t, 0.12);
  }

  stopAllLoops() {
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
    this.playTone({ freq: 640, duration: 0.07, gain: 0.05, type: "triangle", freqEnd: 820 });
  }

  cluck() {
    this.playTone({ freq: 520, type: "square", duration: 0.09, gain: 0.05, freqEnd: 640 });
    this.playTone({ freq: 460, type: "square", duration: 0.1, gain: 0.048, startAt: 0.08, freqEnd: 380 });
    this.playNoise({ duration: 0.06, gain: 0.025, lowpass: 4200, highpass: 800, playbackRate: 1.5 });
  }

  fireworkBurst() {
    this.playTone({ freq: 180, type: "triangle", duration: 0.22, gain: 0.09, freqEnd: 48 });
    this.playNoise({ duration: 0.2, gain: 0.11, lowpass: 5200, highpass: 1200, playbackRate: 1.15 });
  }

  jetpackStart() {
    this.startLoop("jetpack", 90, () => {
      this.playNoise({ duration: 0.1, gain: 0.09, lowpass: 2600, highpass: 300, playbackRate: 0.85 });
      this.playTone({ freq: 120, type: "sawtooth", duration: 0.12, gain: 0.028, freqEnd: 140 });
    });
  }

  jetpackStop() {
    this.stopLoop("jetpack");
  }

  discoStart() {
    this.startLoop("disco", 340, () => {
      this.playTone({ freq: 78, type: "sine", duration: 0.12, gain: 0.11, freqEnd: 44 });
      this.playNoise({ duration: 0.04, gain: 0.04, lowpass: 9000, highpass: 3000, playbackRate: 1.6 });
      this.playTone({ freq: 440, type: "square", duration: 0.05, gain: 0.03, startAt: 0.08 });
    });
  }

  discoStop() {
    this.stopLoop("disco");
  }

  rainStart() {
    this.startLoop("rain", 85, () => {
      this.playNoise({ duration: 0.08, gain: 0.02, lowpass: 7000, highpass: 2600, playbackRate: 1.75 });
    });
  }

  rainStop() {
    this.stopLoop("rain");
  }

  flush() {
    this.playTone({ freq: 620, type: "triangle", duration: 0.45, gain: 0.09, freqEnd: 120 });
    this.playNoise({ duration: 0.5, gain: 0.07, lowpass: 4800, highpass: 180 });
  }

  eggDrop() {
    this.playTone({ freq: 410, type: "triangle", duration: 0.12, gain: 0.06, freqEnd: 280 });
  }

  hatch() {
    this.playTone({ freq: 740, type: "triangle", duration: 0.2, gain: 0.08, freqEnd: 980 });
    this.playTone({ freq: 520, type: "triangle", duration: 0.16, gain: 0.06, startAt: 0.06, freqEnd: 700 });
  }

  tractorHorn() {
    this.playTone({ freq: 220, type: "sawtooth", duration: 0.2, gain: 0.08 });
    this.playTone({ freq: 174, type: "sawtooth", duration: 0.22, gain: 0.08, startAt: 0.08 });
  }

  boing() {
    this.playTone({ freq: 320, type: "triangle", duration: 0.2, gain: 0.075, freqEnd: 120 });
  }

  bubblePop() {
    this.playTone({ freq: 900, type: "sine", duration: 0.06, gain: 0.05, freqEnd: 1200 });
  }

  sparkle() {
    this.playTone({ freq: 1200, type: "triangle", duration: 0.08, gain: 0.035, freqEnd: 1640 });
  }
}
