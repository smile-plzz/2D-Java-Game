# Project Context: 2D Java Game Arcade - Multiplayer & Games Expansion

## 1. Overview
The project is a static browser-based arcade hosted in `web/`, featuring games ported from a 2D Java Game Framework. The target is to provide peer-to-peer 2-player online multiplayer via room codes and shareable links, add exciting new 2D library games, introduce a dedicated Multiplayer Arena section, implement real-time in-game peer chat, and heighten animations and action across the arcade.

## 2. Goals
- Multi-game P2P WebRTC networking layer (`web/js/net/`):
  1. Connect Four (turn-based, host-authoritative)
  2. Neon Pong (real-time, host-authoritative with client prediction and snapshot interpolation)
  3. Neon Light Cycles (real-time grid combat, host-authoritative with client steering and trail collision)
- Dedicated Multiplayer Arena section on the homepage with live badges and quick play links.
- In-game live peer chat (`web/js/net/chat.js`): floating auto-fade message bubbles, quick reaction chips, custom typing drawer.
- New 2D Library Games:
  1. Neon Light Cycles (`web/neon-cycles/`): Grid combat, Classic, Turbo, Arena modes, solo AI and online multiplayer.
  2. Neon Asteroids (`web/neon-asteroids/`): Newtonian vector space physics, inertia drag, rock splitting, hyperspace warp, Classic, Blitz, and Shields modes.
- Visual juice: smoother panel pop animations, live pulse badges, button spring feel, card hover lift, and celebratory particle bursts.
- Maintain 100% static hosting compatibility: no build step, no npm runtime dependencies, zero-config Vercel deployment.

## 3. Technology Stack
- Frontend: HTML5 Canvas, Vanilla ES Modules, CSS variables with neon glow styling.
- Networking: WebRTC Peer-to-Peer Data Channels brokered by public PeerJS cloud (vendored standalone JS in `web/js/vendor/`).
- STUN/TURN: Google public STUN servers and extensible TURN configuration in `web/js/net/ice.js`.
- Testing: Plain Node.js unit tests for protocol, chat, and game logic; Playwright browser integration tests.

## 4. Key Constraints
- Purely additive: single-player modes, AI, and local high scores remain untouched.
- Online matches do not write to single-player high scores.
- Zero em-dashes in user-facing copy.
- No modifications to legacy Java backend files in `src/game/`, `nbproject/`, or build scripts (`make.*`, `build.xml`).
- Host tab must remain active/foreground for simulation authority in real-time games.
