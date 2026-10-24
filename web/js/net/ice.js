/**
 * WebRTC ICE (STUN/TURN) Server Configuration.
 *
 * Direct peer-to-peer WebRTC connections succeed on most residential networks,
 * but mobile carriers and restrictive corporate firewalls (symmetric NAT / CGNAT)
 * may require a TURN relay to establish a connection.
 *
 * Free TURN credentials can be obtained from providers like:
 * - Open Relay Project (https://www.metered.ca/tools/openrelay/)
 * - Coturn (self-hosted)
 *
 * Custom TURN servers can be configured in two ways without committing secrets:
 * 1. window.ARCADE_TURN_CONFIG = [{ urls: 'turn:...', username: '...', credential: '...' }];
 * 2. Stored in localStorage via setCustomTurn(turnConfig).
 */

const DEFAULT_STUN_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
];

const STORAGE_KEY = "arcade_turn_ice";

/**
 * Retrieve custom TURN servers from window or localStorage if configured.
 * @returns {Array<RTCIceServer>}
 */
export function getCustomTurnServers() {
    if (typeof window !== "undefined" && Array.isArray(window.ARCADE_TURN_CONFIG)) {
        return window.ARCADE_TURN_CONFIG;
    }

    if (typeof window !== "undefined" && window.localStorage) {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
                if (parsed && typeof parsed === "object") return [parsed];
            }
        } catch (e) {
            // Ignore parse errors from stale localStorage values
        }
    }

    return [];
}

/**
 * Persist or clear custom TURN servers in localStorage.
 * @param {Array<RTCIceServer>|RTCIceServer|null} config
 */
export function setCustomTurn(config) {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (!config) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
    }
    const servers = Array.isArray(config) ? config : [config];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

/**
 * Returns the active ICE servers list combining STUN and any custom TURN relays.
 * @returns {Array<RTCIceServer>}
 */
export function getIceServers() {
    const customTurn = getCustomTurnServers();
    return [...DEFAULT_STUN_SERVERS, ...customTurn];
}

/**
 * Returns standard PeerJS configuration options.
 * @param {object} [overrides]
 * @returns {object}
 */
export function getPeerConfig(overrides = {}) {
    return {
        config: {
            iceServers: getIceServers(),
            sdpSemantics: "unified-plan"
        },
        debug: 0,
        ...overrides
    };
}
