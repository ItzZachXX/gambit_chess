/* Gambit Chess - application: UI, game flow, computer opponent, online play */
(function () {
  'use strict';

  const { pieceSVG, icon } = window.GambitArt;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const opp = (c) => (c === 'w' ? 'b' : 'w');
  const colorOf = Chess.colorOf;
  const sqName = Chess.sqName;
  const VAL = Chess.VALUES;
  const NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
  const COLOR_NAME = { w: 'White', b: 'Black' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Storage (safe) ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gambit.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gambit.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('gambit.' + k); } catch (e) { /* ignore */ } }
  };

  const DEFAULTS = { ui: 'dark', board: 'slate', legal: true, coords: true, sound: true, anim: true, autoflip: false, evalbar: false, name: '' };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  const TIME_CONTROLS = [
    { id: 'none', label: 'No clock', base: 0, inc: 0 },
    { id: '1+0', label: '1 min', base: 60, inc: 0 },
    { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
    { id: '5+0', label: '5 min', base: 300, inc: 0 },
    { id: '10+0', label: '10 min', base: 600, inc: 0 },
    { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
    { id: '30+0', label: '30 min', base: 1800, inc: 0 }
  ];
  const LEVELS = [
    { id: 'beginner', label: 'Beginner', sub: 'Learning the moves', depth: 1, timeMs: 250, noise: 150 },
    { id: 'casual', label: 'Casual', sub: 'Friendly club game', depth: 3, timeMs: 600, noise: 22 },
    { id: 'strong', label: 'Strong', sub: 'Punishes mistakes', depth: 5, timeMs: 1200, noise: 0 },
    { id: 'master', label: 'Master', sub: 'Full strength', depth: 64, timeMs: 2600, noise: 0 }
  ];
  const BOARDS = [
    { id: 'slate', l: '#e3e7ed', d: '#8796ab' },
    { id: 'classic', l: '#ecedd1', d: '#789654' },
    { id: 'walnut', l: '#efd9b5', d: '#b2825a' },
    { id: 'ocean', l: '#dbe9f4', d: '#4b7aa6' },
    { id: 'graphite', l: '#b9bec7', d: '#5d6470' },
    { id: 'rose', l: '#f3e2e2', d: '#b77b86' }
  ];

  function applyTheme() {
    document.documentElement.dataset.theme = settings.ui;
    document.documentElement.dataset.board = settings.board;
    const btn = $('#navTheme');
    if (btn) btn.innerHTML = icon(settings.ui === 'dark' ? 'sun' : 'moon');
    const meta = $('meta[name=theme-color]');
    if (meta) meta.content = settings.ui === 'dark' ? '#0e1014' : '#f4f5f7';
  }

  function fillIcons(root) {
    $$('[data-icon]', root).forEach((el) => {
      if (el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
      el.dataset.iconDone = '1';
    });
  }

  /* ---------------- Sound (synthesised, no files) ---------------- */
  const Sound = {
    ctx: null,
    tone(freq, start, dur, type, gain) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, c.currentTime + start);
      g.gain.exponentialRampToValueAtTime(gain || 0.14, c.currentTime + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      o.connect(g); g.connect(c.destination);
      o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02);
    },
    play(kind) {
      if (!settings.sound) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (kind === 'move') { this.tone(420, 0, 0.07, 'triangle', 0.18); this.tone(210, 0, 0.05, 'sine', 0.1); }
        else if (kind === 'capture') { this.tone(300, 0, 0.09, 'square', 0.07); this.tone(150, 0.01, 0.12, 'triangle', 0.2); }
        else if (kind === 'check') { this.tone(880, 0, 0.12, 'sine', 0.13); this.tone(1320, 0.07, 0.14, 'sine', 0.1); }
        else if (kind === 'castle') { this.tone(420, 0, 0.06, 'triangle', 0.16); this.tone(420, 0.09, 0.06, 'triangle', 0.16); }
        else if (kind === 'end') { [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'sine', 0.12)); }
        else if (kind === 'notify') { this.tone(660, 0, 0.1, 'sine', 0.1); this.tone(990, 0.08, 0.12, 'sine', 0.08); }
      } catch (e) { /* audio not available */ }
    }
  };

  /* ---------------- Toasts ---------------- */
  function toast(msg, ms) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }

  /* ---------------- Engine host (Web Worker with fallback) ---------------- */
  const EngineHost = {
    lanes: {},
    seq: 0,
    pending: {},
    failed: false,
    worker(lane) {
      if (this.failed) return null;
      if (this.lanes[lane]) return this.lanes[lane];
      try {
        const src = `(${window.GambitChessFactory.toString()})(self);\n(${window.GambitEngineFactory.toString()})(self);\n` +
          'self.onmessage=function(e){var r=self.GambitEngine.run(e.data);r.id=e.data.id;self.postMessage(r);};';
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const w = new Worker(url);
        w.onmessage = (e) => {
          const p = this.pending[e.data.id];
          if (p) { delete this.pending[e.data.id]; p.resolve(e.data); }
        };
        w.onerror = (e) => {
          e.preventDefault && e.preventDefault();
          this.failed = true;
          Object.keys(this.pending).forEach((id) => {
            const p = this.pending[id];
            if (p.lane === lane) { delete this.pending[id]; p.resolve(window.GambitEngine.run(p.params)); }
          });
        };
        this.lanes[lane] = w;
        return w;
      } catch (e) {
        this.failed = true;
        return null;
      }
    },
    think(params, lane) {
      lane = lane || 'main';
      return new Promise((resolve) => {
        const w = this.worker(lane);
        if (!w) { setTimeout(() => resolve(window.GambitEngine.run(params)), 30); return; }
        const id = ++this.seq;
        this.pending[id] = { resolve, params, lane };
        w.postMessage(Object.assign({}, params, { id }));
      });
    }
  };

  /* ---------------- Game state ---------------- */
  let G = null; // current game
  const boardEl = $('#board');

  function uciOf(m) { return sqName(m.from) + sqName(m.to) + (m.promo || ''); }

  function playerLabel(c) {
    if (!G) return COLOR_NAME[c];
    return G.cfg.players[c].name || COLOR_NAME[c];
  }

  function newGame(cfg, resume) {
    cfg = JSON.parse(JSON.stringify(cfg));
    cfg.startFen = cfg.startFen || Chess.START_FEN;
    const base = (cfg.tc && cfg.tc.base) || 0;
    G = {
      cfg,
      mode: cfg.mode,
      myColor: cfg.myColor || 'w',
      chess: new Chess(cfg.startFen),
      records: [],
      uci: [],
      timed: base > 0,
      clocks: { w: base * 1000, b: base * 1000 },
      lastTick: performance.now(),
      over: null,
      viewPly: null,
      selected: -1,
      legalMoves: [],
      legalTargets: new Set(),
      hint: null,
      hintBusy: false,
      hintsUsed: { w: 0, b: 0 },
      orientation: cfg.mode === 'local' ? 'w' : (cfg.myColor || 'w'),
      thinking: false,
      token: 0,
      evalScore: null,
      offer: null,
      oppZeroSince: 0
    };
    if (resume) {
      for (const u of resume.uci || []) {
        const r = G.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promo: u[4] });
        if (!r) break;
        G.records.push(r); G.uci.push(u);
      }
      if (resume.clocks) G.clocks = resume.clocks;
      if (resume.hintsUsed) G.hintsUsed = resume.hintsUsed;
      if (G.mode === 'local' && settings.autoflip) G.orientation = G.chess.turn;
    }
    $('#chatTab').classList.toggle('hidden', G.mode !== 'online');
    if (G.mode !== 'online') switchTab('moves');
    $('#chatLog').innerHTML = '';
    $('#offerBox').classList.add('hidden');
    showView('game');
    buildBoard();
    renderAll();
    const st = G.chess.status();
    if (st.over) endGame(st);
    else { maybeAI(); updateEval(); }
    saveResume();
  }

  function saveResume() {
    if (!G || G.mode === 'online') return;
    if (G.over || !G.uci.length) { store.del('resume'); return; }
    store.set('resume', { cfg: G.cfg, uci: G.uci, clocks: G.clocks, hintsUsed: G.hintsUsed, at: Date.now() });
  }

  function canMoveColor(c) {
    if (!G) return false;
    if (G.mode === 'local') return true;
    return c === G.myColor;
  }

  function canInteract() {
    if (!G || G.over || G.viewPly != null || G.thinking) return false;
    if (G.mode === 'online' && !Net.connected) return false;
    return canMoveColor(G.chess.turn);
  }

  /* ---------------- Board building & rendering ---------------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    G.sqEls = new Array(64);
    G.pieceAt = new Array(64).fill(null);
    for (let d = 0; d < 64; d++) {
      const sq = G.orientation === 'w' ? d : 63 - d;
      const r = sq >> 3, f = sq & 7;
      const el = document.createElement('div');
      el.className = 'sq ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
      el.dataset.sq = sq;
      const dr = d >> 3, df = d & 7;
      if (df === 0) el.insertAdjacentHTML('beforeend', `<span class="coord rank">${8 - r}</span>`);
      if (dr === 7) el.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[f]}</span>`);
      boardEl.appendChild(el);
      G.sqEls[sq] = el;
    }
    boardEl.classList.toggle('no-coords', !settings.coords);
    $$('.coord', boardEl).forEach((c) => c.classList.toggle('hidden', !settings.coords));
    $('.board-area').classList.toggle('flipped', G.orientation === 'b');
  }

  function displayed() {
    if (G.viewPly == null) {
      const last = G.records[G.records.length - 1];
      return { chess: G.chess, last, live: true };
    }
    const c = new Chess(G.cfg.startFen);
    for (let i = 0; i < G.viewPly; i++) {
      const u = G.uci[i];
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promo: u[4] });
    }
    return { chess: c, last: G.records[G.viewPly - 1], live: false };
  }

  function renderBoard(animMove) {
    const view = displayed();
    const pos = view.chess.board;
    const checkSq = view.chess.inCheck() ? view.chess.kings[view.chess.turn] : -1;
    const showLegal = view.live && G.selected >= 0;
    for (let sq = 0; sq < 64; sq++) {
      const el = G.sqEls[sq];
      const p = pos[sq];
      if (G.pieceAt[sq] !== p) {
        const old = el.querySelector('.piece');
        if (old) old.remove();
        if (p) {
          const pe = document.createElement('div');
          pe.className = 'piece';
          pe.innerHTML = pieceSVG(p);
          el.appendChild(pe);
        }
        G.pieceAt[sq] = p;
      }
      el.classList.toggle('last', !!(view.last && (view.last.from === sq || view.last.to === sq)));
      el.classList.toggle('sel', view.live && G.selected === sq);
      el.classList.toggle('check', sq === checkSq);
      el.classList.toggle('hint-sq', !!(view.live && G.hint && G.hint.move && (G.hint.move.from === sq || G.hint.move.to === sq)));
      const isTarget = showLegal && G.legalTargets.has(sq);
      el.classList.toggle('legal', isTarget);
      const mark = el.querySelector('.mark');
      if (mark) mark.remove();
      if (isTarget && settings.legal) {
        const occupied = !!p || G.legalMoves.some((m) => m.to === sq && m.flag === 'e');
        el.insertAdjacentHTML('beforeend', `<span class="mark ${occupied ? 'ring' : 'dot'}"></span>`);
      }
    }
    if (animMove && settings.anim) animate(animMove);
    renderArrows();
  }

  function sqCenter(sq) {
    const d = G.orientation === 'w' ? sq : 63 - sq;
    return { x: (d & 7) + 0.5, y: (d >> 3) + 0.5 };
  }

  function animate(m) {
    const slide = (from, to) => {
      const pe = G.sqEls[to].querySelector('.piece');
      if (!pe) return;
      const a = sqCenter(from), b = sqCenter(to);
      const size = G.sqEls[to].getBoundingClientRect().width;
      pe.classList.remove('anim');
      pe.style.transform = `translate(${(a.x - b.x) * size}px, ${(a.y - b.y) * size}px)`;
      void pe.offsetWidth;
      pe.classList.add('anim');
      pe.style.transform = '';
      setTimeout(() => pe.classList.remove('anim'), 220);
    };
    slide(m.from, m.to);
    if (m.flag === 'k') slide(m.to + 1, m.to - 1);
    if (m.flag === 'q') slide(m.to - 2, m.to + 1);
  }

  function renderArrows() {
    const layer = $('#arrowLayer');
    layer.innerHTML = '';
    if (!G.hint || !G.hint.move || G.viewPly != null) return;
    const a = sqCenter(G.hint.move.from), b = sqCenter(G.hint.move.to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const ex = b.x - (dx / len) * 0.32, ey = b.y - (dy / len) * 0.32;
    layer.innerHTML = `<line x1="${a.x}" y1="${a.y}" x2="${ex}" y2="${ey}" marker-end="url(#ah)"/>`;
  }

  /* ---------------- Points / material ---------------- */
  function captures(uptoPly) {
    const n = uptoPly == null ? G.records.length : uptoPly;
    const caps = { w: [], b: [] };
    for (let i = 0; i < n; i++) {
      const r = G.records[i];
      if (r.captured) caps[r.color].push(r.captured.toLowerCase());
    }
    return caps;
  }

  function material(board) {
    const m = { w: 0, b: 0 };
    for (const p of board) if (p) m[colorOf(p)] += VAL[p.toLowerCase()];
    return m;
  }

  const CAP_ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };
  function capsHTML(list, capturedColor) {
    return list.slice().sort((a, b) => CAP_ORDER[a] - CAP_ORDER[b])
      .map((t) => `<span class="cp">${pieceSVG(capturedColor === 'w' ? t.toUpperCase() : t)}</span>`).join('');
  }

  /* ---------------- Player cards, status, panels ---------------- */
  function fmtClock(ms) {
    ms = Math.max(0, ms);
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
  }

  function renderCards() {
    const view = displayed();
    const caps = captures(G.viewPly);
    const mat = material(view.chess.board);
    const top = opp(G.orientation), bottom = G.orientation;
    G.clockEls = {};
    [['#cardTop', top], ['#cardBottom', bottom]].forEach(([sel, c]) => {
      const el = $(sel);
      const pts = caps[c].reduce((s, t) => s + VAL[t], 0);
      const adv = mat[c] - mat[opp(c)];
      let tag = '';
      if (G.mode === 'ai') tag = c === G.myColor ? '<span class="tag">You</span>' : '<span class="tag">CPU</span>';
      if (G.mode === 'online') {
        tag = c === G.myColor ? '<span class="tag">You</span>' : `<span class="live ${Net.connected ? '' : 'off'}" title="${Net.connected ? 'Connected' : 'Disconnected'}"></span>`;
      }
      const toMove = !G.over && view.chess.turn === c;
      el.classList.toggle('to-move', toMove);
      el.innerHTML = `
        <div class="avatar ${c}">${pieceSVG(c === 'w' ? 'K' : 'k')}</div>
        <div class="pinfo">
          <div class="pname"><span>${esc(playerLabel(c))}</span>${tag}</div>
          <div class="pcaps"><span class="caps">${capsHTML(caps[c], opp(c))}</span>
            <span class="pts">${pts} pts</span>${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>
        </div>
        ${G.timed ? `<div class="clock" data-c="${c}">${fmtClock(G.clocks[c])}</div>` : ''}`;
      if (G.timed) G.clockEls[c] = el.querySelector('.clock');
    });
    updateClocks();
  }

  function updateClocks() {
    if (!G || !G.timed || !G.clockEls) return;
    ['w', 'b'].forEach((c) => {
      const el = G.clockEls[c];
      if (!el) return;
      el.textContent = fmtClock(G.clocks[c]);
      const active = !G.over && G.chess.turn === c && G.records.length > 0;
      el.classList.toggle('active', active && G.clocks[c] >= 20000);
      el.classList.toggle('low', active && G.clocks[c] < 20000);
    });
  }

  function renderStatus() {
    const st = $('#status');
    const turn = G.chess.turn;
    let main, sub = '', alert = false;
    if (G.over) {
      main = resultTitle(G.over);
      sub = resultReason(G.over);
    } else if (G.mode === 'online' && !Net.connected) {
      main = 'Waiting for opponent';
      sub = 'The connection dropped. They can rejoin with the same link.';
      alert = true;
    } else {
      const inCheck = G.chess.inCheck();
      if (G.mode === 'local') main = `${playerLabel(turn)} to move`;
      else main = turn === G.myColor ? 'Your move' : (G.mode === 'ai' ? 'Computer is thinking' : `${playerLabel(turn)} is thinking`);
      if (inCheck) { main = 'Check! ' + main; alert = true; }
      const tc = G.cfg.tc && G.cfg.tc.base ? `${G.cfg.tc.base / 60} min${G.cfg.tc.inc ? ' + ' + G.cfg.tc.inc + 's' : ''}` : 'Untimed';
      sub = `Move ${G.chess.fullmove} · ${tc}`;
      if (G.chess.halfmove >= 80) sub += ` · ${Math.ceil((100 - G.chess.halfmove) / 2)} moves to 50-move draw`;
    }
    st.classList.toggle('alert', alert);
    st.innerHTML = `<span class="turn-dot ${G.over ? (G.over.winner || 'w') : turn}"></span><div><span class="stxt">${esc(main)}</span><small>${esc(sub)}</small></div>`;
  }

  function renderMoves() {
    const list = $('#moveList');
    if (!G.records.length) { list.innerHTML = '<div class="empty">No moves yet. White moves first.</div>'; return; }
    const cur = G.viewPly == null ? G.records.length : G.viewPly;
    const startBlack = G.cfg.startFen.split(' ')[1] === 'b';
    const startNum = parseInt(G.cfg.startFen.split(' ')[5] || '1', 10);
    let html = '', idx = 0, num = startNum;
    if (startBlack) {
      html += `<span class="num">${num}.</span><span class="mv">...</span>`;
      html += mvBtn(0, cur); idx = 1; num++;
    }
    for (; idx < G.records.length; idx += 2) {
      html += `<span class="num">${num}.</span>` + mvBtn(idx, cur) + (idx + 1 < G.records.length ? mvBtn(idx + 1, cur) : '<span></span>');
      num++;
    }
    list.innerHTML = html;
    const active = list.querySelector('.cur');
    if (active) {
      const lr = list.getBoundingClientRect(), ar = active.getBoundingClientRect();
      if (ar.bottom > lr.bottom || ar.top < lr.top) list.scrollTop += ar.top - lr.top - lr.height / 2;
    } else list.scrollTop = list.scrollHeight;
  }
  function mvBtn(i, cur) {
    return `<button class="mv ${i + 1 === cur ? 'cur' : ''}" data-ply="${i + 1}">${esc(G.records[i].san)}</button>`;
  }

  function renderPoints() {
    const view = displayed();
    const caps = captures(G.viewPly);
    const mat = material(view.chess.board);
    const total = mat.w + mat.b || 1;
    const row = (c) => {
      const pts = caps[c].reduce((s, t) => s + VAL[t], 0);
      const adv = mat[c] - mat[opp(c)];
      return `<div class="pt-row"><div class="who"><span class="avatar ${c}" style="width:30px;height:30px">${pieceSVG(c === 'w' ? 'K' : 'k')}</span>
        <div>${esc(playerLabel(c))}<div class="sub">On board: ${mat[c]} · ${adv > 0 ? 'ahead by ' + adv : adv < 0 ? 'behind by ' + -adv : 'even'}</div></div></div>
        <div style="text-align:right"><div class="big">${pts}</div><div class="sub">points captured</div></div></div>`;
    };
    $('#pointsPanel').innerHTML = `
      ${row('w')}${row('b')}
      <div class="pt-bar" title="Share of material on the board"><div class="w" style="width:${(mat.w / total) * 100}%"></div><div class="b"></div></div>
      <div class="pt-legend">${['p', 'n', 'b', 'r', 'q', 'k'].map((t) => `<div><span class="pc">${pieceSVG(t.toUpperCase())}</span>${NAMES[t]}<b>${t === 'k' ? '-' : VAL[t]}</b></div>`).join('')}</div>
      <p class="pt-note">Each side starts with 39 points of material. Promoting a pawn swaps its 1 point for the new piece's value.</p>`;
  }

  function renderHint() {
    const body = $('#hintBody'), btn = $('#hintBtn'), count = $('#hintCount');
    const allowed = G.cfg.hints !== false;
    const usedFor = G.mode === 'local' ? G.chess.turn : G.myColor;
    count.textContent = allowed ? `Hints used: ${G.hintsUsed[usedFor]}` : 'Hints off';
    const myTurn = canMoveColor(G.chess.turn);
    btn.disabled = !allowed || !!G.over || G.viewPly != null || !myTurn || G.thinking || (G.mode === 'online' && !Net.connected);
    btn.lastElementChild.textContent = G.hint ? 'Hide hint' : 'Show best move';
    if (G.hintBusy) { body.innerHTML = '<span class="spinner"></span>Looking for the best move...'; return; }
    if (G.hint) {
      const h = G.hint;
      body.innerHTML = `<div class="best">${esc(h.san)}</div>
        <div class="reasons">${h.reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join('')}</div>
        <div class="evaltxt">${esc(h.evalText)}</div>`;
      return;
    }
    if (!allowed) body.textContent = 'Hints are turned off for this game. Tap a piece to see where it can move.';
    else if (G.over) body.textContent = 'Game over. Use the move list to review any position.';
    else if (!myTurn) body.textContent = 'Wait for your turn, then press the button for a suggestion.';
    else body.textContent = 'Tap a piece to see every square it can move to. Press the button for the strongest move.';
  }

  function renderToolbar() {
    const n = G.records.length;
    const online = G.mode === 'online';
    $('#undoBtn').disabled = !n || (online && (G.over || !Net.connected || !G.records.some((r) => r.color === G.myColor))) || (G.mode === 'ai' && !G.records.some((r) => r.color === G.myColor));
    $('#drawBtn').disabled = !!G.over || (online && !Net.connected);
    $('#resignBtn').disabled = !!G.over;
    $('#reviewBanner').classList.toggle('hidden', G.viewPly == null);
    if (G.viewPly != null) $('#reviewText').textContent = G.viewPly === 0 ? 'Viewing the starting position' : `Viewing after move ${G.records[G.viewPly - 1].san}`;
  }

  function renderAll(animMove) {
    if (!G) return;
    renderBoard(animMove);
    renderCards();
    renderStatus();
    renderMoves();
    renderPoints();
    renderHint();
    renderToolbar();
    renderEvalBar();
  }

  /* ---------------- Interaction ---------------- */
  function select(sq) {
    G.selected = sq;
    G.legalMoves = G.chess.moves({ square: sq });
    G.legalTargets = new Set(G.legalMoves.map((m) => m.to));
    renderBoard();
  }
  function deselect() {
    if (G.selected < 0) return;
    G.selected = -1; G.legalMoves = []; G.legalTargets = new Set();
    renderBoard();
  }

  let drag = null;
  function sqFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const s = el && el.closest && el.closest('.sq');
    return s && boardEl.contains(s) ? +s.dataset.sq : -1;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (!G) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sqEl = e.target.closest('.sq');
    if (!sqEl) return;
    const sq = +sqEl.dataset.sq;
    if (!canInteract()) {
      if (G.viewPly != null) toast('You are reviewing an earlier move. Press "Back to live" to play.');
      return;
    }
    e.preventDefault();
    if (G.selected >= 0 && G.legalTargets.has(sq)) { tryMove(G.selected, sq, false); return; }
    const p = G.chess.board[sq];
    if (p && colorOf(p) === G.chess.turn) {
      const was = G.selected === sq;
      select(sq);
      drag = { sq, x0: e.clientX, y0: e.clientY, started: false, was, ghost: null, over: -1 };
      return;
    }
    deselect();
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true;
      const size = G.sqEls[drag.sq].getBoundingClientRect().width;
      const g = document.createElement('div');
      g.className = 'ghost';
      g.style.width = g.style.height = size * 1.08 + 'px';
      g.innerHTML = pieceSVG(G.chess.board[drag.sq]);
      document.body.appendChild(g);
      drag.ghost = g;
      const pe = G.sqEls[drag.sq].querySelector('.piece');
      if (pe) pe.classList.add('lifted');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const over = sqFromPoint(e.clientX, e.clientY);
    if (over !== drag.over) {
      if (drag.over >= 0) G.sqEls[drag.over].classList.remove('drop-target');
      if (over >= 0 && G.legalTargets.has(over)) G.sqEls[over].classList.add('drop-target');
      drag.over = over;
    }
  }, { passive: true });

  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.over >= 0 && G.sqEls[d.over]) G.sqEls[d.over].classList.remove('drop-target');
    if (d.started) {
      d.ghost.remove();
      const pe = G.sqEls[d.sq].querySelector('.piece');
      if (pe) pe.classList.remove('lifted');
      const target = cancelled ? -1 : sqFromPoint(e.clientX, e.clientY);
      if (target >= 0 && target !== d.sq && G.legalTargets.has(target)) tryMove(d.sq, target, true);
    } else if (d.was) {
      deselect();
    }
  }
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));

  function tryMove(from, to, dragged) {
    const cands = G.legalMoves.filter((m) => m.from === from && m.to === to);
    if (!cands.length) return;
    if (cands.length > 1) {
      pickPromotion(to, G.chess.turn).then((pr) => {
        if (pr) applyMove({ from, to, promo: pr }, 'local', { dragged: true });
        else deselect();
      });
      return;
    }
    applyMove({ from, to }, 'local', { dragged });
  }

  function pickPromotion(to, color) {
    return new Promise((resolve) => {
      const box = $('#promo');
      const rect = G.sqEls[to].getBoundingClientRect();
      box.innerHTML = ['q', 'r', 'b', 'n'].map((t) => `<button data-p="${t}" aria-label="Promote to ${NAMES[t]}" title="${NAMES[t]} (${VAL[t]} pts)">${pieceSVG(color === 'w' ? t.toUpperCase() : t)}</button>`).join('');
      box.classList.remove('hidden');
      const bw = box.offsetWidth, bh = box.offsetHeight;
      let left = rect.left + rect.width / 2 - bw / 2;
      let top = rect.top < window.innerHeight / 2 ? rect.top : rect.bottom - bh;
      left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
      top = Math.max(8, Math.min(window.innerHeight - bh - 8, top));
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      const done = (v) => {
        box.classList.add('hidden');
        document.removeEventListener('pointerdown', outside, true);
        resolve(v);
      };
      const outside = (e) => { if (!box.contains(e.target)) { e.stopPropagation(); e.preventDefault(); done(null); } };
      box.onclick = (e) => { const b = e.target.closest('button'); if (b) done(b.dataset.p); };
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    });
  }

  /* ---------------- Applying moves ---------------- */
  function applyMove(mv, source, opts) {
    opts = opts || {};
    if (!G || G.over) return false;
    const mover = G.chess.turn;
    const firstMove = G.records.length === 0;
    const res = G.chess.move(mv);
    if (!res) return false;
    G.records.push(res);
    G.uci.push(uciOf(res));
    G.selected = -1; G.legalMoves = []; G.legalTargets = new Set();
    G.hint = null; G.hintBusy = false;
    G.viewPly = null;
    G.offer = null;
    $('#offerBox').classList.add('hidden');
    G.token++;

    if (G.timed) {
      if (!firstMove && G.cfg.tc.inc) G.clocks[mover] += G.cfg.tc.inc * 1000;
      if (source === 'remote' && typeof opts.clock === 'number') G.clocks[mover] = opts.clock;
      G.lastTick = performance.now();
    }

    if (source === 'local' && G.mode === 'online') {
      Net.send({ t: 'move', from: sqName(res.from), to: sqName(res.to), promo: res.promo || null, clock: G.timed ? G.clocks[mover] : null, ply: G.uci.length });
    }

    if (res.san.endsWith('#') || res.san.endsWith('+')) Sound.play('check');
    else if (res.captured) Sound.play('capture');
    else if (res.flag === 'k' || res.flag === 'q') Sound.play('castle');
    else Sound.play('move');

    let rebuilt = false;
    if (G.mode === 'local' && settings.autoflip && G.orientation !== G.chess.turn) {
      G.orientation = G.chess.turn;
      buildBoard();
      rebuilt = true;
    }
    renderAll(!opts.dragged && !rebuilt ? res : null);

    const st = G.chess.status();
    if (st.over) { endGame(st); return true; }
    saveResume();
    maybeAI();
    updateEval();
    return true;
  }

  function rebuildTo(ply) {
    const keep = G.uci.slice(0, ply);
    G.chess = new Chess(G.cfg.startFen);
    G.records = []; G.uci = [];
    for (const u of keep) {
      const r = G.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promo: u[4] });
      if (!r) break;
      G.records.push(r); G.uci.push(u);
    }
    G.selected = -1; G.legalMoves = []; G.legalTargets = new Set();
    G.hint = null; G.hintBusy = false; G.viewPly = null; G.thinking = false; G.offer = null;
    G.over = null;
    G.token++;
    G.lastTick = performance.now();
    if (G.mode === 'local' && settings.autoflip && G.orientation !== G.chess.turn) { G.orientation = G.chess.turn; buildBoard(); }
    renderAll();
    saveResume();
    updateEval();
  }

  /* ---------------- Computer opponent ---------------- */
  function maybeAI() {
    if (!G || G.mode !== 'ai' || G.over || G.chess.turn === G.myColor) return;
    const level = LEVELS.find((l) => l.id === G.cfg.level) || LEVELS[1];
    G.thinking = true;
    renderStatus(); renderHint();
    const token = G.token, game = G, t0 = performance.now();
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.uci.slice(), depth: level.depth, timeMs: level.timeMs, noise: level.noise }, 'main').then((r) => {
      const wait = Math.max(0, 420 - (performance.now() - t0));
      setTimeout(() => {
        if (G !== game || token !== G.token || G.over) return;
        G.thinking = false;
        if (r.move) applyMove(r.move, 'ai');
      }, wait);
    });
  }

  /* ---------------- Hints ---------------- */
  function explain(r) {
    const c = G.chess, m = r.move, turn = c.turn, them = opp(turn);
    const piece = c.board[m.from], t = piece.toLowerCase();
    const wasAttacked = c.isAttacked(m.from, them);
    const res = c.move(m);
    if (!res) return null;
    const attackedAfter = c.isAttacked(res.to, them);
    c.undo();
    const reasons = [];
    if (res.san.endsWith('#')) reasons.push('Checkmate');
    if (res.captured) reasons.push(`Captures a ${NAMES[res.captured.toLowerCase()]} (+${VAL[res.captured.toLowerCase()]})`);
    if (res.promo) reasons.push(`Promotes to a ${NAMES[res.promo]} (+${VAL[res.promo] - 1})`);
    if (res.flag === 'k' || res.flag === 'q') reasons.push(`Castles ${res.flag === 'k' ? 'kingside' : 'queenside'} for king safety`);
    if (res.san.endsWith('+')) reasons.push('Gives check');
    if (wasAttacked && !attackedAfter && !res.captured && t !== 'p') reasons.push(`Moves your ${NAMES[t]} out of danger`);
    const backRank = turn === 'w' ? 7 : 0;
    if ((t === 'n' || t === 'b') && (m.from >> 3) === backRank && c.fullmove <= 15) reasons.push('Develops a piece');
    if (t === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(sqName(m.to))) reasons.push('Controls the center');
    if (!reasons.length) reasons.push(attackedAfter ? 'Best option in a sharp position' : 'Improves your position');

    let evalText;
    if (r.mate) {
      evalText = r.mate > 0 ? `You can force checkmate in ${r.mate}.` : `Your opponent threatens mate in ${-r.mate}. This is the best defense.`;
    } else {
      const cp = r.score / 100;
      const abs = Math.abs(cp);
      const who = cp >= 0 ? 'you' : 'your opponent';
      const word = abs < 0.3 ? 'The position is about equal' : abs < 1 ? `Slight edge for ${who}` : abs < 3 ? `Clear advantage for ${who}` : `${who === 'you' ? 'You are' : 'Your opponent is'} winning`;
      evalText = `${word} (${cp >= 0 ? '+' : ''}${cp.toFixed(1)} from your side).`;
    }
    return { san: res.san, reasons, evalText };
  }

  function toggleHint() {
    if (!G || G.hintBusy) return;
    if (G.hint) { G.hint = null; renderBoard(); renderHint(); return; }
    if (G.cfg.hints === false) { toast('Hints are turned off for this game.'); return; }
    G.hintBusy = true;
    renderHint();
    const ply = G.uci.length, game = G;
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.uci.slice(), depth: 64, timeMs: 1300 }, 'hint').then((r) => {
      if (G !== game || G.uci.length !== ply || G.over || !G.hintBusy) return;
      G.hintBusy = false;
      if (!r.move) { renderHint(); return; }
      const ex = explain(r);
      if (!ex) { renderHint(); return; }
      G.hint = Object.assign({ move: r.move }, ex);
      G.hintsUsed[G.mode === 'local' ? G.chess.turn : G.myColor]++;
      G.evalScore = { score: r.turn === 'w' ? r.score : -r.score, mate: r.turn === 'w' ? r.mate : -r.mate };
      renderBoard(); renderHint(); renderEvalBar();
      saveResume();
    });
  }

  /* ---------------- Evaluation bar ---------------- */
  function evalAllowed() { return settings.evalbar && G && G.cfg.hints !== false; }
  function updateEval() {
    if (!evalAllowed() || G.over) { renderEvalBar(); return; }
    const ply = G.uci.length, game = G;
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.uci.slice(), depth: 64, timeMs: 450 }, 'eval').then((r) => {
      if (G !== game || G.uci.length !== ply) return;
      G.evalScore = { score: r.turn === 'w' ? r.score : -r.score, mate: r.turn === 'w' ? r.mate : -r.mate };
      renderEvalBar();
    });
  }
  function renderEvalBar() {
    const bar = $('#evalBar');
    const on = evalAllowed();
    bar.classList.toggle('hidden', !on);
    if (!on) return;
    let pct = 50, label = '0.0';
    if (G.over) {
      pct = G.over.winner === 'w' ? 100 : G.over.winner === 'b' ? 0 : 50;
      label = G.over.winner ? (G.over.winner === 'w' ? '1-0' : '0-1') : '½';
    } else if (G.evalScore) {
      if (G.evalScore.mate) { pct = G.evalScore.mate > 0 ? 100 : 0; label = 'M' + Math.abs(G.evalScore.mate); }
      else { pct = 100 / (1 + Math.exp(-0.0045 * G.evalScore.score)); label = (G.evalScore.score / 100).toFixed(1); }
    }
    $('#evalFill').style.height = pct + '%';
    $('#evalNum').textContent = label;
  }

  /* ---------------- Clock ---------------- */
  setInterval(() => {
    if (!G || !G.timed) return;
    const now = performance.now();
    const dt = now - G.lastTick;
    G.lastTick = now;
    if (G.over || G.records.length === 0) return;
    if (G.mode === 'online' && !Net.connected) return;
    if (G.mode === 'ai' && G.thinking && G.chess.turn !== G.myColor) { /* computer's clock runs too */ }
    const c = G.chess.turn;
    G.clocks[c] -= dt;
    if (G.clocks[c] <= 0) {
      G.clocks[c] = 0;
      if (G.mode === 'online' && c !== G.myColor) {
        if (!G.oppZeroSince) G.oppZeroSince = now;
        if (now - G.oppZeroSince > 2500) flag(c);
      } else flag(c);
    } else G.oppZeroSince = 0;
    updateClocks();
  }, 100);

  function flag(c) {
    if (G.over) return;
    const winner = opp(c);
    if (G.mode === 'online') Net.send({ t: 'flag', color: c });
    if (!G.chess.hasMatingMaterial(winner)) endGame({ over: true, winner: null, reason: 'timeoutDraw', loser: c });
    else endGame({ over: true, winner, reason: 'timeout', loser: c });
  }

  /* ---------------- Game end ---------------- */
  function resultTitle(r) {
    if (!r.winner) return 'Draw';
    if (G.mode === 'local') return `${playerLabel(r.winner)} wins`;
    return r.winner === G.myColor ? 'You win' : `${G.mode === 'ai' ? 'Computer' : playerLabel(r.winner)} wins`;
  }
  function resultReason(r) {
    const loser = r.loser ? playerLabel(r.loser) : '';
    switch (r.reason) {
      case 'checkmate': return 'by checkmate';
      case 'stalemate': return 'Stalemate: no legal moves, but not in check';
      case 'insufficient': return 'Neither side has enough material to checkmate';
      case 'repetition': return 'The same position appeared three times';
      case 'fifty': return '50 moves without a capture or pawn move';
      case 'resign': return `${loser} resigned`;
      case 'timeout': return `${loser} ran out of time`;
      case 'timeoutDraw': return `${loser} ran out of time, but the opponent cannot checkmate`;
      case 'agreement': return 'Draw by agreement';
      case 'abandon': return `${loser} left the game`;
      default: return '';
    }
  }

  function endGame(r) {
    if (!G || G.over) return;
    G.over = r;
    G.thinking = false;
    G.hint = null;
    G.selected = -1; G.legalTargets = new Set(); G.legalMoves = [];
    G.token++;
    store.del('resume');
    Sound.play('end');
    renderAll();
    setTimeout(() => { if (G && G.over === r) showResult(); }, 650);
  }

  function showResult() {
    const r = G.over;
    const caps = captures();
    const pts = (c) => caps[c].reduce((s, t) => s + VAL[t], 0);
    const actions = [];
    if (G.mode === 'online') {
      if (Net.connected) actions.push('<button class="btn primary" data-act="rematch">Offer rematch</button>');
    } else actions.push('<button class="btn primary" data-act="again">Play again</button>');
    openModal(`
      <div class="m-head"><div><p class="result-big">${esc(resultTitle(r))}</p><p class="result-why">${esc(resultReason(r))}</p></div>
        <button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="result-stats">
        <div><span>${esc(playerLabel('w'))} points</span><b>${pts('w')}</b></div>
        <div><span>${esc(playerLabel('b'))} points</span><b>${pts('b')}</b></div>
        <div><span>Moves played</span><b>${Math.ceil(G.records.length / 2)}</b></div>
        <div><span>Hints used</span><b>${G.mode === 'local' ? G.hintsUsed.w + G.hintsUsed.b : G.hintsUsed[G.myColor]}</b></div>
      </div>
      <div class="m-actions">
        <button class="btn" data-act="review">Review game</button>
        <button class="btn" data-act="home">Home</button>
        ${actions.join('')}
      </div>`, (act) => {
      if (act === 'review') { closeModal(); setView(0); }
      else if (act === 'home') { closeModal(); goHome(); }
      else if (act === 'again') {
        closeModal();
        const cfg = G.cfg;
        if (cfg.mode === 'ai' && cfg.colorPref === 'random') cfg.myColor = Math.random() < 0.5 ? 'w' : 'b';
        if (cfg.mode === 'ai') { cfg.players = aiPlayers(cfg); }
        newGame(cfg);
      } else if (act === 'rematch') { closeModal(); Net.send({ t: 'rematch' }); toast('Rematch offered'); }
    });
  }

  /* ---------------- Review navigation ---------------- */
  function setView(ply) {
    if (!G) return;
    ply = Math.max(0, Math.min(G.records.length, ply));
    G.viewPly = ply === G.records.length ? null : ply;
    G.selected = -1; G.legalTargets = new Set(); G.legalMoves = [];
    renderBoard(); renderCards(); renderMoves(); renderPoints(); renderHint(); renderToolbar();
  }
  const curPly = () => (G.viewPly == null ? G.records.length : G.viewPly);

  /* ---------------- Toolbar actions ---------------- */
  function doUndo() {
    if (!G || !G.records.length) return;
    if (G.mode === 'local') { rebuildTo(G.records.length - 1); return; }
    if (G.mode === 'ai') {
      let target = G.records.length;
      // remove back to before the player's last move
      for (let i = G.records.length - 1; i >= 0; i--) { if (G.records[i].color === G.myColor) { target = i; break; } }
      rebuildTo(target);
      maybeAI();
      return;
    }
    if (G.mode === 'online') {
      let target = -1;
      for (let i = G.records.length - 1; i >= 0; i--) { if (G.records[i].color === G.myColor) { target = i; break; } }
      if (target < 0) return;
      Net.send({ t: 'takeback', ply: target });
      toast('Takeback requested');
    }
  }

  function doDraw() {
    if (!G || G.over) return;
    if (G.mode === 'local') {
      confirmBox('Agree to a draw?', 'Both players agree to end the game as a draw.', 'Agree to draw', () => endGame({ over: true, winner: null, reason: 'agreement' }));
    } else if (G.mode === 'ai') {
      if (G.records.length < 20) { toast('The computer declines. It is too early for a draw.'); return; }
      EngineHost.think({ startFen: G.cfg.startFen, moves: G.uci.slice(), depth: 64, timeMs: 500 }, 'eval').then((r) => {
        const white = r.turn === 'w' ? r.score : -r.score;
        const aiScore = G.myColor === 'w' ? -white : white;
        if (aiScore <= 40) endGame({ over: true, winner: null, reason: 'agreement' });
        else toast('The computer declines the draw offer.');
      });
    } else {
      Net.send({ t: 'drawOffer' });
      toast('Draw offered');
    }
  }

  function doResign() {
    if (!G || G.over) return;
    const loser = G.mode === 'local' ? G.chess.turn : G.myColor;
    const name = G.mode === 'local' ? playerLabel(loser) : 'you';
    confirmBox('Resign this game?', `This ends the game with ${name === 'you' ? 'you' : name} losing.`, 'Resign', () => {
      if (G.mode === 'online') Net.send({ t: 'resign' });
      endGame({ over: true, winner: opp(loser), reason: 'resign', loser });
    }, true);
  }

  function flipBoard() {
    if (!G) return;
    G.orientation = opp(G.orientation);
    buildBoard();
    renderAll();
  }

  function downloadPGN() {
    if (!G) return;
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const result = G.over ? (G.over.winner === 'w' ? '1-0' : G.over.winner === 'b' ? '0-1' : '1/2-1/2') : '*';
    const tags = [['Event', 'Gambit Chess'], ['Site', location.host || 'Local'], ['Date', date], ['White', playerLabel('w')], ['Black', playerLabel('b')], ['Result', result]];
    if (G.cfg.tc && G.cfg.tc.base) tags.push(['TimeControl', `${G.cfg.tc.base}+${G.cfg.tc.inc}`]);
    if (G.cfg.startFen !== Chess.START_FEN) { tags.push(['SetUp', '1']); tags.push(['FEN', G.cfg.startFen]); }
    let moves = '';
    G.records.forEach((r, i) => { if (i % 2 === 0) moves += `${i / 2 + 1}. `; moves += r.san + ' '; });
    const pgn = tags.map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n' + (moves + result).trim() + '\n';
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gambit-${date.replace(/\./g, '-')}.pgn`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('PGN saved');
  }

  /* ---------------- Online offers ---------------- */
  function showOffer(text, onAccept, onDecline) {
    const box = $('#offerBox');
    box.innerHTML = `<span>${esc(text)}</span><div class="row"><button class="btn" data-o="no">Decline</button><button class="btn primary" data-o="yes">Accept</button></div>`;
    box.classList.remove('hidden');
    box.onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      box.classList.add('hidden');
      if (b.dataset.o === 'yes') onAccept(); else if (onDecline) onDecline();
    };
    Sound.play('notify');
  }

  /* ---------------- Modals ---------------- */
  let modalHandler = null;
  function openModal(html, handler, wide) {
    const m = $('#modal');
    m.className = 'modal' + (wide ? ' wide' : '');
    m.innerHTML = html;
    fillIcons(m);
    modalHandler = handler;
    $('#modalBack').classList.remove('hidden');
  }
  function closeModal() {
    $('#modalBack').classList.add('hidden');
    $('#modal').innerHTML = '';
    modalHandler = null;
  }
  $('#modalBack').addEventListener('click', (e) => {
    if (e.target.id === 'modalBack' || e.target.closest('[data-close]')) {
      const h = modalHandler;
      closeModal();
      if (h) h('close');
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && modalHandler) modalHandler(a.dataset.act, a);
  });

  function confirmBox(title, text, okLabel, onOk, danger) {
    openModal(`<div class="m-head"><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>
      <div class="m-actions"><button class="btn" data-act="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okLabel)}</button></div>`,
    (act) => { if (act === 'ok') { closeModal(); onOk(); } else if (act === 'cancel') closeModal(); });
  }

  function seg(name, items, value, big) {
    return `<div class="seg ${big ? 'big' : ''}" data-seg="${name}">${items.map((it) => `<button type="button" data-v="${it.id}" class="${it.id === value ? 'on' : ''}">${esc(it.label)}${big && it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }
  function wireSegs(root, state) {
    $$('[data-seg]', root).forEach((s) => {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $$('button', s).forEach((x) => x.classList.toggle('on', x === b));
        state[s.dataset.seg] = b.dataset.v;
      });
    });
  }
  function toggleRow(id, label, sub, on) {
    return `<label class="toggle"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></span></label>`;
  }

  /* ---------------- Setup screens ---------------- */
  function aiPlayers(cfg) {
    const level = LEVELS.find((l) => l.id === cfg.level) || LEVELS[1];
    const me = cfg.myName || 'You';
    return cfg.myColor === 'w' ? { w: { name: me }, b: { name: `Computer (${level.label})` } } : { w: { name: `Computer (${level.label})` }, b: { name: me } };
  }

  function setupLocal() {
    const st = { tc: 'none' };
    openModal(`
      <div class="m-head"><div><h3>Pass &amp; Play</h3><p>Two players share this device and take turns.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field-row">
        <div class="field"><label for="nW">White</label><input type="text" id="nW" maxlength="20" placeholder="White"></div>
        <div class="field"><label for="nB">Black</label><input type="text" id="nB" maxlength="20" placeholder="Black"></div>
      </div>
      <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
      <div class="field">
        ${toggleRow('optHints', 'Allow hints', 'Either player can ask for the best move', true)}
        ${toggleRow('optFlip', 'Rotate board each turn', 'The board faces whoever is moving', settings.autoflip)}
      </div>
      <div class="m-actions"><button class="btn primary block" data-act="start">${icon('play')}Start game</button></div>`,
    (act) => {
      if (act !== 'start') return;
      settings.autoflip = $('#optFlip').checked; saveSettings();
      const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
      const cfg = {
        mode: 'local',
        players: { w: { name: $('#nW').value.trim() || 'White' }, b: { name: $('#nB').value.trim() || 'Black' } },
        tc: { base: tc.base, inc: tc.inc },
        hints: $('#optHints').checked
      };
      closeModal();
      newGame(cfg);
    });
    wireSegs($('#modal'), st);
  }

  function setupAI() {
    const st = { level: 'casual', color: 'w', tc: 'none' };
    openModal(`
      <div class="m-head"><div><h3>Play the computer</h3><p>The computer runs on your device, so this works offline.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field"><label for="nMe">Your name</label><input type="text" id="nMe" maxlength="20" placeholder="You" value="${esc(settings.name)}"></div>
      <div class="field"><span class="lbl">Difficulty</span>${seg('level', LEVELS, st.level, true)}</div>
      <div class="field"><span class="lbl">Play as</span>${seg('color', [{ id: 'w', label: 'White' }, { id: 'random', label: 'Random' }, { id: 'b', label: 'Black' }], st.color)}</div>
      <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
      <div class="field">${toggleRow('optHints', 'Allow hints', 'Ask the coach for the best move on your turn', true)}</div>
      <div class="m-actions"><button class="btn primary block" data-act="start">${icon('play')}Start game</button></div>`,
    (act) => {
      if (act !== 'start') return;
      const name = $('#nMe').value.trim();
      settings.name = name; saveSettings();
      const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
      const myColor = st.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : st.color;
      const cfg = { mode: 'ai', level: st.level, myColor, colorPref: st.color, myName: name || 'You', tc: { base: tc.base, inc: tc.inc }, hints: $('#optHints').checked };
      cfg.players = aiPlayers(cfg);
      closeModal();
      newGame(cfg);
    });
    wireSegs($('#modal'), st);
  }

  function setupOnline(joinCode) {
    const st = { color: 'random', tc: '10+0', tab: joinCode ? 'join' : 'create' };
    const peerReady = () => typeof window.Peer === 'function';
    openModal(`
      <div class="m-head"><div><h3>Play online</h3><p>Create a room and share the link, or join a friend's room.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="tabs" style="margin-bottom:16px">
        <button class="tab ${st.tab === 'create' ? 'active' : ''}" data-act="tab" data-t="create">Create room</button>
        <button class="tab ${st.tab === 'join' ? 'active' : ''}" data-act="tab" data-t="join">Join room</button>
      </div>
      <div class="field"><label for="nMe">Your name</label><input type="text" id="nMe" maxlength="20" placeholder="Player" value="${esc(settings.name)}"></div>
      <div id="createPane" class="${st.tab === 'create' ? '' : 'hidden'}">
        <div class="field"><span class="lbl">Your color</span>${seg('color', [{ id: 'w', label: 'White' }, { id: 'random', label: 'Random' }, { id: 'b', label: 'Black' }], st.color)}</div>
        <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
        <div class="field">${toggleRow('optHints', 'Allow hints', 'Both players can use the coach and evaluation bar', false)}</div>
        <div id="roomSlot"></div>
        <div class="m-actions" id="createActions"><button class="btn primary block" data-act="create">${icon('link')}Create room</button></div>
      </div>
      <div id="joinPane" class="${st.tab === 'join' ? '' : 'hidden'}">
        <div class="field"><label for="codeIn">Room code</label><input type="text" id="codeIn" maxlength="6" placeholder="ABC123" value="${esc(joinCode || '')}" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.15em"></div>
        <div class="waiting hidden" id="joinWait"><span class="spinner"></span>Connecting...</div>
        <div class="m-actions"><button class="btn primary block" data-act="join">${icon('globe')}Join game</button></div>
      </div>`,
    (act, el) => {
      if (act === 'close') { if (!G || G.mode !== 'online' || !Net.connected) Net.close(); return; }
      if (act === 'tab') {
        st.tab = el.dataset.t;
        $$('.tabs .tab', $('#modal')).forEach((t) => t.classList.toggle('active', t.dataset.t === st.tab));
        $('#createPane').classList.toggle('hidden', st.tab !== 'create');
        $('#joinPane').classList.toggle('hidden', st.tab !== 'join');
        return;
      }
      const name = $('#nMe').value.trim() || 'Player';
      settings.name = $('#nMe').value.trim(); saveSettings();
      if (!peerReady()) { toast('Online play needs an internet connection. Check your connection and reload.'); return; }
      if (act === 'create') {
        const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
        const hostColor = st.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : st.color;
        el.disabled = true;
        el.innerHTML = '<span class="spinner"></span>Creating room...';
        Net.host({ name, hostColor, tc: { base: tc.base, inc: tc.inc }, hints: $('#optHints').checked }, (code) => {
          const link = `${location.origin}${location.pathname}?room=${code}`;
          $('#createActions').classList.add('hidden');
          $('#roomSlot').innerHTML = `<div class="room-box">
              <div class="lbl" style="font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Room code</div>
              <div class="room-code">${code}</div>
              <div class="room-link"><input readonly value="${esc(link)}" id="roomLink"><button class="btn" data-act="copy">${icon('copy')}Copy link</button></div>
              <div class="waiting"><span class="spinner"></span>Waiting for your friend to join...</div>
            </div>`;
        });
      } else if (act === 'copy') {
        const v = $('#roomLink').value;
        const done = () => toast('Link copied');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { $('#roomLink').select(); document.execCommand('copy'); done(); });
        else { $('#roomLink').select(); document.execCommand('copy'); done(); }
      } else if (act === 'join') {
        const code = $('#codeIn').value.trim().toUpperCase();
        if (code.length < 4) { toast('Enter the room code your friend sent you.'); return; }
        $('#joinWait').classList.remove('hidden');
        Net.join(code, name, (err) => {
          $('#joinWait').classList.add('hidden');
          toast(err);
        });
      }
    });
    wireSegs($('#modal'), st);
  }

  /* ---------------- Networking (PeerJS / WebRTC) ---------------- */
  const PREFIX = 'gambit-chess-v1-';
  const Net = {
    peer: null, conn: null, code: null, role: null, connected: false, hostCfg: null,
    genCode() {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let s = '';
      for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
      return s;
    },
    close() {
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null; this.conn = null; this.connected = false; this.role = null;
    },
    queue: [],
    send(obj) {
      if (this.conn && this.conn.open) { try { this.conn.send(obj); } catch (e) { /* ignore */ } }
      else if (this.conn) this.queue.push(obj);
    },
    host(cfg, onReady, tries) {
      this.close();
      this.role = 'host';
      this.hostCfg = cfg;
      const code = this.genCode();
      this.code = code;
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      this.peer = peer;
      peer.on('open', () => onReady(code));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && (tries || 0) < 4) { this.host(cfg, onReady, (tries || 0) + 1); return; }
        if (err.type === 'peer-unavailable') return;
        toast('Connection problem: ' + (err.type || 'unknown') + '. Try again.');
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('connection', (conn) => {
        if (this.conn && this.conn.open) {
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); });
          return;
        }
        this.attach(conn);
      });
    },
    join(code, name, onErr) {
      this.close();
      this.role = 'guest';
      this.code = code;
      this.myName = name;
      const peer = new window.Peer({ debug: 0 });
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { onErr('Could not reach that room. Check the code and that your friend still has it open.'); this.close(); } }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, metadata: { name } });
        this.attach(conn, () => { settled = true; clearTimeout(timer); });
      });
      peer.on('error', (err) => {
        if (settled && err.type !== 'peer-unavailable') { toast('Connection problem: ' + err.type); return; }
        settled = true; clearTimeout(timer);
        onErr(err.type === 'peer-unavailable' ? 'Room not found. Check the code and try again.' : 'Could not connect (' + err.type + ').');
        this.close();
      });
    },
    attach(conn, onOpen) {
      this.conn = conn;
      this.queue = [];
      conn.on('open', () => {
        this.connected = true;
        if (onOpen) onOpen();
        const q = this.queue.splice(0);
        q.forEach((m) => { try { conn.send(m); } catch (e) { /* ignore */ } });
        if (this.role === 'guest') conn.send({ t: 'join', name: this.myName });
        if (G && G.mode === 'online') renderAll();
      });
      conn.on('data', (msg) => onNet(msg));
      conn.on('close', () => {
        if (this.conn !== conn) return;
        this.connected = false;
        this.conn = null;
        if (G && G.mode === 'online') {
          if (!G.over) toast('Your opponent disconnected', 3500);
          renderAll();
          if (this.role === 'guest' && !G.over) setTimeout(() => this.rejoin(), 1500);
        }
      });
      conn.on('error', () => { /* handled by close */ });
    },
    rejoin() {
      if (this.connected || this.role !== 'guest' || !this.peer || this.peer.destroyed) return;
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
      this.attach(conn);
    }
  };

  function onlineHello() {
    // host -> guest: full game state (also used when the guest reconnects)
    const c = G && G.mode === 'online' ? G : null;
    return {
      t: 'hello',
      players: c.cfg.players,
      yourColor: opp(c.myColor),
      tc: c.cfg.tc,
      hints: c.cfg.hints,
      startFen: c.cfg.startFen,
      uci: c.uci,
      clocks: c.clocks,
      over: c.over
    };
  }

  function onNet(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join': {
        if (Net.role !== 'host') return;
        const name = String(msg.name || 'Guest').slice(0, 20);
        if (!G || G.mode !== 'online' || G.over) {
          const h = Net.hostCfg;
          const players = h.hostColor === 'w' ? { w: { name: h.name }, b: { name } } : { w: { name }, b: { name: h.name } };
          closeModal();
          newGame({ mode: 'online', myColor: h.hostColor, players, tc: h.tc, hints: h.hints });
          Sound.play('notify');
          toast(`${name} joined. Good luck!`);
        } else {
          toast(`${name} reconnected`);
        }
        Net.send(onlineHello());
        renderAll();
        break;
      }
      case 'hello': {
        if (Net.role !== 'guest') return;
        const fresh = !G || G.mode !== 'online' || G.uci.join() !== (msg.uci || []).join();
        if (fresh) {
          closeModal();
          newGame({ mode: 'online', myColor: msg.yourColor, players: msg.players, tc: msg.tc, hints: msg.hints, startFen: msg.startFen }, { uci: msg.uci, clocks: msg.clocks });
          Sound.play('notify');
          toast(`Connected. You play ${COLOR_NAME[msg.yourColor]}.`);
        } else {
          if (msg.clocks) G.clocks = msg.clocks;
          toast('Reconnected');
          renderAll();
        }
        break;
      }
      case 'move': {
        if (!G || G.mode !== 'online' || G.over) return;
        if (G.chess.turn === G.myColor) return;
        if (msg.ply && msg.ply !== G.uci.length + 1) return;
        const ok = applyMove({ from: msg.from, to: msg.to, promo: msg.promo }, 'remote', { clock: msg.clock });
        if (!ok) toast('Received an invalid move');
        break;
      }
      case 'resign':
        if (G && !G.over) endGame({ over: true, winner: G.myColor, reason: 'resign', loser: opp(G.myColor) });
        break;
      case 'flag':
        if (G && !G.over && (msg.color === 'w' || msg.color === 'b')) {
          G.clocks[msg.color] = 0;
          const winner = opp(msg.color);
          if (!G.chess.hasMatingMaterial(winner)) endGame({ over: true, winner: null, reason: 'timeoutDraw', loser: msg.color });
          else endGame({ over: true, winner, reason: 'timeout', loser: msg.color });
        }
        break;
      case 'drawOffer':
        if (!G || G.over) return;
        showOffer(`${playerLabel(opp(G.myColor))} offers a draw`, () => { Net.send({ t: 'drawAccept' }); endGame({ over: true, winner: null, reason: 'agreement' }); }, () => Net.send({ t: 'drawDecline' }));
        break;
      case 'drawAccept':
        if (G && !G.over) endGame({ over: true, winner: null, reason: 'agreement' });
        break;
      case 'drawDecline': toast('Draw offer declined'); break;
      case 'takeback':
        if (!G || G.over || typeof msg.ply !== 'number') return;
        showOffer(`${playerLabel(opp(G.myColor))} asks to take back a move`, () => { Net.send({ t: 'takebackAccept', ply: msg.ply }); rebuildTo(msg.ply); }, () => Net.send({ t: 'takebackDecline' }));
        break;
      case 'takebackAccept':
        if (G && typeof msg.ply === 'number') { rebuildTo(msg.ply); toast('Takeback accepted'); }
        break;
      case 'takebackDecline': toast('Takeback declined'); break;
      case 'rematch':
        if (!G) return;
        if ($('#modalBack').classList.contains('hidden') === false) closeModal();
        showOffer(`${playerLabel(opp(G.myColor))} wants a rematch`, () => { Net.send({ t: 'rematchGo' }); startRematch(); }, () => Net.send({ t: 'rematchNo' }));
        break;
      case 'rematchGo': closeModal(); startRematch(); break;
      case 'rematchNo': toast('Rematch declined'); break;
      case 'chat': addChat(String(msg.text || '').slice(0, 200), 'them'); break;
      case 'full': toast('That room already has two players.'); Net.close(); break;
      default: break;
    }
  }

  function startRematch() {
    const cfg = JSON.parse(JSON.stringify(G.cfg));
    cfg.myColor = opp(G.myColor);
    cfg.players = { w: cfg.players.b, b: cfg.players.w };
    if (Net.role === 'host' && Net.hostCfg) Net.hostCfg.hostColor = cfg.myColor;
    newGame(cfg);
    toast(`Rematch! You play ${COLOR_NAME[cfg.myColor]}.`);
  }

  function addChat(text, who) {
    if (!text) return;
    const log = $('#chatLog');
    const el = document.createElement('div');
    el.className = 'chat-msg ' + (who === 'me' ? 'me' : who === 'sys' ? 'sys' : '');
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (who === 'them' && $('[data-panel=chat]').classList.contains('hidden')) $('#chatDot').classList.remove('hidden');
    if (who === 'them') Sound.play('notify');
  }
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chatInput');
    const text = inp.value.trim();
    if (!text) return;
    if (!Net.connected) { toast('Not connected'); return; }
    Net.send({ t: 'chat', text });
    addChat(text, 'me');
    inp.value = '';
  });

  /* ---------------- Views & navigation ---------------- */
  function showView(v) {
    $('#home').classList.toggle('hidden', v !== 'home');
    $('#game').classList.toggle('hidden', v !== 'game');
    window.scrollTo(0, 0);
  }

  function goHome() {
    if (G && G.mode === 'online' && !G.over && Net.connected) {
      confirmBox('Leave this online game?', 'Leaving counts as resigning.', 'Leave game', () => {
        Net.send({ t: 'resign' });
        endGame({ over: true, winner: opp(G.myColor), reason: 'resign', loser: G.myColor });
        closeModal();
        Net.close();
        G = null;
        renderHome();
        showView('home');
      }, true);
      return;
    }
    if (G && G.mode === 'online') { Net.close(); G = null; }
    renderHome();
    showView('home');
  }

  function switchTab(name) {
    $$('.tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    if (name === 'chat') $('#chatDot').classList.add('hidden');
  }

  function renderHome() {
    $('#valuesRow').innerHTML = ['p', 'n', 'b', 'r', 'q', 'k'].map((t) =>
      `<div class="value-tile"><span class="pc">${pieceSVG(t.toUpperCase())}</span><b>${t === 'k' ? '-' : VAL[t]}</b><span>${NAMES[t]}</span></div>`).join('');
    const r = store.get('resume', null);
    const slot = $('#resumeSlot');
    if (r && r.cfg && r.uci && r.uci.length) {
      const label = r.cfg.mode === 'ai' ? `vs ${r.cfg.myColor === 'w' ? r.cfg.players.b.name : r.cfg.players.w.name}` : `${r.cfg.players.w.name} vs ${r.cfg.players.b.name}`;
      slot.innerHTML = `<div class="resume"><div><strong>Continue your game</strong><span>${esc(label)} · ${Math.ceil(r.uci.length / 2)} moves played</span></div>
        <div class="row"><button class="btn ghost" id="resumeDrop">Discard</button><button class="btn primary" id="resumeGo">Resume</button></div></div>`;
      $('#resumeGo').onclick = () => newGame(r.cfg, r);
      $('#resumeDrop').onclick = () => { store.del('resume'); renderHome(); };
    } else slot.innerHTML = '';
  }

  function openSettings() {
    openModal(`
      <div class="m-head"><div><h3>Settings</h3><p>Saved on this device.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field"><span class="lbl">Appearance</span>${seg('ui', [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], settings.ui)}</div>
      <div class="field"><span class="lbl">Board</span><div class="swatches">${BOARDS.map((b) => `<button class="swatch ${b.id === settings.board ? 'on' : ''}" data-act="board" data-b="${b.id}" aria-label="${b.id} board"><i style="background:${b.l}"></i><i style="background:${b.d}"></i><i style="background:${b.d}"></i><i style="background:${b.l}"></i></button>`).join('')}</div></div>
      <div class="field">
        ${toggleRow('sLegal', 'Show legal moves', 'Dots and rings mark every square a piece can reach', settings.legal)}
        ${toggleRow('sCoords', 'Board coordinates', 'Show files a-h and ranks 1-8', settings.coords)}
        ${toggleRow('sEval', 'Evaluation bar', 'Live advantage meter (only when hints are allowed)', settings.evalbar)}
        ${toggleRow('sFlip', 'Rotate board in Pass & Play', 'Turn the board to face the player to move', settings.autoflip)}
        ${toggleRow('sAnim', 'Animations', 'Slide pieces when moves are made', settings.anim)}
        ${toggleRow('sSound', 'Sounds', 'Move, capture and check sounds', settings.sound)}
      </div>
      <div class="m-actions"><button class="btn primary" data-act="done">Done</button></div>`,
    (act, el) => {
      if (act === 'board') {
        settings.board = el.dataset.b;
        $$('.swatch', $('#modal')).forEach((s) => s.classList.toggle('on', s === el));
        applyTheme(); saveSettings();
      } else if (act === 'done') closeModal();
    });
    const m = $('#modal');
    $('[data-seg=ui]', m).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', b.parentNode).forEach((x) => x.classList.toggle('on', x === b));
      settings.ui = b.dataset.v; applyTheme(); saveSettings();
    });
    const bind = (id, key, after) => $('#' + id, m).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); if (after) after(); });
    bind('sLegal', 'legal', () => G && renderBoard());
    bind('sCoords', 'coords', () => { if (G) { buildBoard(); renderAll(); } });
    bind('sEval', 'evalbar', () => { if (G) { renderEvalBar(); updateEval(); } });
    bind('sFlip', 'autoflip', () => { if (G && G.mode === 'local' && settings.autoflip && G.orientation !== G.chess.turn) { G.orientation = G.chess.turn; buildBoard(); renderAll(); } });
    bind('sAnim', 'anim');
    bind('sSound', 'sound');
  }

  function openRules() {
    openModal(`
      <div class="m-head"><div><h3>How the rules work</h3><p>Everything below is enforced automatically.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="rules">
        <h4>Moving</h4><p>Tap or drag a piece. Dots show empty squares it can reach, rings show pieces it can capture. Moves that would leave your own king in check are never allowed.</p>
        <h4>Castling</h4><p>Move the king two squares toward a rook. Allowed only if neither piece has moved, the squares between are empty, and the king is not in check and does not pass through or land on an attacked square.</p>
        <h4>En passant</h4><p>When a pawn moves two squares and lands beside an enemy pawn, that pawn may capture it as if it had moved one square, but only on the very next move.</p>
        <h4>Promotion</h4><p>A pawn reaching the last rank becomes a queen, rook, bishop or knight of your choice.</p>
        <h4>Winning</h4><p>Checkmate the king, or win when your opponent resigns or runs out of time.</p>
        <h4>Draws</h4><p>Stalemate, threefold repetition, 50 moves without a capture or pawn move, not enough material to checkmate, a flag fall against a lone king, or agreement.</p>
        <h4>Points</h4><p>Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9. Points are a guide to who is ahead in material. Checkmate wins regardless of points.</p>
      </div>
      <div class="m-actions"><button class="btn primary" data-close>Got it</button></div>`, null, true);
  }

  /* ---------------- Wiring ---------------- */
  function init() {
    applyTheme();
    fillIcons(document);
    $('#brandMark').innerHTML = pieceSVG('n').split('#2b2f37').join('#0e1014');
    renderHome();

    $$('.mode-card').forEach((c) => c.addEventListener('click', () => {
      const m = c.dataset.mode;
      if (m === 'local') setupLocal();
      else if (m === 'ai') setupAI();
      else setupOnline();
    }));
    $('#brandBtn').onclick = goHome;
    $('#navPlay').onclick = goHome;
    $('#navRules').onclick = openRules;
    $('#navSettings').onclick = openSettings;
    $('#navTheme').onclick = () => { settings.ui = settings.ui === 'dark' ? 'light' : 'dark'; applyTheme(); saveSettings(); };

    $('#hintBtn').onclick = toggleHint;
    $('#undoBtn').onclick = doUndo;
    $('#flipBtn').onclick = flipBoard;
    $('#drawBtn').onclick = doDraw;
    $('#resignBtn').onclick = doResign;
    $('#pgnBtn').onclick = downloadPGN;
    $('#newBtn').onclick = () => {
      if (!G) return;
      const start = () => {
        if (G.mode === 'online') { if (Net.connected) { Net.send({ t: 'rematch' }); toast('New game offered to your opponent'); } return; }
        if (G.mode === 'ai') setupAI(); else setupLocal();
      };
      if (!G.over && G.records.length && G.mode !== 'online') confirmBox('Start a new game?', 'The current game will be lost.', 'New game', start);
      else start();
    };
    $('#reviewLive').onclick = () => setView(G.records.length);
    $('#moveList').addEventListener('click', (e) => { const b = e.target.closest('[data-ply]'); if (b) setView(+b.dataset.ply); });
    $('#navFirst').onclick = () => setView(0);
    $('#navPrev').onclick = () => setView(curPly() - 1);
    $('#navNext').onclick = () => setView(curPly() + 1);
    $('#navLast').onclick = () => setView(G.records.length);
    $$('.tab[data-tab]').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    document.addEventListener('keydown', (e) => {
      if (!G || $('#game').classList.contains('hidden')) return;
      if (e.target.closest('input, textarea')) return;
      if (!$('#modalBack').classList.contains('hidden')) { if (e.key === 'Escape') { const h = modalHandler; closeModal(); if (h) h('close'); } return; }
      if (e.key === 'ArrowLeft') { setView(curPly() - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setView(curPly() + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setView(0); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { setView(G.records.length); e.preventDefault(); }
      else if (e.key === 'f') flipBoard();
      else if (e.key === 'h') toggleHint();
      else if (e.key === 'Escape') deselect();
    });

    window.addEventListener('resize', () => { if (G) renderArrows(); });
    window.addEventListener('beforeunload', (e) => {
      if (G && G.mode === 'online' && !G.over && Net.connected) { e.preventDefault(); e.returnValue = ''; }
    });

    const room = new URLSearchParams(location.search).get('room');
    if (room) {
      const open = () => setupOnline(room.toUpperCase().slice(0, 6));
      if (document.readyState === 'complete') open(); else window.addEventListener('load', open);
    }

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  init();
})();
