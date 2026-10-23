/* Gambit - original flat SVG piece set and UI icons (no external assets needed). */
(function (root) {
  'use strict';

  const SHAPES = {
    p: (f, s, d) => `
      <circle cx="22.5" cy="11.5" r="5" fill="${f}" stroke="${s}"/>
      <rect x="17" y="16.5" width="11" height="3.2" rx="1.6" fill="${f}" stroke="${s}"/>
      <path d="M15.5 33.5 C15.5 27 19 23.5 20 19.7 H25 C26 23.5 29.5 27 29.5 33.5 Z" fill="${f}" stroke="${s}"/>
      <rect x="11" y="33" width="23" height="5.5" rx="2.2" fill="${f}" stroke="${s}"/>`,
    r: (f, s, d) => `
      <path d="M11 8.5 H16 V12 H19.5 V8.5 H25.5 V12 H29 V8.5 H34 V16 H11 Z" fill="${f}" stroke="${s}"/>
      <path d="M14 16 H31 L30 31 H15 Z" fill="${f}" stroke="${s}"/>
      <path d="M15.2 20 H29.8 M15.6 27 H29.4" stroke="${d}" fill="none"/>
      <rect x="9" y="31" width="27" height="7.5" rx="2.2" fill="${f}" stroke="${s}"/>`,
    n: (f, s, d) => `
      <path d="M15 34 C15 28 18 25 20.5 21.5 C17.8 22.4 15.3 23.2 12.7 24.8 C11 25.8 9.4 24.6 9.8 22.8 C10.6 19.4 13 16.4 15.4 14 C16.9 12.4 17.4 10.4 18.4 8.2 L20.1 10.6 L21.6 7.4 L23.2 10.1 C29.4 10.8 33.4 15.4 33.4 22.4 C33.4 27.4 31.8 30.6 31.2 34 Z" fill="${f}" stroke="${s}"/>
      <circle cx="17.4" cy="15.4" r="1.2" fill="${d}" stroke="none"/>
      <path d="M24.2 11.6 C28.6 13.6 30.6 17.4 30.4 22.6" stroke="${d}" fill="none"/>
      <rect x="10" y="33.5" width="25" height="5" rx="2.2" fill="${f}" stroke="${s}"/>`,
    b: (f, s, d) => `
      <circle cx="22.5" cy="7" r="2.6" fill="${f}" stroke="${s}"/>
      <path d="M22.5 9.6 C16.2 14 14.6 19 15.6 23 C16.6 26 19.2 27.2 22.5 27.2 C25.8 27.2 28.4 26 29.4 23 C30.4 19 28.8 14 22.5 9.6 Z" fill="${f}" stroke="${s}"/>
      <path d="M25 14.2 L20.6 19.4" stroke="${d}" fill="none"/>
      <rect x="15" y="27" width="15" height="3.2" rx="1.6" fill="${f}" stroke="${s}"/>
      <path d="M17.2 30.2 L16.2 33.6 H28.8 L27.8 30.2 Z" fill="${f}" stroke="${s}"/>
      <rect x="10" y="33.5" width="25" height="5" rx="2.2" fill="${f}" stroke="${s}"/>`,
    q: (f, s, d) => `
      <path d="M9 15 L12.6 29 H32.4 L36 15 L30 22.4 L29.6 12.4 L25 21 L22.5 10.8 L20 21 L15.4 12.4 L15 22.4 Z" fill="${f}" stroke="${s}"/>
      <circle cx="9" cy="13.4" r="2.2" fill="${f}" stroke="${s}"/>
      <circle cx="15.4" cy="10.4" r="2.2" fill="${f}" stroke="${s}"/>
      <circle cx="22.5" cy="8.6" r="2.2" fill="${f}" stroke="${s}"/>
      <circle cx="29.6" cy="10.4" r="2.2" fill="${f}" stroke="${s}"/>
      <circle cx="36" cy="13.4" r="2.2" fill="${f}" stroke="${s}"/>
      <rect x="12" y="29" width="21" height="3.6" rx="1.6" fill="${f}" stroke="${s}"/>
      <rect x="10" y="33" width="25" height="5.5" rx="2.2" fill="${f}" stroke="${s}"/>`,
    k: (f, s, d) => `
      <path d="M21 3 H24 V6 H27 V9 H24 V13 H21 V9 H18 V6 H21 Z" fill="${f}" stroke="${s}"/>
      <path d="M12.2 29 C8.6 22.4 11.6 16 17 16 C19.6 16 21.6 17.6 22.5 19.8 C23.4 17.6 25.4 16 28 16 C33.4 16 36.4 22.4 32.8 29 Z" fill="${f}" stroke="${s}"/>
      <path d="M22.5 19.8 V28.6 M14 24.6 C19 23.4 26 23.4 31 24.6" stroke="${d}" fill="none"/>
      <rect x="12" y="29" width="21" height="3.6" rx="1.6" fill="${f}" stroke="${s}"/>
      <rect x="10" y="33" width="25" height="5.5" rx="2.2" fill="${f}" stroke="${s}"/>`
  };

  const COLORS = {
    w: { f: '#fbfbfa', s: '#1d2026', d: '#1d2026' },
    b: { f: '#2b2f37', s: '#0b0c0f', d: '#c9ced8' }
  };

  const cache = {};
  function pieceSVG(p) {
    if (cache[p]) return cache[p];
    const color = p === p.toUpperCase() ? 'w' : 'b';
    const c = COLORS[color];
    const svg = `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${SHAPES[p.toLowerCase()](c.f, c.s, c.d)}</g></svg>`;
    cache[p] = svg;
    return svg;
  }

  // Stroke icons (24x24)
  const ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    flip: '<path d="M7 4v16"/><path d="m3 8 4-4 4 4"/><path d="M17 20V4"/><path d="m21 16-4 4-4-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
    draw: '<path d="M5 12h14"/><path d="M5 7h14"/><path d="M5 17h14"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    first: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    last: '<path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
  };

  function icon(name, size) {
    const s = size || 18;
    return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
  }

  root.GambitArt = { pieceSVG, icon };
})(typeof globalThis !== 'undefined' ? globalThis : this);
