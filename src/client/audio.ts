import type { Settings } from './settings';
import type { SfxName } from '../shared/types';

// Procedural audio: a small mixer (master + sfx/music/ambience buses), layered
// synthesized SFX, a per-biome ambience bed and an adaptive music engine that
// shifts between calm / work / tension / triumph.
//
// No audio files — everything is synthesized, which keeps the bundle tiny and
// the whole thing deployable as a static page. All of it starts behind a user
// gesture so autoplay policy is never violated.

type Bus = 'sfx' | 'music' | 'amb';
export type MusicMood = 'calm' | 'work' | 'tension' | 'triumph';

/** Scale degrees (semitones) for each mood, over a common root. */
const MOODS: Record<MusicMood, { scale: number[]; root: number; rate: number; wave: OscillatorType }> = {
  calm: { scale: [0, 3, 5, 7, 10, 12], root: 196, rate: 0.42, wave: 'triangle' },
  work: { scale: [0, 2, 5, 7, 9, 12, 14], root: 220, rate: 0.3, wave: 'triangle' },
  tension: { scale: [0, 1, 5, 6, 8, 11], root: 146.8, rate: 0.2, wave: 'sawtooth' },
  triumph: { scale: [0, 4, 7, 11, 12, 16], root: 261.6, rate: 0.22, wave: 'square' },
};

