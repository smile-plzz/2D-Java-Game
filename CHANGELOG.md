# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- P2P multiplayer architecture using WebRTC and vendored PeerJS.
- Network subsystem (`web/js/net/`): session state machine, binary/JSON message protocol, STUN/TURN ICE configuration, and neon lobby UI.
- Online 2-player mode for Connect Four (host authoritative, turn-based move validation, rematch handling).
- Online 2-player mode for Neon Pong (host authoritative simulation, snapshot interpolation, local paddle prediction).
- Automated tests for network protocol validation and Connect Four game rules.
- Documentation for hosting, joining, and TURN configuration.
