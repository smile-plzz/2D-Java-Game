# Project Context: 2D Java Game Arcade - Multiplayer Extension

## 1. Overview
The project is a static browser-based arcade hosted in `web/`, featuring games ported from a 2D Java Game Framework. The target is to add peer-to-peer 2-player online multiplayer via room codes and shareable links, without disturbing the existing single-player experience.

## 2. Goals
- Add remote 2-player multiplayer with room codes to:
  1. Connect Four (turn-based, host-authoritative)
  2. Neon Pong (real-time, host-authoritative with client prediction and snapshot interpolation)
- Maintain 100% static hosting compatibility: no build step, no npm dependencies, no custom backend, zero-config Vercel deployment.
- Provide a responsive neon aesthetic matching the existing shell.
- Allow cross-device play over different networks via WebRTC Data Channels.

## 3. Technology Stack
- Frontend: HTML5 Canvas, Vanilla ES Modules, CSS variables with neon glow styling.
- Networking: WebRTC Peer-to-Peer Data Channels brokered by public PeerJS cloud (vendored standalone JS in `web/js/vendor/`).
- STUN/TURN: Google public STUN servers and extensible TURN configuration in `web/js/net/ice.js`.
- Testing: Plain Node.js unit tests for protocol and game logic; Playwright browser integration tests.

## 4. Key Constraints
- Purely additive: single-player modes, AI, and local high scores remain untouched.
- Online matches do not write to single-player high scores.
- No em-dashes in user-facing copy.
- No modifications to legacy Java backend files in `src/game/`, `nbproject/`, or build scripts (`make.*`, `build.xml`).
- Host tab must remain active/foreground for simulation authority in Pong.
