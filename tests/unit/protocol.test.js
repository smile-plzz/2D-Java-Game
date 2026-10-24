import assert from "node:assert/strict";
import {
    PROTOCOL_VERSION,
    MessageType,
    ErrorCode,
    createMessage,
    encodeMessage,
    decodeMessage,
    validateC4Move,
    checkC4Win,
    isC4BoardFull,
    C4_COLS,
    C4_ROWS,
    C4_HOST,
    C4_GUEST
} from "../../web/js/net/protocol.js";

import {
    generateRoomCode,
    formatPeerId,
    sanitizeRoomCode
} from "../../web/js/net/session.js";

import {
    getIceServers,
    getPeerConfig
} from "../../web/js/net/ice.js";

console.log("Starting unit tests for multiplayer protocol and net logic...\n");

// -----------------------------------------------------------------------------
// Protocol & Envelope Tests
// -----------------------------------------------------------------------------
{
    const msg = createMessage(MessageType.HELLO, { game: "c4", code: "ABC234" });
    assert.equal(msg.v, PROTOCOL_VERSION);
    assert.equal(msg.t, "HELLO");
    assert.equal(msg.game, "c4");
    assert.equal(msg.code, "ABC234");
    console.log("PASS: createMessage constructs valid envelope");

    const encoded = encodeMessage(MessageType.WELCOME, { role: "guest" });
    assert.equal(typeof encoded, "string");
    const decoded = decodeMessage(encoded);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.message.t, "WELCOME");
    assert.equal(decoded.message.role, "guest");
    console.log("PASS: encodeMessage and decodeMessage round-trip");

    // Version mismatch
    const badVersion = JSON.stringify({ v: 99, t: "HELLO" });
    const mismatchRes = decodeMessage(badVersion);
    assert.equal(mismatchRes.ok, false);
    assert.equal(mismatchRes.code, ErrorCode.VERSION_MISMATCH);
    console.log("PASS: decodeMessage catches protocol version mismatch");

    // Malformed JSON
    const malformed = decodeMessage("{ bad json");
    assert.equal(malformed.ok, false);
    assert.equal(malformed.code, "PARSE_ERROR");
    console.log("PASS: decodeMessage handles malformed JSON");

    // Unknown type
    const unknownType = decodeMessage(JSON.stringify({ v: PROTOCOL_VERSION, t: "UNKNOWN_FOO" }));
    assert.equal(unknownType.ok, false);
    assert.equal(unknownType.code, "UNKNOWN_TYPE");
    console.log("PASS: decodeMessage rejects unknown message type");
}

// -----------------------------------------------------------------------------
// Room Code Generation & Sanitization Tests
// -----------------------------------------------------------------------------
{
    const code = generateRoomCode();
    assert.equal(typeof code, "string");
    assert.equal(code.length, 6);
    // Ensure unambiguous characters only (no 0, O, 1, I, L)
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    console.log("PASS: generateRoomCode generates 6-char unambiguous code:", code);

    // Peer ID formatting
    assert.equal(formatPeerId("c4", "ABC234"), "arcade-c4-ABC234");
    assert.equal(formatPeerId("PONG", "xyz890"), "arcade-pong-XYZ890");
    console.log("PASS: formatPeerId formats predictable namespaced IDs");

    // Sanitization
    assert.equal(sanitizeRoomCode("  ab-c 23 4! "), "ABC234");
    assert.equal(sanitizeRoomCode("toolongcodehere"), "TOOLON");
    console.log("PASS: sanitizeRoomCode trims, uppercases, and extracts 6 chars");
}

// -----------------------------------------------------------------------------
// ICE Servers Config Tests
// -----------------------------------------------------------------------------
{
    const iceServers = getIceServers();
    assert.ok(Array.isArray(iceServers));
    assert.ok(iceServers.length >= 1);
    assert.ok(iceServers[0].urls.includes("stun:"));

    const peerConfig = getPeerConfig();
    assert.ok(peerConfig.config.iceServers.length >= 1);
    console.log("PASS: getIceServers provides Google STUN fallback");
}

// -----------------------------------------------------------------------------
// Connect Four Validation Tests (Host Authority)
// -----------------------------------------------------------------------------
{
    const emptyBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));

    // Valid move for host on turn 1
    const move1 = validateC4Move(emptyBoard, 3, C4_HOST, C4_HOST, null);
    assert.equal(move1.valid, true);
    assert.equal(move1.row, 0);
    console.log("PASS: validateC4Move accepts legal move at bottom row");

    // Invalid: not sender's turn
    const wrongTurn = validateC4Move(emptyBoard, 3, C4_GUEST, C4_HOST, null);
    assert.equal(wrongTurn.valid, false);
    assert.equal(wrongTurn.reason, "Not your turn");
    console.log("PASS: validateC4Move rejects move out of turn");

    // Invalid: out of bounds column
    const oobMove = validateC4Move(emptyBoard, 7, C4_HOST, C4_HOST, null);
    assert.equal(oobMove.valid, false);
    console.log("PASS: validateC4Move rejects column out of bounds");

    // Invalid: game already over
    const afterWin = validateC4Move(emptyBoard, 2, C4_HOST, C4_HOST, "host");
    assert.equal(afterWin.valid, false);
    assert.equal(afterWin.reason, "Game is already over");
    console.log("PASS: validateC4Move rejects move when game is over");

    // Column full check
    const fullColBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
    for (let r = 0; r < C4_ROWS; r++) {
        fullColBoard[r][0] = C4_HOST;
    }
    const fullColMove = validateC4Move(fullColBoard, 0, C4_HOST, C4_HOST, null);
    assert.equal(fullColMove.valid, false);
    assert.match(fullColMove.reason, /already full/);
    console.log("PASS: validateC4Move rejects move in full column");

    // Win checking: 4 horizontal
    const hWinBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
    hWinBoard[0][0] = C4_HOST;
    hWinBoard[0][1] = C4_HOST;
    hWinBoard[0][2] = C4_HOST;
    hWinBoard[0][3] = C4_HOST;
    assert.equal(checkC4Win(hWinBoard, C4_HOST), true);
    assert.equal(checkC4Win(hWinBoard, C4_GUEST), false);
    console.log("PASS: checkC4Win detects horizontal win");

    // Win checking: 4 vertical
    const vWinBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
    vWinBoard[0][2] = C4_GUEST;
    vWinBoard[1][2] = C4_GUEST;
    vWinBoard[2][2] = C4_GUEST;
    vWinBoard[3][2] = C4_GUEST;
    assert.equal(checkC4Win(vWinBoard, C4_GUEST), true);
    console.log("PASS: checkC4Win detects vertical win");

    // Win checking: diagonal
    const dWinBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
    dWinBoard[0][1] = C4_HOST;
    dWinBoard[1][2] = C4_HOST;
    dWinBoard[2][3] = C4_HOST;
    dWinBoard[3][4] = C4_HOST;
    assert.equal(checkC4Win(dWinBoard, C4_HOST), true);
    console.log("PASS: checkC4Win detects diagonal win");

    // Board full check
    const filledBoard = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(1));
    assert.equal(isC4BoardFull(filledBoard), true);
    assert.equal(isC4BoardFull(emptyBoard), false);
    console.log("PASS: isC4BoardFull accurately detects grid capacity");
}

console.log("\nALL PROTOCOL AND NET TESTS PASSED SUCCESSFULLY!");
