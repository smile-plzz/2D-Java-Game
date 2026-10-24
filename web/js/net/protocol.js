/**
 * Wire protocol for peer-to-peer multiplayer.
 * Every packet is an object: { v: 1, t: <type>, ...payload }
 */

export const PROTOCOL_VERSION = 1;

export const MessageType = {
    // Handshake and lifecycle
    HELLO: "HELLO",
    WELCOME: "WELCOME",
    ERROR: "ERROR",
    PING: "PING",
    PONG: "PONG",
    REMATCH_REQUEST: "REMATCH_REQUEST",
    REMATCH_ACCEPT: "REMATCH_ACCEPT",
    LEAVE: "LEAVE",

    // Connect Four
    C4_START: "C4_START",
    C4_MOVE: "C4_MOVE",
    C4_STATE: "C4_STATE",

    // Neon Pong
    PONG_START: "PONG_START",
    PONG_INPUT: "PONG_INPUT",
    PONG_SNAPSHOT: "PONG_SNAPSHOT",
    PONG_EVENT: "PONG_EVENT",
    PONG_PAUSE: "PONG_PAUSE"
};

export const ErrorCode = {
    ROOM_FULL: "ROOM_FULL",
    VERSION_MISMATCH: "VERSION_MISMATCH",
    INVALID_GAME: "INVALID_GAME",
    INVALID_MOVE: "INVALID_MOVE",
    NOT_YOUR_TURN: "NOT_YOUR_TURN",
    TIMEOUT: "TIMEOUT",
    DISCONNECTED: "DISCONNECTED"
};

/**
 * Creates an enveloped message payload.
 * @param {string} type One of MessageType values
 * @param {object} [payload={}]
 * @returns {object}
 */
export function createMessage(type, payload = {}) {
    if (!MessageType[type]) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return {
        v: PROTOCOL_VERSION,
        t: type,
        ...payload
    };
}

/**
 * Encodes a message to JSON string.
 * @param {string} type
 * @param {object} [payload={}]
 * @returns {string}
 */
export function encodeMessage(type, payload = {}) {
    const message = createMessage(type, payload);
    return JSON.stringify(message);
}

/**
 * Decodes and validates an incoming raw message (string or parsed object).
 * Returns { ok: true, message } or { ok: false, error, code }.
 * @param {string|object} raw
 * @returns {{ ok: boolean, message?: object, error?: string, code?: string }}
 */
export function decodeMessage(raw) {
    let obj = raw;
    if (typeof raw === "string") {
        try {
            obj = JSON.parse(raw);
        } catch (e) {
            return { ok: false, error: "Invalid JSON format", code: "PARSE_ERROR" };
        }
    }

    if (!obj || typeof obj !== "object") {
        return { ok: false, error: "Message must be an object", code: "INVALID_PAYLOAD" };
    }

    if (typeof obj.v !== "number") {
        return { ok: false, error: "Missing protocol version", code: "MISSING_VERSION" };
    }

    if (obj.v !== PROTOCOL_VERSION) {
        return {
            ok: false,
            error: `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${obj.v}. Please refresh the page.`,
            code: ErrorCode.VERSION_MISMATCH
        };
    }

    if (typeof obj.t !== "string" || !MessageType[obj.t]) {
        return { ok: false, error: `Unknown message type: ${obj.t}`, code: "UNKNOWN_TYPE" };
    }

    return { ok: true, message: obj };
}

// =============================================================================
// Connect Four Validation Helpers
// =============================================================================

export const C4_COLS = 7;
export const C4_ROWS = 6;
export const C4_HOST = 1;
export const C4_GUEST = 2;

/**
 * Validates a Connect Four move submitted to the host.
 * @param {number[][]} board 6 rows x 7 cols (0 = empty, 1 = host, 2 = guest)
 * @param {number} col Selected column (0-6)
 * @param {number} senderRole Role of the sender (1 = host, 2 = guest)
 * @param {number} currentTurn Role whose turn it is currently (1 or 2)
 * @param {string|null} winner null if match is active
 * @returns {{ valid: boolean, row?: number, reason?: string }}
 */
export function validateC4Move(board, col, senderRole, currentTurn, winner) {
    if (winner !== null) {
        return { valid: false, reason: "Game is already over" };
    }

    if (senderRole !== currentTurn) {
        return { valid: false, reason: "Not your turn" };
    }

    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col >= C4_COLS) {
        return { valid: false, reason: `Invalid column index: ${col}` };
    }

    if (!Array.isArray(board) || board.length !== C4_ROWS) {
        return { valid: false, reason: "Invalid board state" };
    }

    // Find the next open row in this column
    for (let r = 0; r < C4_ROWS; r++) {
        if (!Array.isArray(board[r]) || board[r].length !== C4_COLS) {
            return { valid: false, reason: "Invalid row format in board" };
        }
        if (board[r][col] === 0) {
            return { valid: true, row: r };
        }
    }

    return { valid: false, reason: `Column ${col} is already full` };
}

/**
 * Checks if a given player has 4-in-a-row on the board.
 * Returns true if piece has won.
 */
export function checkC4Win(board, piece) {
    for (let row = 0; row < C4_ROWS; row++) {
        for (let col = 0; col < C4_COLS; col++) {
            // Horizontal
            if (col + 3 < C4_COLS
                && board[row][col] === piece && board[row][col + 1] === piece
                && board[row][col + 2] === piece && board[row][col + 3] === piece) return true;
            // Vertical
            if (row + 3 < C4_ROWS
                && board[row][col] === piece && board[row + 1][col] === piece
                && board[row + 2][col] === piece && board[row + 3][col] === piece) return true;
            // Diagonal up-right
            if (col + 3 < C4_COLS && row + 3 < C4_ROWS
                && board[row][col] === piece && board[row + 1][col + 1] === piece
                && board[row + 2][col + 2] === piece && board[row + 3][col + 3] === piece) return true;
            // Diagonal down-right
            if (col + 3 < C4_COLS && row - 3 >= 0
                && board[row][col] === piece && board[row - 1][col + 1] === piece
                && board[row - 2][col + 2] === piece && board[row - 3][col + 3] === piece) return true;
        }
    }
    return false;
}

/**
 * Checks if all columns are filled.
 */
export function isC4BoardFull(board) {
    for (let col = 0; col < C4_COLS; col++) {
        if (board[C4_ROWS - 1][col] === 0) return false;
    }
    return true;
}
