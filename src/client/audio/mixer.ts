/// <reference types="vite/client" />
import * as THREE from 'three';
import type { World } from '../../sim/world';
import type { Settings } from '../settings';
import type { Audio } from './audio';

// The game's sound. Recorded CC0 foley (Kenney) for anything physical —
// footsteps, clanks, doors — and synthesis for everything that has to react
// continuously: the engine, the ratchet, pouring, wind, birds and crickets,
// the radio babble and the music. Positional sounds pan and fall off relative
// to the camera.

type Pos = { x: number; y: number; z: number };

const SAMPLES: Record<string, string[]> = {
  foot_concrete: [0, 1, 2, 3, 4].map((i) => `foot_concrete_${i}`),
  foot_grass: [0, 1, 2, 3, 4].map((i) => `foot_grass_${i}`),
  foot_wood: [0, 1, 2, 3, 4].map((i) => `foot_wood_${i}`),
  foot_snow: [0, 1, 2, 3, 4].map((i) => `foot_snow_${i}`),
  foot_dirt: [0, 1, 2, 3, 4].map((i) => `foot_dirt_${i}`),
  metalLight: [0, 1, 2].map((i) => `imp_metal_light_${i}`),
  metalMed: [0, 1, 2].map((i) => `imp_metal_medium_${i}`),
  metalHeavy: [0, 1, 2].map((i) => `imp_metal_heavy_${i}`),
  plateHeavy: [0, 1, 2].map((i) => `imp_plate_heavy_${i}`),
  plateMed: [0, 1, 2].map((i) => `imp_plate_medium_${i}`),
  woodMed: [0, 1, 2].map((i) => `imp_wood_medium_${i}`),
  woodHeavy: [0, 1, 2].map((i) => `imp_wood_heavy_${i}`),
  softHeavy: [0, 1, 2].map((i) => `imp_soft_heavy_${i}`),
  softMed: [0, 1, 2].map((i) => `imp_soft_medium_${i}`),
  punch: [0, 1, 2].map((i) => `imp_punch_medium_${i}`),
  tin: [0, 1, 2].map((i) => `imp_tin_medium_${i}`),
  generic: [0, 1, 2].map((i) => `imp_generic_light_${i}`),
  glass: [0, 1, 2].map((i) => `imp_glass_light_${i}`),
  metalClick: ['metalClick'],
  latch: ['metalLatch'],
  doorOpen: ['doorOpen_1', 'doorOpen_2'],
  doorClose: ['doorClose_1', 'doorClose_2'],
  creak: ['creak1', 'creak2'],
  cloth: ['cloth1', 'cloth2', 'cloth3'],
  belt: ['beltHandle1', 'beltHandle2'],
  coins: ['handleCoins'],
  leather: ['dropLeather'],
  pot: ['metalPot1', 'metalPot2'],
  strike: ['drawKnife1'],
  chop: ['chop'],
  click: ['ui_click_001', 'ui_click_003'],
  select: ['ui_select_002'],
  confirm: ['ui_confirmation_001', 'ui_confirmation_002'],
  toggle: ['ui_toggle_001', 'ui_toggle_002'],
  tick: ['ui_tick_001', 'ui_tick_002'],
  error: ['ui_error_004', 'ui_error_006'],
  switch: ['ui_switch_002', 'ui_switch_004'],
  glitch: ['ui_glitch_002'],
  sheetOpen: ['ui_maximize_003'],
  sheetClose: ['ui_minimize_003'],
  bong: ['ui_bong_001'],
  uiDrop: ['ui_drop_002'],
  scratch: ['ui_scratch_002'],
};

interface Voice {
  gain: GainNode;
  pan: StereoPannerNode;
}

class EngineSynth {
  out: GainNode;
  private saw: OscillatorNode;
  private sub: OscillatorNode;
  private noise: AudioBufferSourceNode;
  private noiseGain: GainNode;
  private filter: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private dist: GainNode;
  rpm = 0.12;
  private gear = 1;
  private target = 0;
  crank = 0;
  on = false;
  private ctx: AudioContext;

