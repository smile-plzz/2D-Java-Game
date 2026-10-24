import { Peer } from "../vendor/peer.js";
import { getPeerConfig } from "./ice.js";
import {
    MessageType,
    ErrorCode,
    encodeMessage,
    decodeMessage,
    createMessage
} from "./protocol.js";

export const SessionState = {
    IDLE: "idle",
    CREATING: "creating",
    WAITING: "waiting",
    JOINING: "joining",
    CONNECTED: "connected",
    PLAYING: "playing",
    ENDED: "ended",
    DISCONNECTED: "disconnected"
};

export const Role = {
    HOST: "host",
    GUEST: "guest"
};

// Unambiguous alphabet: excludes 0, O, 1, I, L
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const PEER_PREFIX = "arcade";
const CONNECT_TIMEOUT_MS = 15000;
const PING_INTERVAL_MS = 2000;

/**
 * Generates an unambiguous random 6-character room code.
 * @returns {string}
 */
export function generateRoomCode() {
    let result = "";
    const len = CODE_ALPHABET.length;
    for (let i = 0; i < CODE_LENGTH; i++) {
        const rand = Math.floor(Math.random() * len);
        result += CODE_ALPHABET[rand];
    }
    return result;
}

/**
 * Formats a PeerJS peer ID from game name and room code.
 */
export function formatPeerId(gameName, code) {
    const cleanGame = (gameName || "game").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanCode = (code || "").toUpperCase().trim();
    return `${PEER_PREFIX}-${cleanGame}-${cleanCode}`;
}

/**
 * Cleans user-entered room code.
 */
