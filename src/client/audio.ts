import type { Settings } from './settings';

// Procedural audio: a small mixer (master + sfx/music buses), synthesized SFX,
// an ambient hum + gentle generative music loop, and a speed-driven kart engine.
// No audio files. All starts behind the CLOCK-IN user gesture (autoplay-safe).
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private busSfx?: GainNode;
  private busMusic?: GainNode;
  private noiseBuf?: AudioBuffer;
  private started = false;

  private engineOsc?: OscillatorNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;

  private musicTimer = 0;
  private musicStep = 0;

  constructor(private settings: Settings) {}

  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.busSfx = this.ctx.createGain();
      this.busMusic = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.busSfx.connect(this.master);
      this.busMusic.connect(this.master);
      // 1s of white noise reused for bursts
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings(this.settings);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startAmbient();
      this.startMusic();
    }
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (this.master) this.master.gain.value = s.audio.master;
    if (this.busSfx) this.busSfx.gain.value = s.audio.sfx;
    if (this.busMusic) this.busMusic.gain.value = s.audio.music;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, dest?: AudioNode): void {
    if (!this.ctx || !this.busSfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.busSfx);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, gain: number, freq: number, q = 1): void {
    if (!this.ctx || !this.noiseBuf || !this.busSfx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.busSfx);
    src.start(t);
    src.stop(t + dur);
  }

  play(name: string): void {
    switch (name) {
      case 'pickup':
        this.tone(660, 0.08, 'square', 0.14);
        break;
      case 'install':
        this.tone(300, 0.14, 'sawtooth', 0.16);
        setTimeout(() => this.tone(460, 0.12, 'sawtooth', 0.14), 80);
        break;
      case 'success':
        this.tone(523, 0.1, 'triangle', 0.18);
        setTimeout(() => this.tone(784, 0.18, 'triangle', 0.18), 90);
        break;
      case 'gate':
        this.tone(880, 0.12, 'triangle', 0.2);
        break;
      case 'enter':
        this.tone(200, 0.12, 'square', 0.16);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 130));
        break;
      case 'footstep':
        this.noise(0.08, 0.12, 230 + Math.random() * 60, 1.4);
        break;
      case 'jump':
        this.tone(420, 0.12, 'sine', 0.1);
        break;
      case 'land':
        this.noise(0.12, 0.18, 150, 1.0);
        break;
      case 'uiClick':
        this.tone(900, 0.04, 'square', 0.08);
        break;
      case 'puzzleClick':
        this.tone(680, 0.05, 'square', 0.1);
        break;
    }
  }

  // --- kart engine loop ---
  startEngine(): void {
    if (!this.ctx || !this.busSfx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineGain.gain.value = 0.05;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.busSfx);
    this.engineOsc.start();
  }
  updateEngine(speed: number): void {
    if (!this.engineOsc || !this.engineGain) return;
    const s = Math.min(Math.abs(speed), 17);
    this.engineOsc.frequency.value = 55 + s * 13;
    this.engineGain.gain.value = 0.04 + (s / 17) * 0.06;
  }
  stopEngine(): void {
    try {
      this.engineOsc?.stop();
    } catch {
      /* already stopped */
    }
    this.engineOsc?.disconnect();
    this.engineGain?.disconnect();
    this.engineFilter?.disconnect();
    this.engineOsc = undefined;
    this.engineGain = undefined;
    this.engineFilter = undefined;
  }

  // --- ambient hum ---
  private startAmbient(): void {
    if (!this.ctx || !this.busMusic) return;
    for (const f of [55, 82.5]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = f;
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      g.gain.value = 0.03;
      o.connect(lp).connect(g).connect(this.busMusic);
      o.start();
    }
  }

  // --- gentle generative arpeggio ---
  private startMusic(): void {
    const scale = [0, 3, 5, 7, 10, 12];
    const root = 196; // G3
    const tick = () => {
      if (!this.ctx || !this.busMusic) return;
      const semi = scale[this.musicStep % scale.length] + (Math.floor(this.musicStep / scale.length) % 2 ? 12 : 0);
      this.tone(root * Math.pow(2, semi / 12), 0.6, 'triangle', 0.05, this.busMusic);
      if (this.musicStep % 4 === 0) this.tone(root / 2, 1.4, 'sine', 0.04, this.busMusic);
      this.musicStep++;
      this.musicTimer = window.setTimeout(tick, 400);
    };
    tick();
  }
}
