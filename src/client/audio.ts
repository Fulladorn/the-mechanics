// Minimal procedural blips via Web Audio — no sound files needed.
export class Sfx {
  private ctx?: AudioContext;

  resume(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private blip(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  play(name: string): void {
    switch (name) {
      case 'pickup':
        this.blip(660, 0.08, 'square', 0.14);
        break;
      case 'install':
        this.blip(300, 0.14, 'sawtooth', 0.16);
        setTimeout(() => this.blip(460, 0.12, 'sawtooth', 0.14), 80);
        break;
      case 'success':
        this.blip(523, 0.1, 'triangle');
        setTimeout(() => this.blip(784, 0.18, 'triangle'), 90);
        break;
      case 'gate':
        this.blip(880, 0.12, 'triangle', 0.2);
        break;
      case 'enter':
        this.blip(200, 0.12, 'square', 0.16);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 130),
        );
        break;
    }
  }
}
