# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **P2P Multiplayer Architecture**: WebRTC data channel networking powered by vendored PeerJS v1.5.4 with zero external dependencies and zero-config Vercel hosting.
- **Dedicated Multiplayer Arena**: Prominent homepage section (`#multiplayer`) highlighting all 2-player online titles with live status badges.
- **In-Game Live Peer Chat (`web/js/net/chat.js`)**: Real-time messaging during online matches with quick reaction chips (`👍`, `🔥`, `⚡`, `😮`, `GG!`, etc.), auto-fading floating bubbles, and custom typing drawer with keyboard isolation.
- **Online 2-Player Game Modes**:
  - Connect Four: Host-authoritative turn validation, opening turn selection, rematch flow, and win celebration effects.
  - Neon Pong: Host-authoritative physics simulation, ~60 Hz paddle input streaming with local client prediction, and ~30 Hz snapshot streaming with interpolation.
  - Neon Light Cycles: Real-time high-speed grid combat, cycle trail registration, collision detection, and online rematch support.
- **New 2D Library Games**:
  - Neon Light Cycles (`web/neon-cycles/`): Grid battle with Classic, Turbo, and Arena modes against smart lookahead AI or online 2-player friend.
  - Neon Asteroids (`web/neon-asteroids/`): Newtonian vector space arcade with inertia drag, rock fracturing, hyperspace jumps, Classic, 60s Blitz, and kinetic Shields modes.
- **Visual Juice & Transitions**:
  - Pop animations on modal panels with spring curves.
  - Interactive button active/hover scaling.
  - Glowing live-pulse indicator on multiplayer tags.
  - Card hover elevation and neon border glows.
- **Automated Test Coverage**:
  - Unit tests for network protocol, chat encoding, Connect Four moves, Pong netcode, Cycles game logic, and Asteroids rock splitting.
  - Automated two-context Playwright browser integration tests for full Connect Four and Neon Pong online matches.
