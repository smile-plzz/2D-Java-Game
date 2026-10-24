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

## 2026-10-24 17:55 - Milestone 3: Neon Pong Real-Time Multiplayer Complete
- Wired `MultiplayerSession` and `LobbyUI` into `web/neon-pong/index.html` and `web/js/games/pong-main.js`.
- Implemented host-authoritative real-time netcode:
  - Host runs authoritative simulation (ball physics, wall/paddle collision, score tracking) at full tick rate.
  - Guest paddle moves locally with client prediction and broadcasts normalized position (~60 Hz) to host.
  - Host streams state snapshots (~30 Hz) over unordered/unreliable data channel (`reliable: false`).
  - Guest implements snapshot history buffer and interpolates host paddle and balls (~90ms render delay) for jitter-free 60fps visuals.
  - Normalized coordinates ensure resolution and aspect-ratio independence across mobile and desktop displays.
  - Pause disabled during live online matches to guarantee synchronization.
- Created and verified unit test suite `tests/unit/pong_net.test.js`.