  constructor(ctx: AudioContext, dest: AudioNode, noiseBuf: AudioBuffer) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.dist = ctx.createGain();
    this.dist.gain.value = 1;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.5;
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    this.shaper.curve = curve;
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    const sg = ctx.createGain();
    sg.gain.value = 0.55;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    this.saw.connect(sg).connect(this.shaper);
    this.sub.connect(bg).connect(this.shaper);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuf;
    this.noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 180;
    nf.Q.value = 0.8;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.25;
    this.noise.connect(nf).connect(this.noiseGain).connect(this.filter);
    this.shaper.connect(this.filter).connect(this.out).connect(this.dist).connect(dest);
    this.saw.start();
    this.sub.start();
    this.noise.start();
  }

  update(dt: number, speed: number, throttle: number, running: boolean, top: number): { shift: boolean; pop: boolean } {
    let shift = false;
    let pop = false;
    if (this.crank > 0) {
      // starter motor: a labouring whine that catches
      this.crank -= dt;
      const k = 1 - this.crank / 1.3;
      this.set(0.07 + Math.sin(k * 40) * 0.01, 0.25, 0.35 + k * 0.2);
      return { shift, pop };
    }
    if (!running) {
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      return { shift, pop };
    }
    const ratios = [0, 3.4, 2.1, 1.45, 1.05, 0.82];
    const v = Math.abs(speed) / Math.max(1, top);
    let wanted = 0.12 + v * ratios[this.gear] * 1.05;
    if (wanted > 0.92 && this.gear < 5 && throttle > 0) {
      this.gear++;
      shift = true;
    } else if (wanted < 0.38 && this.gear > 1) this.gear--;
    wanted = 0.12 + v * ratios[this.gear] * 1.05 + throttle * 0.08;
    const before = this.target;
    this.target = Math.min(1.05, Math.max(0.12, wanted));
    if (before - this.target > 0.25 && Math.random() < 0.5) pop = true;
    this.rpm += (this.target - this.rpm) * Math.min(1, dt * (throttle > 0 ? 5 : 3));
    this.set(this.rpm, Math.max(0.3, throttle), 0.55 + throttle * 0.35);
    return { shift, pop };
  }

  dispose(): void {
    try {
      this.saw.stop();
      this.sub.stop();
      this.noise.stop();
    } catch {
      /* already stopped */
    }
    this.dist.disconnect();
  }

  /** Distance attenuation, kept separate from the engine's own level. */
  distance(g: number, t: number): void {
    if (Number.isFinite(g)) this.dist.gain.setTargetAtTime(g, t, 0.1);
  }

  private set(rpm: number, load: number, vol: number): void {
    const t = this.ctx.currentTime;
    const r = Number.isFinite(rpm) ? Math.min(1.05, Math.max(0, rpm)) : 0.12;
    const f = 26 + r * 120;
    this.saw.frequency.setTargetAtTime(f, t, 0.03);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    // a low, throaty ceiling: high revs growl rather than whine
    this.filter.frequency.setTargetAtTime(320 + r * 1100 * (0.5 + load * 0.5), t, 0.05);
    this.noiseGain.gain.setTargetAtTime(0.15 + load * 0.25, t, 0.05);
    this.out.gain.setTargetAtTime(vol * 0.34, t, 0.08);
  }
}

export class Mixer implements Audio {
  private ctx: AudioContext;
  private master: GainNode;
  private sfx: GainNode;
  private music: GainNode;
  private voiceBus: GainNode;
  private amb: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private noiseBuf: AudioBuffer;
  private engines = new Map<string, EngineSynth>();
  private listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
  private ambLayers: Record<string, { g: GainNode }> = {};
  private rumble?: { g: GainNode; f: BiquadFilterNode };
  private pour?: { g: GainNode };
  private flareFizz?: { g: GainNode };
  private genLoop?: { g: GainNode };
  private howlT = 6;
  private musicT = 0;
  private musicStep = 0;
  private birdT = 2;
  private cricketT = 0;
  private lastPlay = new Map<string, number>();
  private settings: Settings;
  private mood: 'calm' | 'work' | 'tension' = 'calm';
  private analyser: AnalyserNode;

