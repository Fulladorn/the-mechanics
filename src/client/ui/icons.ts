// Line icons for the toolbelt and job sheet. Inline SVG so they inherit
// stroke colour from CSS and never need an asset download.

const svg = (body: string) =>
  `<svg viewBox="0 0 32 32" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  wrench: svg('<path d="M20.5 4.5a6 6 0 0 0-5.8 7.6L5 21.8a2.8 2.8 0 0 0 4 4l9.7-9.7a6 6 0 0 0 7.6-5.8l-3.8 3.8-3.4-.6-.6-3.4 3.8-3.8a6 6 0 0 0-1.8-.8z"/>'),
  flashlight: svg('<path d="M10 3h12l-2 8H12z"/><path d="M12 11h8v16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M16 16v3"/>'),
  flare: svg('<path d="M11 28l10-18"/><path d="M19 7c1-2 3-3 4-2s0 3-1 4"/><path d="M22 3l1 2M26 6l-2 1M25 2l-1 2"/>'),
  medkit: svg('<rect x="4" y="9" width="24" height="18" rx="3"/><path d="M12 9V6h8v3M16 13v10M11 18h10"/>'),
  key: svg('<circle cx="10" cy="16" r="5"/><path d="M15 16h13M24 16v4M20 16v3"/>'),
  wheel: svg('<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="5"/><path d="M16 4v7M16 21v7M4 16h7M21 16h7"/>'),
  tire: svg('<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="6"/>'),
  battery: svg('<rect x="4" y="9" width="24" height="17" rx="2"/><path d="M8 9V6h4v3M20 9V6h4v3M9 17h4M21 15v4M19 17h4"/>'),
  jack: svg('<path d="M4 25h24M7 25l3-6h12l3 6M12 19l6-10M18 9h6"/><circle cx="8" cy="27" r="1.5"/><circle cx="24" cy="27" r="1.5"/>'),
  chock: svg('<path d="M4 25h24L10 11H6a2 2 0 0 0-2 2z"/>'),
  jerrycan: svg('<path d="M8 8h12l4 4v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"/><path d="M11 8V5h5v3M10 14l10 10M20 14L10 24"/>'),
  coolant: svg('<path d="M12 5h8v4l3 4v13a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V13l3-4z"/><path d="M13 19c0 2 1.3 3 3 3s3-1 3-3-3-5-3-5-3 3-3 5z"/>'),
  fuelHose: svg('<path d="M4 20c4 0 4-8 8-8s4 8 8 8 4-8 8-8"/>'),
  radiatorHose: svg('<path d="M5 22c0-6 6-12 12-12h5"/><path d="M3 22h5M20 7v6"/>'),
  fuse: svg('<rect x="9" y="4" width="14" height="24" rx="3"/><path d="M13 4v24M19 4v24"/>'),
  winch: svg('<rect x="5" y="11" width="16" height="10" rx="3"/><path d="M21 16h4a2 2 0 0 1 2 2v2l-3 3"/><path d="M9 11v10M13 11v10M17 11v10"/>'),
  lightbar: svg('<rect x="3" y="12" width="26" height="8" rx="3"/><circle cx="9" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="23" cy="16" r="1.5"/>'),
  crate: svg('<rect x="5" y="7" width="22" height="19" rx="2"/><path d="M5 13h22M11 7v19M21 7v19"/>'),
  fuel: svg('<path d="M7 28V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v22M5 28h16"/><path d="M19 12h3a2 2 0 0 1 2 2v8a2 2 0 0 0 4 0V11l-4-4"/><rect x="10" y="8" width="6" height="5"/>'),
  coolantSys: svg('<rect x="5" y="6" width="22" height="16" rx="2"/><path d="M9 6v16M13 6v16M17 6v16M21 6v16M16 22v6"/>'),
  ignition: svg('<circle cx="16" cy="16" r="11"/><path d="M16 8v8l5 3"/>'),
  stabilize: svg('<path d="M4 25h24"/><path d="M6 25l6-8h4l-4 8"/><circle cx="22" cy="18" r="6"/>'),
  engine: svg('<rect x="6" y="10" width="18" height="12" rx="2"/><path d="M11 10V6h8v4M24 14h3v4h-3M6 14H3v4h3"/>'),
  lore: svg('<path d="M8 4h13l5 5v19H8z"/><path d="M21 4v5h5M12 15h10M12 19h10M12 23h6"/>'),
};

export const icon = (k: string): string => ICONS[k] ?? ICONS.crate;
