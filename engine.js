/*
 * Gambit - search engine used for hints and the computer opponent.
 * Negamax alpha-beta, iterative deepening, quiescence search, check extensions,
 * MVV-LVA + killer + history move ordering, piece-square-table evaluation.
 * Runs inside a Web Worker when possible so the board never freezes.
 */
function GambitEngineFactory(root) {
  'use strict';
  const Chess = root.Chess;
  const MATE = 100000;
  const INF = 1e9;
  const PV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  // Piece-square tables, white's point of view, index 0 = a8 (same as board index)
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
  };

  function evaluate(c) {
    const b = c.board;
    let score = 0, nonPawn = 0, wb = 0, bb = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (t !== 'p' && t !== 'k') nonPawn += PV[t];
    }
    const endgame = nonPawn <= 2600;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const white = p === p.toUpperCase();
      const t = p.toLowerCase();
      const idx = white ? i : i ^ 56;
      const table = t === 'k' && endgame ? PST.ke : PST[t];
      const v = PV[t] + table[idx];
      if (white) { score += v; if (t === 'b') wb++; } else { score -= v; if (t === 'b') bb++; }
    }
    if (wb >= 2) score += 30;
    if (bb >= 2) score -= 30;
    // In won endgames, push the losing king to the edge and bring ours closer
    if (endgame && Math.abs(score) > 300) {
      const wk = c.kings.w, bk = c.kings.b;
      const loser = score > 0 ? bk : wk;
      const lr = loser >> 3, lf = loser & 7;
      const centerDist = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const kd = Math.abs((wk >> 3) - (bk >> 3)) + Math.abs((wk & 7) - (bk & 7));
      const bonus = centerDist * 10 + (14 - kd) * 4;
      score += score > 0 ? bonus : -bonus;
    }
    return c.turn === 'w' ? score : -score;
  }

  function search(c, opts) {
    const maxDepth = opts.depth || 64;
    const deadline = Date.now() + (opts.timeMs || 1000);
    const noise = opts.noise || 0;
    const killers = [];
    const hist = {};
    let nodes = 0, stop = false;
    let rootBest = null, rootScore = 0, completedDepth = 0;
    let prevBest = null;

    function mvvlva(m) { return m.captured ? 10 * PV[m.captured.toLowerCase()] - PV[m.piece.toLowerCase()] / 10 + 10000 : 0; }

    function order(moves, ply, pvm) {
      const k = killers[ply];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        let s = mvvlva(m);
        if (m.promo) s += 9000 + PV[m.promo];
        if (pvm && m.from === pvm.from && m.to === pvm.to && m.promo === pvm.promo) s += 1e6;
        else if (!m.captured && k) {
          if (k[0] && k[0].from === m.from && k[0].to === m.to) s += 8000;
          else if (k[1] && k[1].from === m.from && k[1].to === m.to) s += 7000;
        }
        if (!m.captured) s += hist[m.piece + m.to] || 0;
        m._s = s;
      }
      moves.sort((a, b) => b._s - a._s);
    }

    function timeUp() {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      return stop;
    }

    function quiesce(alpha, beta, ply) {
      if (timeUp()) return 0;
      const stand = evaluate(c);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 40) return alpha;
      const us = c.turn, them = us === 'w' ? 'b' : 'w';
      const moves = c._pseudo(true);
      order(moves, ply, null);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        c._make(m);
        if (c.isAttacked(c.kings[us], them)) { c._unmake(); continue; }
        const s = -quiesce(-beta, -alpha, ply + 1);
        c._unmake();
        if (stop) return 0;
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if (timeUp()) return 0;
      if (ply > 0) {
        if (c.halfmove >= 100) return 0;
        if (ply <= 2 && (c.repetition[c.key()] || 0) >= 1) return 0; // treat repeats as draws
      }
      const us = c.turn, them = us === 'w' ? 'b' : 'w';
      const inChk = c.isAttacked(c.kings[us], them);
      if (inChk && ply < 24) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);

      const moves = c._pseudo(false);
      order(moves, ply, ply === 0 ? prevBest : null);
      let legal = 0, best = -INF;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        c._make(m);
        if (c.isAttacked(c.kings[us], them)) { c._unmake(); continue; }
        legal++;
        // With noise (weaker levels) every root move gets an exact score so the randomness stays honest
        let s = ply === 0 && noise ? -negamax(depth - 1, -INF, INF, 1) : -negamax(depth - 1, -beta, -alpha, ply + 1);
        c._unmake();
        if (stop) return 0;
        if (ply === 0 && noise) s += Math.round((Math.random() * 2 - 1) * noise);
        if (s > best) {
          best = s;
          if (ply === 0) { iterBest = m; iterScore = s; }
        }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          if (!m.captured) {
            const k = killers[ply] || (killers[ply] = [null, null]);
            if (!k[0] || k[0].from !== m.from || k[0].to !== m.to) { k[1] = k[0]; k[0] = m; }
            hist[m.piece + m.to] = (hist[m.piece + m.to] || 0) + depth * depth;
          }
          break;
        }
      }
      if (!legal) return inChk ? -MATE + ply : 0;
      return best;
    }

    let iterBest = null, iterScore = 0;
    for (let d = 1; d <= maxDepth; d++) {
      iterBest = null;
      negamax(d, -INF, INF, 0);
      if (stop && completedDepth > 0) break;
      if (iterBest) { rootBest = iterBest; rootScore = iterScore; prevBest = iterBest; completedDepth = d; }
      if (stop) break;
      if (Math.abs(rootScore) > MATE - 500) break; // forced mate found
      if (Date.now() > deadline) break;
    }
    if (!rootBest) {
      const legal = c.moves();
      rootBest = legal[0] || null;
    }
    return {
      move: rootBest ? { from: rootBest.from, to: rootBest.to, promo: rootBest.promo || null } : null,
      score: rootScore,
      depth: completedDepth,
      nodes,
      mate: Math.abs(rootScore) > MATE - 500 ? Math.sign(rootScore) * Math.ceil((MATE - Math.abs(rootScore)) / 2) : 0
    };
  }

  function run(data) {
    const c = new Chess(data.startFen);
    for (const u of data.moves || []) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promo: u[4] });
    const r = search(c, data);
    r.turn = c.turn;
    return r;
  }

  root.GambitEngine = { search, evaluate, run, MATE };
  return root.GambitEngine;
}
(function (g) {
  const E = GambitEngineFactory(g);
  g.GambitEngineFactory = GambitEngineFactory;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