  constructor(settings: Settings) {
    this.settings = settings;
    this.ctx = new AudioContext();
    // master → gentle glue compressor → soft clip → brick-wall-ish limiter.
    // Nothing downstream of master can ever exceed full scale.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const clip = this.ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
    }
    clip.curve = curve;
    clip.oversample = '2x';
    const limit = this.ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.08;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master = this.ctx.createGain();
    this.master.connect(comp).connect(clip).connect(limit).connect(this.ctx.destination);
    limit.connect(this.analyser);
    this.sfx = this.bus();
    this.music = this.bus();
    this.voiceBus = this.ctx.createGain();
    // the radio: band-limited like a real handset, never shrill
    const radioLo = this.ctx.createBiquadFilter();
    radioLo.type = 'lowpass';
    radioLo.frequency.value = 2400;
    radioLo.Q.value = -3;
    const radioHi = this.ctx.createBiquadFilter();
    radioHi.type = 'highpass';
    radioHi.frequency.value = 220;
    radioHi.Q.value = -3;
    this.voiceBus.connect(radioHi).connect(radioLo).connect(this.master);
    this.amb = this.bus();
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings(settings);
    void this.load();
    this.buildAmbience();
  }

  private bus(): GainNode {
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  private async load(): Promise<void> {
    const base = import.meta.env.BASE_URL ?? '/';
    const names = new Set(Object.values(SAMPLES).flat());
    await Promise.all(
      [...names].map(async (n) => {
        try {
          const r = await fetch(`${base}audio/${n}.ogg`);
          const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
          this.buffers.set(n, buf);
        } catch {
          /* missing sample: that sound just stays silent */
        }
      }),
    );
  }

  applySettings(s: Settings): void {
    this.settings = s;
    const a = s.audio;
    this.master.gain.value = a.master;
    this.sfx.gain.value = a.sfx;
    this.music.gain.value = a.music * 0.55;
    this.voiceBus.gain.value = a.voice;
    this.amb.gain.value = a.sfx * 0.8;
  }

  /** Pull everything down while the pause menu is up. */
  duck(on: boolean): void {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.settings.audio.master * (on ? 0.25 : 1), t, 0.08);
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  stopAll(): void {
    for (const e of this.engines.values()) e.dispose();
    this.engines.clear();
    if (this.pour) this.pour.g.gain.value = 0;
    if (this.rumble) this.rumble.g.gain.value = 0;
    if (this.genLoop) this.genLoop.g.gain.value = 0;
  }

  // --- positional helpers --------------------------------------------------------------

  private voiceAt(pos?: Pos, vol = 1, bus: GainNode = this.sfx): Voice | null {
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    let gain = vol;
    if (pos) {
      const dx = pos.x - this.listener.pos.x;
      const dy = pos.y - this.listener.pos.y;
      const dz = pos.z - this.listener.pos.z;
      const d = Math.hypot(dx, dy, dz);
      gain *= 1 / (1 + d * 0.12 + d * d * 0.004);
      if (gain < 0.01) return null;
      const r = this.listener.right;
      p.pan.value = Math.max(-0.85, Math.min(0.85, (dx * r.x + dz * r.z) / Math.max(1, d)));
    }
    g.gain.value = gain;
    g.connect(p).connect(bus);
    return { gain: g, pan: p };
  }

  private sample(set: string, pos?: Pos, vol = 1, rate = 1): void {
    const list = SAMPLES[set];
    if (!list) return;
    const buf = this.buffers.get(list[Math.floor(Math.random() * list.length)]);
    if (!buf) return;
    const v = this.voiceAt(pos, vol);
    if (!v) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    src.connect(v.gain);
    src.start();
  }

  /** A short synthesized sound: oscillator or noise, with an envelope. */
  private synth(o: {
    type?: OscillatorType | 'noise';
    f: number;
    f2?: number;
    dur: number;
    vol?: number;
    pos?: Pos;
    delay?: number;
    filter?: { type: BiquadFilterType; f: number; q?: number; f2?: number };
    attack?: number;
    bus?: GainNode;
  }): void {
    const v = this.voiceAt(o.pos, o.vol ?? 0.3, o.bus ?? this.sfx);
    if (!v) return;
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + (o.attack ?? 0.005));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let src: AudioScheduledSourceNode;
    if (o.type === 'noise') {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.playbackRate.value = o.f / 1000;
      src = s;
    } else {
      const s = this.ctx.createOscillator();
      s.type = (o.type as OscillatorType) ?? 'sine';
      s.frequency.setValueAtTime(o.f, t0);
      if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
      src = s;
    }
    let node: AudioNode = src;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.f, t0);
      if (o.filter.f2) f.frequency.exponentialRampToValueAtTime(o.filter.f2, t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(env).connect(v.gain);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  private throttle(name: string, gap: number): boolean {
    const now = this.ctx.currentTime;
    if ((this.lastPlay.get(name) ?? -1) > now - gap) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  // --- the vocabulary ------------------------------------------------------------------

  play(name: string, pos?: Pos, vol = 1): void {
    if (this.ctx.state !== 'running') return;
    switch (name) {
      case 'pickup':
        this.sample('cloth', pos, 0.6 * vol);
        this.sample('metalLight', pos, 0.3 * vol, 1.3);
        break;
      case 'pickupHeavy':
        this.sample('cloth', pos, 0.7);
        this.sample('softMed', pos, 0.5);
        this.synth({ type: 'triangle', f: 140, f2: 90, dur: 0.18, vol: 0.12 });
        break;
      case 'pickupTool':
        this.sample('belt', pos, 0.8);
        break;
      case 'keys':
        this.sample('coins', pos, 0.9, 1.3);
        break;
      case 'drop':
        this.sample('softMed', pos, 0.6 * vol);
        break;
      case 'throw':
        this.sample('cloth', pos, 0.6);
        this.synth({ type: 'noise', f: 900, dur: 0.3, vol: 0.2, filter: { type: 'bandpass', f: 800, f2: 2400, q: 1.5 } });
        break;
      case 'ratchetOut':
        for (let i = 0; i < 7; i++) this.synth({ type: 'square', f: 2600 + Math.random() * 400, dur: 0.025, vol: 0.12, pos, delay: i * 0.045, filter: { type: 'highpass', f: 1500 } });
        this.sample('metalClick', pos, 0.6, 0.9);
        break;
      case 'boltClick':
        this.sample('metalClick', pos, 1);
        this.sample('metalLight', pos, 0.5, 1.4);
        break;
      case 'boltSlip':
        this.synth({ type: 'sawtooth', f: 1800, f2: 600, dur: 0.25, vol: 0.12, pos, filter: { type: 'bandpass', f: 1400, q: 4 } });
        this.sample('error', undefined, 0.4);
        break;
      case 'bandTick':
        this.sample('tick', undefined, 0.6, 1.2);
        break;
      case 'partOff':
        this.sample('metalMed', pos, 0.8);
        break;
      case 'partOn':
        this.sample('metalHeavy', pos, 0.8);
        this.sample('latch', pos, 0.7);
        break;
      case 'hoodOpen':
        this.sample('latch', pos, 0.8);
        this.sample('creak', pos, 0.5, 1.2);
        break;
      case 'hoodClose':
        this.sample('plateHeavy', pos, 0.9);
        break;
      case 'clampOn':
        this.sample('metalClick', pos, 0.9, 1.1);
        break;
      case 'clampOff':
        this.sample('metalClick', pos, 0.7, 0.8);
        break;
      case 'zap':
        for (let i = 0; i < 8; i++) this.synth({ type: 'noise', f: 3000, dur: 0.05, vol: 0.35, pos, delay: i * 0.03 + Math.random() * 0.02, filter: { type: 'highpass', f: 2500 } });
        this.sample('glitch', undefined, 0.5);
        break;
      case 'jackUp':
        for (let i = 0; i < 4; i++) this.synth({ type: 'triangle', f: 700, f2: 950, dur: 0.14, vol: 0.08, pos, delay: i * 0.18 });
        this.sample('metalMed', pos, 0.5, 0.8);
        break;
      case 'jackDown':
        this.synth({ type: 'noise', f: 2000, dur: 0.8, vol: 0.18, pos, filter: { type: 'bandpass', f: 3000, q: 1 } });
        this.sample('metalHeavy', pos, 0.6, 0.8);
        break;
      case 'clunk':
        this.sample('metalMed', pos, 0.8, 0.9);
        break;
      case 'splash':
        this.synth({ type: 'noise', f: 1200, dur: 0.4, vol: 0.25, pos, filter: { type: 'lowpass', f: 1800 } });
        break;
      case 'glugDone':
        this.sample('confirm', undefined, 0.4);
        break;
      case 'clipboard':
        this.sample('scratch', undefined, 0.6);
        this.sample('uiDrop', undefined, 0.5);
        break;
      case 'systemGo':
        this.chime([659.25, 987.77, 1318.5], 0.16);
        break;
      case 'allGo':
        this.chime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.14);
        break;
      case 'panelSolved':
        this.sample('confirm', undefined, 0.6);
        this.chime([880, 1318.5], 0.12);
        break;
      case 'fuse':
        this.sample('switch', undefined, 0.8);
        break;
      case 'lever':
        this.sample('switch', undefined, 0.8, 0.7);
        this.sample('metalMed', undefined, 0.4);
        break;
      case 'valveTick':
        if (this.throttle('valve', 0.07)) this.sample('tick', undefined, 0.35, 0.8 + Math.random() * 0.3);
        break;
      case 'hiss':
        this.synth({ type: 'noise', f: 2500, dur: 0.6, vol: 0.2, filter: { type: 'highpass', f: 3000 } });
        this.sample('error', undefined, 0.3);
        break;
      case 'doorOpen':
        this.sample('doorOpen', pos, 0.8);
        break;
      case 'doorClose':
        this.sample('doorClose', pos, 0.8);
        break;
      case 'crash':
        this.sample(vol > 0.6 ? 'plateHeavy' : 'plateMed', pos, 0.6 + vol * 0.6, 0.8);
        if (vol > 0.5) this.sample('metalHeavy', pos, 0.6, 0.7);
        break;
      case 'horn':
        this.synth({ type: 'square', f: 392, dur: 0.5, vol: 0.12, filter: { type: 'lowpass', f: 1800 }, attack: 0.02 });
        this.synth({ type: 'square', f: 494, dur: 0.5, vol: 0.1, filter: { type: 'lowpass', f: 1800 }, attack: 0.02 });
        break;
      case 'land':
        this.sample('softMed', undefined, 0.3 + vol * 0.6);
        break;
      case 'jump':
        this.sample('cloth', undefined, 0.3);
        break;
      case 'hurt':
        this.sample('punch', undefined, 0.6);
        this.synth({ type: 'sawtooth', f: 180, f2: 110, dur: 0.22, vol: 0.12, filter: { type: 'lowpass', f: 900 } });
        break;
      case 'heal':
        this.sample('confirm', undefined, 0.5);
        break;
      case 'flare':
        this.sample('strike', pos, 0.9);
        break;
      case 'swing':
        this.synth({ type: 'noise', f: 700, dur: 0.2, vol: 0.2, filter: { type: 'bandpass', f: 600, f2: 1800, q: 2 } });
        break;
      case 'hit':
        this.sample('punch', pos, 0.9);
        break;
      case 'growl':
        this.synth({ type: 'sawtooth', f: 90, f2: 70, dur: 0.9, vol: 0.18 * vol, pos, filter: { type: 'lowpass', f: 500, q: 2 }, attack: 0.1 });
        this.synth({ type: 'noise', f: 300, dur: 0.9, vol: 0.1 * vol, pos, filter: { type: 'bandpass', f: 250, q: 3 }, attack: 0.1 });
        break;
      case 'bite':
        this.sample('punch', pos, 0.9, 1.2);
        this.synth({ type: 'sawtooth', f: 260, f2: 160, dur: 0.25, vol: 0.2, pos, filter: { type: 'lowpass', f: 1500 } });
        break;
      case 'yelp':
        this.synth({ type: 'triangle', f: 900, f2: 1500, dur: 0.25, vol: 0.2, pos });
        break;
      case 'howl':
        // a rising, wavering call with a lower voice under it
        this.synth({ type: 'sine', f: 420, f2: 640, dur: 2.2, vol: 0.14 * vol, pos, attack: 0.5 });
        this.synth({ type: 'triangle', f: 300, f2: 470, dur: 2.0, vol: 0.05 * vol, pos, attack: 0.6, delay: 0.1 });
        break;
      case 'genStart':
        // cord yank, a few coughs, then it catches
        this.synth({ type: 'noise', f: 900, dur: 0.25, vol: 0.25, pos, filter: { type: 'bandpass', f: 700, f2: 1400, q: 2 } });
        for (let i = 0; i < 4; i++) this.synth({ type: 'noise', f: 200, dur: 0.12, vol: 0.3, pos, delay: 0.3 + i * 0.16, filter: { type: 'lowpass', f: 400 } });
        break;
      case 'rockslide':
        this.synth({ type: 'noise', f: 120, dur: 3.5, vol: 0.6, pos, attack: 0.15, filter: { type: 'lowpass', f: 260 } });
        for (let i = 0; i < 9; i++) this.sample(i % 2 ? 'plateHeavy' : 'woodHeavy', pos, 0.8, 0.5 + Math.random() * 0.3);
        break;
      case 'latch':
        this.sample('latch', pos, 0.9);
        break;
      case 'objective':
        this.sample('bong', undefined, 0.35);
        break;
      case 'lore':
        this.chime([220, 277.18, 329.63, 415.3], 0.1, 'triangle', 0.18);
        break;
      case 'punch':
        this.sample('metalLight', pos, 0.8, 0.8);
        this.synth({ type: 'sine', f: 1760, dur: 0.6, vol: 0.12, pos });
        break;
      case 'locker':
        this.sample('latch', pos, 0.9);
        this.sample('creak', pos, 0.5, 1.4);
        break;
      case 'gate':
        this.sample('select', undefined, 0.6);
        break;
      case 'binClang':
        this.sample('metalHeavy', pos, 1);
        break;
      case 'strap':
        this.sample('cloth', pos, 0.6);
        this.sample('metalClick', pos, 0.6);
        break;
      case 'click':
        this.sample('toggle', undefined, 0.6);
        break;
      case 'sheetOpen':
        this.sample('sheetOpen', undefined, 0.35);
        break;
      case 'ui':
        this.sample('click', undefined, 0.5);
        break;
      case 'uiHover':
        this.sample('tick', undefined, 0.25);
        break;
      case 'uiClick':
        this.sample('select', undefined, 0.5);
        break;
      case 'resultsStamp':
        this.sample('plateHeavy', undefined, 0.5);
        this.chime([523, 659, 784], 0.08, 'triangle', 0.09);
        break;
      case 'gradeStamp':
        this.sample('punch', undefined, 0.8);
        this.sample('woodHeavy', undefined, 0.5);
        this.chime([392, 523, 659, 1046], 0.1, 'triangle', 0.06);
        break;
      default:
        break;
    }
  }

  private chime(freqs: number[], vol: number, type: OscillatorType = 'sine', gap = 0.07): void {
    freqs.forEach((f, i) => {
      this.synth({ type, f, dur: 1.2, vol, delay: i * gap, attack: 0.004 });
      this.synth({ type: 'sine', f: f * 2.01, dur: 0.6, vol: vol * 0.25, delay: i * gap });
    });
  }

  foot(surface: string, speed: number): void {
    if (this.ctx.state !== 'running') return;
    const set = surface === 'grass' ? 'foot_grass' : surface === 'wood' ? 'foot_wood' : surface === 'snow' ? 'foot_snow' : surface === 'gravel' || surface === 'dirt' ? 'foot_dirt' : 'foot_concrete';
    this.sample(set, undefined, 0.35 + Math.min(0.4, speed * 0.04));
  }

  engine(vehicle: string, on: boolean): void {
    let e = this.engines.get(vehicle);
    if (!e && on) {
      e = new EngineSynth(this.ctx, this.sfx, this.noiseBuf);
      this.engines.set(vehicle, e);
      e.crank = 1.3;
      this.synth({ type: 'noise', f: 400, dur: 0.25, vol: 0.3, delay: 1.25, filter: { type: 'lowpass', f: 600 } });
    }
  }

  voice(line: string, who: string): void {
    if (this.settings.accessibility.tts && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 1.05;
      u.volume = this.settings.audio.voice;
      speechSynthesis.speak(u);
      return;
    }
    if (this.ctx.state !== 'running') return;
    // Radio chatter: a squelch, then burbling formant syllables, then a click.
    const base = who === 'Dispatch' ? 150 : 210;
    const syll = Math.min(26, Math.max(4, Math.round(line.length / 4.2)));
    const bus = this.voiceBus;
    this.synth({ type: 'noise', f: 4000, dur: 0.12, vol: 0.12, filter: { type: 'bandpass', f: 2200, q: 0.8 }, bus });
    let t = 0.12;
    for (let i = 0; i < syll; i++) {
      const len = 0.07 + Math.random() * 0.08;
      const f = base * (0.85 + Math.random() * 0.4) * (i % 7 === 6 ? 1.25 : 1);
      this.synth({ type: 'sawtooth', f, f2: f * (0.9 + Math.random() * 0.2), dur: len, vol: 0.04, delay: t, attack: 0.015, filter: { type: "bandpass", f: 650 + Math.random() * 600, q: 2 }, bus });
      t += len + (Math.random() < 0.18 ? 0.12 : 0.02);
    }
    this.synth({ type: 'noise', f: 4000, dur: 0.08, vol: 0.1, delay: t + 0.05, filter: { type: 'bandpass', f: 2600, q: 1 }, bus });
  }

  // --- continuous ---------------------------------------------------------------------------

  private loopNoise(filterType: BiquadFilterType, f: number, q: number, dest: AudioNode): { g: GainNode; f: BiquadFilterNode } {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filt).connect(g).connect(dest);
    src.start();
    return { g, f: filt };
  }

  private buildAmbience(): void {
    this.ambLayers.wind = this.loopNoise('lowpass', 420, 0.7, this.amb);
    this.ambLayers.hum = this.loopNoise('lowpass', 120, 2, this.amb);
    this.rumble = this.loopNoise('lowpass', 300, 1, this.sfx);
    this.pour = this.loopNoise('bandpass', 700, 2, this.sfx);
    this.flareFizz = this.loopNoise('highpass', 3500, 0.7, this.sfx);
    this.genLoop = this.loopNoise('lowpass', 140, 4, this.sfx);
  }

  frame(dt: number, w: World, cam: THREE.Camera): void {
    if (this.ctx.state !== 'running') return;
    cam.getWorldPosition(this.listener.pos);
    this.listener.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;

    // engines
    for (const [key, e] of this.engines) {
      const v = w.vehicles.get(key);
      if (!v) continue;
      const r = e.update(dt, v.speed, Math.max(0, v.throttle), v.running, v.def.engine.topSpeed);
      if (r.shift) this.synth({ type: 'noise', f: 600, dur: 0.12, vol: 0.12, filter: { type: 'lowpass', f: 500 } });
      if (r.pop) this.synth({ type: 'noise', f: 800, dur: 0.07, vol: 0.35, delay: 0.05, filter: { type: 'lowpass', f: 900 } });
      const d = this.listener.pos.distanceTo(new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z));
      e.distance(1 / (1 + Math.max(0, d - 4) * 0.1), t);
    }
    // tyres on the ground
    const pv = w.player.vehicle ? w.vehicles.get(w.player.vehicle) : undefined;
    if (this.rumble) {
      const sp = pv ? Math.abs(pv.speed) : 0;
      const off = pv ? !w.terrain.onRoad(pv.pos.x, pv.pos.z) : false;
      this.rumble.g.gain.setTargetAtTime(Math.min(0.35, sp * 0.02) * (off ? 1.6 : 1), t, 0.1);
      this.rumble.f.frequency.setTargetAtTime(150 + sp * 25 + (off ? 300 : 0), t, 0.1);
    }
    // pouring
    const pouring = w.focus?.verb === 'pour' && !w.focus.disabled && w.holdProgress > 0 && w.player.mode === 'foot';
    if (this.pour) {
      this.pour.g.gain.setTargetAtTime(pouring ? 0.25 + Math.sin(t * 18) * 0.1 : 0, t, 0.05);
    }
    // flares
    let fz = 0;
    for (const f of w.flares) fz = Math.max(fz, 1 / (1 + this.listener.pos.distanceTo(new THREE.Vector3(f.pos.x, f.pos.y, f.pos.z)) * 0.3));
    this.flareFizz?.g.gain.setTargetAtTime(fz * 0.12, t, 0.2);

    // ambience: indoor hum vs outdoor wind; birds by day, crickets at night
    const indoors = (w.level.rooms ?? []).some((r) => w.player.pos.x > r.x0 && w.player.pos.x < r.x1 && w.player.pos.z > r.z0 && w.player.pos.z < r.z1);
    const alt = Math.max(0, w.player.pos.y - 30) / 60;
    this.ambLayers.wind.g.gain.setTargetAtTime(indoors ? 0.015 : 0.05 + alt * 0.09, t, 1);
    this.ambLayers.hum.g.gain.setTargetAtTime(indoors ? 0.05 : 0, t, 1);
    const night = w.hour > 20.3 || w.hour < 5.5;
    this.birdT -= dt;
    if (!indoors && !night && this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 4;
      this.bird();
    }
    this.cricketT -= dt;
    if (!indoors && w.hour > 19.7 && this.cricketT <= 0) {
      this.cricketT = 0.4 + Math.random() * 0.6;
      for (let i = 0; i < 3; i++) this.synth({ type: 'sine', f: 4200 + Math.random() * 300, dur: 0.04, vol: 0.02, delay: i * 0.06, bus: this.amb });
    }

    // a running generator putters where it stands
    const gen = w.machines.get('generator');
    if (this.genLoop) {
      let g = 0;
      if (gen && w.flag('millPower')) {
        const d = this.listener.pos.distanceTo(new THREE.Vector3(gen.pos.x, gen.pos.y, gen.pos.z));
        g = (0.09 + Math.sin(t * 38) * 0.03) / (1 + d * 0.15);
      }
      this.genLoop.g.gain.setTargetAtTime(g, t, 0.1);
    }

    // wolves out there somewhere call to each other after dark
    this.howlT -= dt;
    if (this.howlT <= 0) {
      this.howlT = 9 + Math.random() * 14;
      const awake = w.wolves.filter((wf) => wf.state !== 'dead' && w.wolfAwake(wf.id));
      if (awake.length && w.hour > 19) {
        const wf = awake[Math.floor(Math.random() * awake.length)];
        this.play('howl', wf.pos, 1);
      }
    }

    // music
    const anyWolf = w.wolves.some((wf) => wf.state === 'stalk' || wf.state === 'telegraph' || wf.state === 'lunge');
    this.mood = anyWolf ? 'tension' : w.player.mode === 'drive' ? 'work' : 'calm';
    this.stepMusic(dt);
  }

  private bird(): void {
    const f0 = 2400 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = { x: this.listener.pos.x + (Math.random() - 0.5) * 30, y: this.listener.pos.y + 6, z: this.listener.pos.z + (Math.random() - 0.5) * 30 };
    for (let i = 0; i < n; i++) this.synth({ type: 'sine', f: f0 * (1 + Math.random() * 0.2), f2: f0 * (0.8 + Math.random() * 0.6), dur: 0.09, vol: 0.05, pos: pan, delay: i * 0.13, bus: this.amb });
  }

  // A sparse, generative folk-guitar bed: plucked arpeggios over I–V–vi–IV.
  private stepMusic(dt: number): void {
    this.musicT -= dt;
    if (this.musicT > 0) return;
    const bpm = this.mood === 'tension' ? 116 : this.mood === 'work' ? 96 : 78;
    this.musicT = 60 / bpm / 2;
    const chords = this.mood === 'tension' ? [[57, 60, 64], [55, 58, 62], [53, 57, 60], [52, 55, 59]] : [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]];
    const bar = Math.floor(this.musicStep / 8) % 4;
    const beat = this.musicStep % 8;
    this.musicStep++;
    // phrase breathing: every fourth bar is mostly rest
    const rest = (Math.floor(this.musicStep / 32) % 3 === 2 && beat > 1) || Math.random() < 0.18;
    if (rest) return;
    const chord = chords[bar];
    if (beat === 0) this.pad(chord.map((n) => n - 12), (60 / bpm) * 4 * 1.05, this.mood === 'tension' ? 0.035 : 0.028);
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    const note = chord[pattern[beat]] + (beat === 0 ? -12 : 0);
    this.pluck(440 * Math.pow(2, (note - 69) / 12), beat === 0 ? 0.16 : 0.09);
  }

  /**
   * A plucked-string note built only from oscillators and envelopes — no
   * feedback anywhere, so it can never run away. A triangle body, a quickly
   * fading octave sine for the pick "ping", a filter that closes as the note
   * dies, and a tiny noise tick for the attack.
   */
  private pluck(freq: number, vol: number): void {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    const dur = 1.7;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3; // (dB) no resonant peak
    lp.frequency.setValueAtTime(Math.min(4200, freq * 8), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.6), t0 + dur * 0.8);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(freq * 1.004, t0);
    body.frequency.exponentialRampToValueAtTime(freq, t0 + 0.05);
    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.value = freq * 2;
    const pingG = ctx.createGain();
    pingG.gain.setValueAtTime(0.35, t0);
    pingG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    body.connect(lp);
    ping.connect(pingG).connect(lp);
    lp.connect(out).connect(this.music);
    body.start(t0);
    ping.start(t0);
    body.stop(t0 + dur + 0.05);
    ping.stop(t0 + dur + 0.05);
    body.onended = () => out.disconnect();
    this.synth({ type: 'noise', f: 2500, dur: 0.03, vol: vol * 0.35, filter: { type: 'bandpass', f: freq * 4, q: 1 }, bus: this.music });
  }

  /** A soft sustained chord under the plucks: detuned sine pairs, slow swell. */
  private pad(notes: number[], dur: number, vol: number): void {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(1.4, dur * 0.4));
    out.gain.setValueAtTime(vol, t0 + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3;
    lp.frequency.value = 1100;
    lp.connect(out).connect(this.music);
    const oscs: OscillatorNode[] = [];
    for (const n of notes) {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      for (const cents of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * Math.pow(2, cents / 1200);
        o.connect(lp);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
        oscs.push(o);
      }
    }
    oscs[0].onended = () => out.disconnect();
  }

  /** Master level for the dev bridge / tests: RMS, peak and whether anything went NaN. */
  meter(): { rms: number; peak: number; nan: boolean; state: string } {
    const a = this.analyser;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    let peak = 0;
    let nan = false;
    for (const v of buf) {
      if (!Number.isFinite(v)) {
        nan = true;
        continue;
      }
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / buf.length), peak, nan, state: this.ctx.state };
  }
}
