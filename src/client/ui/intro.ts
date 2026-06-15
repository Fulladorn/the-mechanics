// Lightweight cinematic letterbox for the mission intro/outro. The 3D scene
// renders behind it; after a beat it fades and hands control to the player.
export class Intro {
  private root = document.createElement('div');
  private titleEl = document.createElement('div');
  private subEl = document.createElement('div');

  constructor() {
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:34;pointer-events:none;opacity:0;transition:opacity .5s;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;';
    const grad = document.createElement('div');
    grad.style.cssText =
      'position:absolute;inset:0;background:linear-gradient(to bottom,' +
      'rgba(0,0,0,.88),rgba(0,0,0,.12) 28%,rgba(0,0,0,.12) 72%,rgba(0,0,0,.88));';
    this.titleEl.style.cssText =
      'position:relative;font-size:46px;font-weight:800;letter-spacing:3px;color:#ffcf3f;' +
      'text-shadow:0 2px 14px rgba(0,0,0,.85);';
    this.subEl.style.cssText =
      'position:relative;font-size:15px;letter-spacing:3px;text-transform:uppercase;opacity:.85;color:#eaf2ff;';
    this.root.append(grad, this.titleEl, this.subEl);
    document.body.appendChild(this.root);
  }

  play(title: string, sub: string, onDone: () => void, ms = 2800): void {
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    this.root.style.opacity = '1';
    window.setTimeout(() => {
      this.root.style.opacity = '0';
      window.setTimeout(onDone, 500);
    }, ms);
  }
}