export function sanitizeRoomCode(raw) {
    if (!raw) return "";
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

/**
 * Manages the WebRTC peer session for 2-player multiplayer.
 */
export class MultiplayerSession {
    /**
     * @param {string} gameName Identifier for the game (e.g. 'c4', 'pong')
     */
    constructor(gameName) {
        this.gameName = gameName;
        this.role = null;
        this.state = SessionState.IDLE;
        this.roomCode = null;
        this.peer = null;
        this.reliableConn = null;
        this.unreliableConn = null;
        this.guestConn = null;

        this.pingMs = 0;
        this.pingTimer = null;
        this.connectTimeoutTimer = null;

        this.stateListeners = new Set();
        this.messageListeners = new Set();
        this.errorListeners = new Set();
    }

    //<editor-fold desc="Events and State">
    onStateChange(callback) {
        this.stateListeners.add(callback);
        callback(this.state, this.getSnapshot());
        return () => this.stateListeners.delete(callback);
    }

    onMessage(callback) {
        this.messageListeners.add(callback);
        return () => this.messageListeners.delete(callback);
    }

    onError(callback) {
        this.errorListeners.add(callback);
        return () => this.errorListeners.delete(callback);
    }

    emitState() {
        const snapshot = this.getSnapshot();
        for (const cb of this.stateListeners) {
            cb(this.state, snapshot);
        }
    }

    emitMessage(msg) {
        for (const cb of this.messageListeners) {
            cb(msg);
        }
    }

    emitError(error, code = "SESSION_ERROR") {
        for (const cb of this.errorListeners) {
            cb({ error, code });
        }
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.emitState();
    }

    getSnapshot() {
        return {
            state: this.state,
            role: this.role,
            roomCode: this.roomCode,
            pingMs: this.pingMs,
            isHost: this.role === Role.HOST,
            isGuest: this.role === Role.GUEST,
            connected: this.state === SessionState.CONNECTED || this.state === SessionState.PLAYING
        };
    }
    //</editor-fold>

    //<editor-fold desc="Host Room Creation">
    /**
     * Creates a new host room.
     * @param {string} [presetCode]
     * @returns {Promise<string>} Resolves with the room code.
     */
    async createRoom(presetCode = null) {
        this.leave();
        this.role = Role.HOST;
        this.setState(SessionState.CREATING);

        const tryCode = async (retriesLeft = 3) => {
            const code = presetCode || generateRoomCode();
            const peerId = formatPeerId(this.gameName, code);

            return new Promise((resolve, reject) => {
                let resolved = false;

                try {
                    this.peer = new Peer(peerId, getPeerConfig());
                } catch (err) {
                    return reject(err);
                }

                this.peer.on("open", (id) => {
                    if (resolved) return;
                    resolved = true;
                    this.roomCode = code;
                    this.setState(SessionState.WAITING);
                    resolve(code);
                });

                this.peer.on("error", async (err) => {
                    if (err.type === "unavailable-id" && retriesLeft > 0 && !presetCode) {
                        try {
                            if (this.peer) this.peer.destroy();
                        } catch (e) {}
                        try {
                            const nextCode = await tryCode(retriesLeft - 1);
                            resolve(nextCode);
                        } catch (retryErr) {
                            reject(retryErr);
                        }
                        return;
                    }

                    if (!resolved) {
                        resolved = true;
                        this.setState(SessionState.DISCONNECTED);
                        reject(err);
                    }
                    this.emitError(err.message || "Peer broker error", err.type);
                });

                this.peer.on("connection", (conn) => {
                    this.handleIncomingConnection(conn);
                });
            });
        };

        return tryCode();
    }

    handleIncomingConnection(conn) {
        // Enforce max 1 guest in the room
        if (conn.label === "unreliable") {
            if (this.unreliableConn) {
                conn.close();
                return;
            }
            this.unreliableConn = conn;
            this.bindDataChannel(conn, false);
            return;
        }

        if (this.reliableConn && this.reliableConn.open) {
            // Room is already occupied: reject third connection
            conn.on("open", () => {
                conn.send(encodeMessage(MessageType.ERROR, {
                    code: ErrorCode.ROOM_FULL,
                    message: "Room is already full"
                }));
                setTimeout(() => conn.close(), 100);
            });
            return;
        }

        this.reliableConn = conn;
        this.bindDataChannel(conn, true);

        conn.on("open", () => {
            // Send WELCOME to guest
            this.send(MessageType.WELCOME, {
                role: Role.GUEST,
                game: this.gameName,
                code: this.roomCode
            });
            this.setState(SessionState.CONNECTED);
            this.startPing();
        });
    }
    //</editor-fold>

    //<editor-fold desc="Guest Room Joining">
    /**
     * Joins an existing room as a guest.
     * @param {string} rawCode
     * @returns {Promise<void>}
     */
    async joinRoom(rawCode) {
        this.leave();
        const code = sanitizeRoomCode(rawCode);
        if (!code || code.length !== CODE_LENGTH) {
            throw new Error(`Room code must be ${CODE_LENGTH} characters`);
        }

        this.role = Role.GUEST;
        this.roomCode = code;
        this.setState(SessionState.JOINING);

        const targetPeerId = formatPeerId(this.gameName, code);

        return new Promise((resolve, reject) => {
            let settled = false;

            this.connectTimeoutTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.leave();
                const timeoutErr = new Error("Connection timed out. Check the room code or network.");
                this.emitError(timeoutErr.message, ErrorCode.TIMEOUT);
                reject(timeoutErr);
            }, CONNECT_TIMEOUT_MS);

            try {
                this.peer = new Peer(getPeerConfig());
            } catch (err) {
                clearTimeout(this.connectTimeoutTimer);
                settled = true;
                return reject(err);
            }

            this.peer.on("open", () => {
                // Connect to host on primary reliable data channel
                const conn = this.peer.connect(targetPeerId, {
                    reliable: true,
                    serialization: "none"
                });
                this.reliableConn = conn;
                this.bindDataChannel(conn, true);

                conn.on("open", () => {
                    // Send HELLO
                    this.send(MessageType.HELLO, {
                        game: this.gameName,
                        code
                    });

                    // Also attempt to establish secondary unreliable channel for real-time games
                    try {
                        const unreli = this.peer.connect(targetPeerId, {
                            label: "unreliable",
                            reliable: false,
                            serialization: "none"
                        });
                        this.unreliableConn = unreli;
                        this.bindDataChannel(unreli, false);
                    } catch (e) {
                        // Unreliable fallback is harmless
                    }

                    clearTimeout(this.connectTimeoutTimer);
                    settled = true;
                    this.setState(SessionState.CONNECTED);
                    this.startPing();
                    resolve();
                });
            });

            this.peer.on("error", (err) => {
                clearTimeout(this.connectTimeoutTimer);
                if (!settled) {
                    settled = true;
                    this.setState(SessionState.DISCONNECTED);
                    let userMsg = "Failed to connect to room";
                    if (err.type === "peer-unavailable") {
                        userMsg = "Room not found. Check the code and make sure the host is waiting.";
                    }
                    this.emitError(userMsg, err.type || ErrorCode.DISCONNECTED);
                    reject(new Error(userMsg));
                }
            });
        });
    }
    //</editor-fold>

    //<editor-fold desc="Data Channel Binding">
    bindDataChannel(conn, isReliable) {
        conn.on("data", (data) => {
            const decoded = decodeMessage(data);
            if (!decoded.ok) {
                if (decoded.code === ErrorCode.VERSION_MISMATCH) {
                    this.emitError(decoded.error, decoded.code);
                    this.leave();
                }
                return;
            }

            const msg = decoded.message;

            // Handle system ping / pong
            if (msg.t === MessageType.PING) {
                this.send(MessageType.PONG, { ts: msg.ts });
                return;
            }

            if (msg.t === MessageType.PONG) {
                if (typeof msg.ts === "number") {
                    this.pingMs = Math.max(0, Math.round(performance.now() - msg.ts));
                    this.emitState();
                }
                return;
            }

            // Handle errors
            if (msg.t === MessageType.ERROR) {
                this.emitError(msg.message || "Remote peer error", msg.code);
                if (msg.code === ErrorCode.ROOM_FULL || msg.code === ErrorCode.VERSION_MISMATCH) {
                    this.leave();
                }
                return;
            }

            // Handle leave
            if (msg.t === MessageType.LEAVE) {
                this.handleRemoteDisconnect("Opponent left the match");
                return;
            }

            // Dispatch other messages to listeners
            this.emitMessage(msg);
        });

        conn.on("close", () => {
            if (isReliable) {
                this.handleRemoteDisconnect("Connection closed");
            }
        });

        conn.on("error", (err) => {
            if (isReliable) {
                this.handleRemoteDisconnect(err.message || "Connection error");
            }
        });
    }

    handleRemoteDisconnect(reason) {
        if (this.state === SessionState.CONNECTED || this.state === SessionState.PLAYING) {
            this.setState(SessionState.DISCONNECTED);
            this.emitError(reason || "Opponent disconnected", ErrorCode.DISCONNECTED);
        }
    }
    //</editor-fold>

    //<editor-fold desc="Messaging">
    /**
     * Sends a message over the reliable data channel.
     * @param {string} type One of MessageType
     * @param {object} [payload={}]
     */
    send(type, payload = {}) {
        if (!this.reliableConn || !this.reliableConn.open) {
            return false;
        }
        try {
            const raw = encodeMessage(type, payload);
            this.reliableConn.send(raw);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Sends high-frequency data over the unreliable channel (falling back to reliable).
     * @param {string} type One of MessageType
     * @param {object} [payload={}]
     */
    sendUnreliable(type, payload = {}) {
        const conn = (this.unreliableConn && this.unreliableConn.open)
            ? this.unreliableConn
            : this.reliableConn;

        if (!conn || !conn.open) return false;

        try {
            const raw = encodeMessage(type, payload);
            conn.send(raw);
            return true;
        } catch (e) {
            return false;
        }
    }

    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.reliableConn && this.reliableConn.open) {
                this.send(MessageType.PING, { ts: performance.now() });
            }
        }, PING_INTERVAL_MS);
    }

    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
    //</editor-fold>

    //<editor-fold desc="Teardown">
    leave() {
        this.stopPing();
        if (this.connectTimeoutTimer) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
        }

        if (this.reliableConn && this.reliableConn.open) {
            try {
                this.send(MessageType.LEAVE);
            } catch (e) {}
        }

        try {
            if (this.reliableConn) this.reliableConn.close();
        } catch (e) {}
        try {
            if (this.unreliableConn) this.unreliableConn.close();
        } catch (e) {}
        try {
            if (this.peer) this.peer.destroy();
        } catch (e) {}

        this.reliableConn = null;
        this.unreliableConn = null;
        this.peer = null;
        this.roomCode = null;
        this.role = null;
        this.pingMs = 0;
        this.setState(SessionState.IDLE);
    }
    //</editor-fold>
}
