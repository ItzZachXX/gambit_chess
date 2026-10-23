# Gambit Chess

A browser chess game that runs entirely on GitHub Pages, with no server or build step.

## Features

- **Full rules enforced:** legal moves only (you can never leave your king in check), castling with all its conditions, en passant, promotion to any piece, check, checkmate, stalemate, threefold repetition, the 50-move rule, insufficient material, and flag-fall against a lone king.
- **Shows where you can play:** tap or drag a piece. Dots mark empty squares it can reach and rings mark pieces it can capture.
- **Coach hints:** shows the best move with an arrow and says why it is good (captures, check, develops a piece, castles, escapes an attack), plus who is ahead.
- **Point values:** Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9. Each player card shows the points you have captured and your material lead. The Points tab has the full breakdown.
- **Pass & Play:** two players on one device, fully offline, with an optional setting that rotates the board each turn.
- **Play Online:** create a room and send the link or 6-character code. Moves, clocks, chat, draw offers, takebacks, resign and rematch all sync peer-to-peer.
- **vs Computer:** four levels (Beginner, Casual, Strong, Master). The engine runs in a background thread on your device.
- **Extras:** chess clocks with increment, move list with review mode (arrow keys work), PGN download, evaluation bar, six board themes, light/dark mode, sounds, a resume prompt for unfinished offline games, and installable as an app that works offline.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `chess`.
2. Upload all the files to the root of the repository. There are no folders, so you can select every file and drag them into GitHub's upload page at once.
3. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, choose `main` and `/ (root)`, then click Save.
4. After a minute, your site is live at `https://<your-username>.github.io/<repo-name>/`.

You can also double-click `index.html` to play locally. Pass & Play and vs Computer work straight from the file. Online play needs the site to be hosted (GitHub Pages works).

## How online play works

Online games connect the two browsers directly over WebRTC, using [PeerJS](https://peerjs.com/) and its free public signalling server to make the first connection. Nothing is stored on a server.

- The host clicks **Create room**, picks a color, time control and whether hints are allowed, then shares the link.
- The friend opens the link (or enters the code under **Join room**).
- If the guest's connection drops, it reconnects automatically while the host keeps the page open.

On some strict networks (certain school or corporate firewalls), direct peer-to-peer connections are blocked. If a room never connects, try another network or a phone hotspot.

## Files

```
index.html            page layout
style.css             all styling (themes, layout, responsive rules)
chess.js              rules engine: move generation, special moves, draws, SAN, FEN
engine.js             search engine for hints and the computer opponent
pieces.js             original SVG chess pieces and icons
app.js                interface, game flow, clocks, points, hints, online play
sw.js                 offline cache (service worker)
manifest.webmanifest  install-as-app metadata
icon.svg              site icon
.nojekyll             tells GitHub Pages to serve files as-is
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Left / Right | Step back or forward through moves |
| Up / Down | Jump to the start or to the live position |
| F | Flip the board |
| H | Show or hide a hint |
| Esc | Deselect a piece or close a dialog |

The rules engine was checked against the standard perft test positions, which count every legal move sequence to a set depth and confirm the move generator matches known totals.