export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private noiseBuf?: AudioBuffer;
  private started = false;

  private engineOsc?: OscillatorNode;
  private engineSub?: OscillatorNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;

  private musicTimer = 0;
  private musicStep = 0;
  private mood: MusicMood = 'calm';
  private moodGain = 0;
  private ambienceNodes: AudioNode[] = [];

  constructor(private settings: Settings) {}

  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const b of ['sfx', 'music', 'amb'] as Bus[]) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.buses[b] = g;
      }
      // 2s of white noise, reused for every noise-based effect
      const n = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings(this.settings);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (this.master) this.master.gain.value = s.audio.master;
    if (this.buses.sfx) this.buses.sfx.gain.value = s.audio.sfx;
    if (this.buses.music) this.buses.music.gain.value = s.audio.music * 0.7;
    if (this.buses.amb) this.buses.amb.gain.value = s.audio.music * 0.55;
  }

  // --- primitives -----------------------------------------------------------

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private dest(bus: Bus): AudioNode | undefined {
    return this.buses[bus];
  }

  /** A pitched blip, optionally sweeping from `freq` to `toFreq`. */
  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    opts: { bus?: Bus; toFreq?: number; delay?: number; detune?: number } = {},
  ): void {
    const ctx = this.ctx;
    const out = this.dest(opts.bus ?? 'sfx');
    if (!ctx || !out) return;
    const t = this.now() + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.toFreq !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t + dur);
    if (opts.detune) o.detune.setValueAtTime(opts.detune, t);
    // Tiny attack ramp stops the click you get from a hard gain step.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst — impacts, footsteps, wind, breath. */
  private noise(
    dur: number,
    gain: number,
    freq: number,
    opts: { q?: number; bus?: Bus; type?: BiquadFilterType; toFreq?: number; delay?: number } = {},
  ): void {
    const ctx = this.ctx;
    const out = this.dest(opts.bus ?? 'sfx');
    if (!ctx || !this.noiseBuf || !out) return;
    const t = this.now() + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (opts.toFreq !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.toFreq), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // --- SFX families ---------------------------------------------------------

  play(name: SfxName | string): void {
    if (!this.ctx) return;
    switch (name) {
      // tools & parts
      case 'pickup':
        this.tone(520, 0.07, 'square', 0.1);
        this.tone(780, 0.06, 'square', 0.07, { delay: 0.05 });
        break;
      case 'install':
        // clunk + ratchet click: metal seating into metal
        this.noise(0.09, 0.16, 220, { q: 1.2, toFreq: 120 });
        this.tone(180, 0.1, 'sawtooth', 0.11, { toFreq: 90 });
        this.tone(1400, 0.03, 'square', 0.05, { delay: 0.08 });
        this.tone(1700, 0.03, 'square', 0.04, { delay: 0.12 });
        break;
      case 'repair':
        this.tone(392, 0.1, 'triangle', 0.13);
        this.tone(523, 0.1, 'triangle', 0.13, { delay: 0.09 });
        this.tone(784, 0.22, 'triangle', 0.12, { delay: 0.18 });
        this.setMood('work');
        break;
      case 'success':
        this.tone(523, 0.1, 'triangle', 0.15);
        this.tone(784, 0.2, 'triangle', 0.14, { delay: 0.09 });
        break;
      case 'gate':
        this.tone(660, 0.09, 'triangle', 0.15, { toFreq: 990 });
        break;
      case 'enter':
        this.noise(0.16, 0.14, 300, { q: 0.8, toFreq: 140 });
        this.tone(150, 0.14, 'square', 0.1);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, 0.24, 'triangle', 0.16, { delay: i * 0.13 }),
        );
        this.setMood('triumph');
        break;
      case 'fail':
        this.tone(220, 0.5, 'sawtooth', 0.14, { toFreq: 90 });
        this.tone(146, 0.7, 'sine', 0.11, { delay: 0.1, toFreq: 70 });
        break;

      // movement
      case 'footstep':
        this.noise(0.07, 0.09, 200 + Math.random() * 90, { q: 1.6 });
        this.tone(70 + Math.random() * 20, 0.05, 'sine', 0.05);
        break;
      case 'jump':
        this.noise(0.06, 0.05, 420, { q: 1.2 });
        break;
      case 'land':
        this.noise(0.13, 0.15, 160, { q: 0.9, toFreq: 70 });
        this.tone(60, 0.1, 'sine', 0.09);
        break;

      // survival & combat
      case 'hurt':
        this.noise(0.16, 0.16, 700, { q: 0.7, toFreq: 200 });
        this.tone(180, 0.16, 'sawtooth', 0.09, { toFreq: 110 });
        break;
      case 'heal':
        this.tone(440, 0.14, 'sine', 0.1, { toFreq: 660 });
        this.tone(660, 0.22, 'sine', 0.08, { delay: 0.12, toFreq: 880 });
        break;
      case 'swing':
        this.noise(0.13, 0.11, 900, { q: 0.6, toFreq: 260 });
        break;
      case 'wolfGrowl':
        // low rasp with a rising edge — the telegraph cue
        this.noise(0.42, 0.13, 120, { q: 3.5, toFreq: 210 });
        this.tone(84, 0.4, 'sawtooth', 0.07, { toFreq: 130 });
        this.setMood('tension');
        break;
      case 'wolfBite':
        this.noise(0.1, 0.2, 420, { q: 1.1, toFreq: 150 });
        this.tone(120, 0.1, 'square', 0.1, { toFreq: 60 });
        break;
      case 'wolfDie':
        this.tone(300, 0.35, 'sawtooth', 0.1, { toFreq: 80 });
        this.noise(0.3, 0.09, 260, { q: 1.4, toFreq: 90 });
        break;
      case 'crash':
        this.noise(0.28, 0.24, 320, { q: 0.5, toFreq: 90 });
        this.tone(90, 0.26, 'square', 0.14, { toFreq: 45 });
        this.noise(0.18, 0.1, 1800, { q: 0.8, delay: 0.03 });
        break;

      // UI
      case 'uiClick':
        this.tone(880, 0.035, 'square', 0.06);
        break;
      case 'puzzleClick':
        this.tone(620, 0.04, 'square', 0.07);
        break;
    }
  }

  // --- vehicle engine -------------------------------------------------------

  startEngine(): void {
    const ctx = this.ctx;
    const out = this.dest('sfx');
    if (!ctx || !out || this.engineOsc) return;
    this.engineOsc = ctx.createOscillator();
    this.engineSub = ctx.createOscillator();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineGain = ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    // A detuned sub an octave down is what makes it read as an engine rather
    // than a buzzer.
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 30;
    this.engineSub.detune.value = -8;
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 520;
    this.engineFilter.Q.value = 3;
    this.engineGain.gain.value = 0.045;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(out);
    this.engineOsc.start();
    this.engineSub.start();
  }

  updateEngine(speed: number): void {
    if (!this.engineOsc || !this.engineGain || !this.engineSub || !this.engineFilter) return;
    const s = Math.min(Math.abs(speed), 20);
    const f = 52 + s * 13;
    this.engineOsc.frequency.value = f;
    this.engineSub.frequency.value = f * 0.5;
    this.engineFilter.frequency.value = 420 + s * 90;
    this.engineGain.gain.value = 0.04 + (s / 20) * 0.07;
  }

  stopEngine(): void {
    for (const n of [this.engineOsc, this.engineSub]) {
      try {
        n?.stop();
      } catch {
        /* already stopped */
      }
      n?.disconnect();
    }
    this.engineGain?.disconnect();
    this.engineFilter?.disconnect();
    this.engineOsc = undefined;
    this.engineSub = undefined;
    this.engineGain = undefined;
    this.engineFilter = undefined;
  }

  // --- ambience -------------------------------------------------------------

  /** Swap the biome ambience bed. Safe to call repeatedly with the same id. */
  setAmbience(kind: 'garage' | 'mountain'): void {
    const ctx = this.ctx;
    const out = this.dest('amb');
    if (!ctx || !out) return;
    for (const n of this.ambienceNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* not a source */
      }
      n.disconnect();
    }
    this.ambienceNodes = [];

    if (kind === 'garage') {
      // fluorescent/compressor hum: two close low tones plus filtered hiss
      for (const f of [55, 82.5]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        o.type = 'triangle';
        o.frequency.value = f;
        lp.type = 'lowpass';
        lp.frequency.value = 240;
        g.gain.value = 0.05;
        o.connect(lp).connect(g).connect(out);
        o.start();
        this.ambienceNodes.push(o, g, lp);
      }
      this.addNoiseBed(out, 900, 0.4, 0.012);
    } else {
      // wind: broad filtered noise with a slow sweeping filter
      const { src, filter, gain } = this.addNoiseBed(out, 480, 0.7, 0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      this.ambienceNodes.push(src, filter, gain, lfo, lfoGain);
      // a distant low drone for altitude
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 48;
      g.gain.value = 0.035;
      o.connect(g).connect(out);
      o.start();
      this.ambienceNodes.push(o, g);
    }
  }

  private addNoiseBed(
    out: AudioNode,
    freq: number,
    q: number,
    gain: number,
  ): { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(out);
    src.start();
    this.ambienceNodes.push(src, filter, g);
    return { src, filter, gain: g };
  }

  // --- adaptive music -------------------------------------------------------

  /**
   * Shift the music bed. Tension decays back to whatever the level was doing,
   * so a wolf encounter colours the score without permanently changing it.
   */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodGain = mood === 'tension' ? 8 : mood === 'triumph' ? 10 : 0;
  }

  private startMusic(): void {
    const tick = () => {
      if (!this.ctx || !this.buses.music) return;
      const m = MOODS[this.mood];
      const semi =
        m.scale[this.musicStep % m.scale.length] +
        (Math.floor(this.musicStep / m.scale.length) % 2 ? 12 : 0);
      this.tone(m.root * Math.pow(2, semi / 12), 0.62, m.wave, 0.045, { bus: 'music' });
      if (this.musicStep % 4 === 0) {
        this.tone(m.root / 2, 1.5, 'sine', 0.038, { bus: 'music' });
      }
      // tension adds an offbeat pulse
      if (this.mood === 'tension' && this.musicStep % 2 === 1) {
        this.tone(m.root / 4, 0.3, 'square', 0.03, { bus: 'music', delay: m.rate * 0.5 });
      }
      this.musicStep++;
      // Transient moods relax back to the working bed after a few bars.
      if (this.moodGain > 0 && --this.moodGain <= 0 && this.mood !== 'calm') this.mood = 'work';
      this.musicTimer = window.setTimeout(tick, m.rate * 1000);
    };
    tick();
  }

  stopMusic(): void {
    clearTimeout(this.musicTimer);
  }
}
