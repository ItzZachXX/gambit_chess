/*
 * Gambit - chess rules engine
 * Implements the full FIDE Laws of Chess for play:
 *  - legal move generation (no move may leave your own king in check)
 *  - castling (both sides, with all through-check / rook / rights conditions)
 *  - en passant, double pawn push, promotion (Q/R/B/N)
 *  - check, checkmate, stalemate
 *  - threefold repetition, fifty-move rule, insufficient material
 *  - SAN notation and FEN import/export
 */
function GambitChessFactory(root) {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const QUEEN = DIAG.concat(ORTH);
  const PROMOS = ['q', 'r', 'b', 'n'];

  // Board index 0 = a8, 7 = h8, 56 = a1, 63 = h1 (same order as FEN)
  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
  const sqIndex = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
  const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
  const opp = (c) => (c === 'w' ? 'b' : 'w');

  class Chess {
    constructor(fen) {
      this.load(fen || START_FEN);
    }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      this.board = new Array(64).fill(null);
      let i = 0;
      for (const ch of parts[0]) {
        if (ch === '/') continue;
        if (ch >= '1' && ch <= '8') i += +ch;
        else this.board[i++] = ch;
      }
      this.turn = parts[1] === 'b' ? 'b' : 'w';
      const c = parts[2] || '-';
      this.castling = { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') };
      this.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
      this.halfmove = parseInt(parts[4] || '0', 10) || 0;
      this.fullmove = parseInt(parts[5] || '1', 10) || 1;
      this.kings = { w: this.board.indexOf('K'), b: this.board.indexOf('k') };
      this.history = [];
      this.sanList = [];
      this.repetition = {};
      this.repKeys = [];
      this._addRep();
    }

    fen() {
      return `${this._placement()} ${this.turn} ${this._castleStr()} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
    }

    _placement() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[r * 8 + f];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          s += p;
        }
        if (empty) s += empty;
        if (r < 7) s += '/';
      }
      return s;
    }

    _castleStr() {
      const c = this.castling;
      return (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') || '-';
    }

    // Position identity for repetition (FIDE: same placement, side to move, castling rights, en passant possibility)
    key() {
      let ep = '-';
      if (this.ep >= 0) {
        const b = this.board, f = this.ep & 7;
        const pawn = this.turn === 'w' ? 'P' : 'p';
        const base = this.turn === 'w' ? this.ep + 8 : this.ep - 8;
        if ((f > 0 && b[base - 1] === pawn) || (f < 7 && b[base + 1] === pawn)) ep = sqName(this.ep);
      }
      return `${this._placement()} ${this.turn} ${this._castleStr()} ${ep}`;
    }

    _addRep() {
      const k = this.key();
      this.repetition[k] = (this.repetition[k] || 0) + 1;
      this.repKeys.push(k);
    }

    isAttacked(sq, by) {
      if (sq < 0) return false;
      const b = this.board, r = sq >> 3, f = sq & 7;
      if (by === 'w') {
        if (r < 7) {
          if (f > 0 && b[sq + 7] === 'P') return true;
          if (f < 7 && b[sq + 9] === 'P') return true;
        }
      } else if (r > 0) {
        if (f > 0 && b[sq - 9] === 'p') return true;
        if (f < 7 && b[sq - 7] === 'p') return true;
      }
      const white = by === 'w';
      const N = white ? 'N' : 'n', K = white ? 'K' : 'k', B = white ? 'B' : 'b', R = white ? 'R' : 'r', Q = white ? 'Q' : 'q';
      for (let i = 0; i < 8; i++) {
        const rr = r + KNIGHT[i][0], ff = f + KNIGHT[i][1];
        if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === N) return true;
      }
      for (let i = 0; i < 8; i++) {
        const rr = r + KING[i][0], ff = f + KING[i][1];
        if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && b[rr * 8 + ff] === K) return true;
      }
      for (let i = 0; i < 4; i++) {
        const dr = DIAG[i][0], df = DIAG[i][1];
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const p = b[rr * 8 + ff];
          if (p) { if (p === B || p === Q) return true; break; }
          rr += dr; ff += df;
        }
      }
      for (let i = 0; i < 4; i++) {
        const dr = ORTH[i][0], df = ORTH[i][1];
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const p = b[rr * 8 + ff];
          if (p) { if (p === R || p === Q) return true; break; }
          rr += dr; ff += df;
        }
      }
      return false;
    }

    inCheck() {
      return this.isAttacked(this.kings[this.turn], opp(this.turn));
    }

    // Pseudo-legal moves (may leave own king in check). capturesOnly skips quiet moves (used by the engine).
    _pseudo(capturesOnly) {
      const moves = [], b = this.board, us = this.turn, them = opp(us);
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || colorOf(p) !== us) continue;
        const t = p.toLowerCase(), r = s >> 3, f = s & 7;

        if (t === 'p') {
          const dir = us === 'w' ? -1 : 1, startRow = us === 'w' ? 6 : 1, lastRow = us === 'w' ? 0 : 7;
          const r1 = r + dir;
          if (r1 < 0 || r1 > 7) continue;
          const one = r1 * 8 + f;
          if (!b[one]) {
            if (r1 === lastRow) this._promos(moves, s, one, p, null);
            else if (!capturesOnly) {
              moves.push({ from: s, to: one, piece: p, captured: null, flag: 'n' });
              const two = one + dir * 8;
              if (r === startRow && !b[two]) moves.push({ from: s, to: two, piece: p, captured: null, flag: 'b' });
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            const ff = f + k;
            if (ff < 0 || ff > 7) continue;
            const to = r1 * 8 + ff, tp = b[to];
            if (tp && colorOf(tp) === them) {
              if (r1 === lastRow) this._promos(moves, s, to, p, tp);
              else moves.push({ from: s, to, piece: p, captured: tp, flag: 'c' });
            } else if (!tp && to === this.ep) {
              moves.push({ from: s, to, piece: p, captured: us === 'w' ? 'p' : 'P', flag: 'e' });
            }
          }
          continue;
        }

        if (t === 'n' || t === 'k') {
          const offs = t === 'n' ? KNIGHT : KING;
          for (let i = 0; i < 8; i++) {
            const rr = r + offs[i][0], ff = f + offs[i][1];
            if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
            const to = rr * 8 + ff, tp = b[to];
            if (!tp) { if (!capturesOnly) moves.push({ from: s, to, piece: p, captured: null, flag: 'n' }); }
            else if (colorOf(tp) === them) moves.push({ from: s, to, piece: p, captured: tp, flag: 'c' });
          }
          if (t === 'k' && !capturesOnly) this._castles(moves, s, p, us, them);
          continue;
        }

        const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : QUEEN;
        for (let i = 0; i < dirs.length; i++) {
          const dr = dirs[i][0], df = dirs[i][1];
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const to = rr * 8 + ff, tp = b[to];
            if (!tp) {
              if (!capturesOnly) moves.push({ from: s, to, piece: p, captured: null, flag: 'n' });
            } else {
              if (colorOf(tp) === them) moves.push({ from: s, to, piece: p, captured: tp, flag: 'c' });
              break;
            }
            rr += dr; ff += df;
          }
        }
      }
      return moves;
    }

    _promos(moves, from, to, piece, captured) {
      for (const pr of PROMOS) moves.push({ from, to, piece, captured: captured || null, promo: pr, flag: captured ? 'c' : 'n' });
    }

    _castles(moves, s, p, us, them) {
      const b = this.board, cr = this.castling;
      if (us === 'w') {
        if (s !== 60) return;
        if (cr.K && b[63] === 'R' && !b[61] && !b[62] &&
            !this.isAttacked(60, them) && !this.isAttacked(61, them) && !this.isAttacked(62, them)) {
          moves.push({ from: 60, to: 62, piece: p, captured: null, flag: 'k' });
        }
        if (cr.Q && b[56] === 'R' && !b[59] && !b[58] && !b[57] &&
            !this.isAttacked(60, them) && !this.isAttacked(59, them) && !this.isAttacked(58, them)) {
          moves.push({ from: 60, to: 58, piece: p, captured: null, flag: 'q' });
        }
      } else {
        if (s !== 4) return;
        if (cr.k && b[7] === 'r' && !b[5] && !b[6] &&
            !this.isAttacked(4, them) && !this.isAttacked(5, them) && !this.isAttacked(6, them)) {
          moves.push({ from: 4, to: 6, piece: p, captured: null, flag: 'k' });
        }
        if (cr.q && b[0] === 'r' && !b[3] && !b[2] && !b[1] &&
            !this.isAttacked(4, them) && !this.isAttacked(3, them) && !this.isAttacked(2, them)) {
          moves.push({ from: 4, to: 2, piece: p, captured: null, flag: 'q' });
        }
      }
    }

    _make(m) {
      const b = this.board, us = this.turn;
      this.history.push({ m, castling: { K: this.castling.K, Q: this.castling.Q, k: this.castling.k, q: this.castling.q }, ep: this.ep, halfmove: this.halfmove, fullmove: this.fullmove });
      b[m.from] = null;
      b[m.to] = m.promo ? (us === 'w' ? m.promo.toUpperCase() : m.promo) : m.piece;
      if (m.flag === 'e') b[us === 'w' ? m.to + 8 : m.to - 8] = null;
      else if (m.flag === 'k') { if (us === 'w') { b[63] = null; b[61] = 'R'; } else { b[7] = null; b[5] = 'r'; } }
      else if (m.flag === 'q') { if (us === 'w') { b[56] = null; b[59] = 'R'; } else { b[0] = null; b[3] = 'r'; } }

      const cr = this.castling;
      if (m.piece === 'K') { this.kings.w = m.to; cr.K = cr.Q = false; }
      else if (m.piece === 'k') { this.kings.b = m.to; cr.k = cr.q = false; }
      if (m.from === 63 || m.to === 63) cr.K = false;
      if (m.from === 56 || m.to === 56) cr.Q = false;
      if (m.from === 7 || m.to === 7) cr.k = false;
      if (m.from === 0 || m.to === 0) cr.q = false;

      this.ep = m.flag === 'b' ? (m.from + m.to) >> 1 : -1;
      this.halfmove = (m.piece === 'P' || m.piece === 'p' || m.captured) ? 0 : this.halfmove + 1;
      if (us === 'b') this.fullmove++;
      this.turn = opp(us);
    }

    _unmake() {
      const u = this.history.pop();
      if (!u) return null;
      const m = u.m, b = this.board;
      this.turn = opp(this.turn);
      const us = this.turn;
      b[m.from] = m.piece;
      if (m.flag === 'e') { b[m.to] = null; b[us === 'w' ? m.to + 8 : m.to - 8] = m.captured; }
      else b[m.to] = m.captured || null;
      if (m.flag === 'k') { if (us === 'w') { b[61] = null; b[63] = 'R'; } else { b[5] = null; b[7] = 'r'; } }
      else if (m.flag === 'q') { if (us === 'w') { b[59] = null; b[56] = 'R'; } else { b[3] = null; b[0] = 'r'; } }
      if (m.piece === 'K') this.kings.w = m.from;
      else if (m.piece === 'k') this.kings.b = m.from;
      this.castling = u.castling;
      this.ep = u.ep;
      this.halfmove = u.halfmove;
      this.fullmove = u.fullmove;
      return m;
    }

    // Fully legal moves. opts.square limits to one origin square (index).
    moves(opts) {
      const us = this.turn, them = opp(us), res = [];
      const only = opts && opts.square != null ? opts.square : -1;
      const pseudo = this._pseudo(false);
      for (let i = 0; i < pseudo.length; i++) {
        const m = pseudo[i];
        if (only >= 0 && m.from !== only) continue;
        this._make(m);
        if (!this.isAttacked(this.kings[us], them)) res.push(m);
        this._unmake();
      }
      return res;
    }

    _san(m, legal) {
      let s;
      if (m.flag === 'k') s = 'O-O';
      else if (m.flag === 'q') s = 'O-O-O';
      else {
        const t = m.piece.toLowerCase();
        if (t === 'p') {
          s = (m.captured ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
        } else {
          s = t.toUpperCase();
          const others = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          if (others.length) {
            const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
            const sameRank = others.some((o) => (o.from >> 3) === (m.from >> 3));
            if (!sameFile) s += FILES[m.from & 7];
            else if (!sameRank) s += 8 - (m.from >> 3);
            else s += sqName(m.from);
          }
          if (m.captured) s += 'x';
          s += sqName(m.to);
        }
      }
      return s;
    }

    // Play a move: {from, to, promo}. from/to may be indices or names like "e2". Returns move record or null if illegal.
    move(input) {
      if (!input) return null;
      let from = input.from, to = input.to;
      if (typeof from === 'string') from = sqIndex(from);
      if (typeof to === 'string') to = sqIndex(to);
      const promo = input.promo ? String(input.promo).toLowerCase() : null;
      const legal = this.moves();
      const m = legal.find((x) => x.from === from && x.to === to && (x.promo ? x.promo === (promo || 'q') : true));
      if (!m) return null;
      let san = this._san(m, legal);
      this._make(m);
      if (this.inCheck()) san += this.moves().length ? '+' : '#';
      this.sanList.push(san);
      this._addRep();
      return Object.assign({}, m, { san, color: colorOf(m.piece) });
    }

    undo() {
      if (!this.history.length) return null;
      const k = this.repKeys.pop();
      if (k && this.repetition[k]) this.repetition[k]--;
      this.sanList.pop();
      return this._unmake();
    }

    insufficientMaterial() {
      const minors = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p) continue;
        const t = p.toLowerCase();
        if (t === 'k') continue;
        if (t === 'p' || t === 'r' || t === 'q') return false;
        minors.push({ t, shade: ((i >> 3) + (i & 7)) % 2 });
      }
      if (minors.length <= 1) return true; // K v K, K+N v K, K+B v K
      if (minors.every((x) => x.t === 'b') && minors.every((x) => x.shade === minors[0].shade)) return true; // bishops all on one colour
      return false;
    }

    // Can this colour possibly deliver mate? (used when the other side runs out of time)
    hasMatingMaterial(color) {
      let minors = 0;
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p || colorOf(p) !== color) continue;
        const t = p.toLowerCase();
        if (t === 'p' || t === 'r' || t === 'q') return true;
        if (t === 'n' || t === 'b') minors++;
      }
      return minors >= 2;
    }

    status() {
      const legal = this.moves();
      if (!legal.length) {
        return this.inCheck()
          ? { over: true, winner: opp(this.turn), reason: 'checkmate' }
          : { over: true, winner: null, reason: 'stalemate' };
      }
      if (this.insufficientMaterial()) return { over: true, winner: null, reason: 'insufficient' };
      if ((this.repetition[this.key()] || 0) >= 3) return { over: true, winner: null, reason: 'repetition' };
      if (this.halfmove >= 100) return { over: true, winner: null, reason: 'fifty' };
      return { over: false };
    }
  }

  Chess.START_FEN = START_FEN;
  Chess.VALUES = VALUES;
  Chess.sqName = sqName;
  Chess.sqIndex = sqIndex;
  Chess.colorOf = colorOf;

  root.Chess = Chess;
  return Chess;
}
(function (g) {
  const C = GambitChessFactory(g);
  g.GambitChessFactory = GambitChessFactory;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
