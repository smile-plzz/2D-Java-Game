# Development Log

## 2026-10-24 17:38 - Task Initialization
- Created working branch `multiplayer`.
- Audited project repository and verified constraints: pure static arcade in `web/`, zero-config Vercel deployment, no changes to Java framework core.
- Initialized documentation files: `context.md`, `CHANGELOG.md`, `dev-log.md`.
- Milestone 1 plan: Build networking layer (`web/js/vendor/`, `web/js/net/ice.js`, `web/js/net/protocol.js`, `web/js/net/session.js`, `web/js/net/lobby.js`).

## 2026-10-24 17:42 - Milestone 1: Networking Layer Complete
- Vendored PeerJS v1.5.4 in `web/js/vendor/peerjs.min.js` and created universal ES module wrapper `web/js/vendor/peer.js`.
- Implemented `web/js/net/ice.js` with Google STUN servers and extensible custom TURN server loading.
- Implemented `web/js/net/protocol.js` with versioned envelopes, C4 move validation, win/full detection, and error definitions.
- Implemented `web/js/net/session.js` state machine (`MultiplayerSession`), unambiguous 6-char room code generation, 1-guest room enforcement, ping/pong RTT latency tracking, and reliable/unreliable channel support.
- Implemented `web/js/net/lobby.js` (`LobbyUI`) with neon styling, room creation/join panels, clipboard sharing, and HUD indicator.
- Created and verified automated unit tests in `tests/unit/protocol.test.js`. All 18 tests passed.

## 2026-10-24 17:45 - Milestone 2: Connect Four Multiplayer Complete
- Wired `MultiplayerSession` and `LobbyUI` into `web/connect-four/index.html` and `web/js/games/connect-four-main.js`.
- Updated `ConnectFourGame` with host-authoritative online match flow:
  - Host randomly decides opening turn and sends `C4_START`.
  - Guest and host moves validated authoritatively by the host before being applied.
  - Host broadcasts `C4_STATE` containing board, last move, turn, and winner.
  - Guest renders host-authoritative board, plays particles, and triggers sounds.
  - Single-player AI is disabled during online matches.
  - In-game HUD reflects turn status ("YOUR TURN" / "OPPONENT'S TURN") and roles ("YOU: GREEN" / "YOU: RED").
  - Rematch flow requests/resets without modifying local single-player high scores.
- Created and passed test suite `tests/unit/connectfour_net.test.js`.
