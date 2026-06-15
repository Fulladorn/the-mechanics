import type { Settings } from './settings';

// "Dispatch" narration via the browser SpeechSynthesis API (no audio files),
// with on-screen subtitles. Both are independently gated by settings; if TTS is
// unavailable the subtitles still show.
export class Dispatch {
  private synth: SpeechSynthesis | null =
    typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  private subEl = document.getElementById('subtitles');
  private hideTimer = 0;

  constructor(private settings: Settings) {}

  applySettings(s: Settings): void {
    this.settings = s;
  }

  say(line: string): void {
    if (!line) return;
    if (this.settings.accessibility.subtitles && this.subEl) {
      this.subEl.textContent = `DISPATCH:  ${line}`;
      this.subEl.classList.add('show');
      clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(
        () => this.subEl?.classList.remove('show'),
        Math.max(2600, line.length * 60),
      );
    }
    if (this.synth && this.settings.audio.voice > 0 && this.settings.audio.master > 0) {
      try {
        this.synth.cancel();
        const u = new SpeechSynthesisUtterance(line);
        u.rate = 1.02;
        u.pitch = 0.85;
        u.volume = Math.min(1, this.settings.audio.master * this.settings.audio.voice);
        this.synth.speak(u);
      } catch {
        /* TTS unavailable — subtitles already shown */
      }
    }
  }

  stop(): void {
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
    this.subEl?.classList.remove('show');
  }
}
