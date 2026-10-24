import assert from "node:assert/strict";
import {
    validateC4Move,
    checkC4Win,
    isC4BoardFull,
    C4_COLS,
    C4_ROWS,
    C4_HOST,
    C4_GUEST
} from "../../web/js/net/protocol.js";

console.log("Running Connect Four online simulation tests...\n");

// Simulate full game state between host and guest
let board = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
let currentTurn = C4_HOST;
let winner = null;

function applyHostValidatedMove(col, senderRole) {
    const val = validateC4Move(board, col, senderRole, currentTurn, winner);
    assert.equal(val.valid, true, `Move should be valid: col ${col}, role ${senderRole}`);

    board[val.row][col] = senderRole;

    if (checkC4Win(board, senderRole)) {
        winner = senderRole === C4_HOST ? "host" : "guest";
    } else if (isC4BoardFull(board)) {
        winner = "draw";
    } else {
        currentTurn = senderRole === C4_HOST ? C4_GUEST : C4_HOST;
    }
    return { row: val.row, col, senderRole, currentTurn, winner };
}

// 1. Host plays col 0
let res = applyHostValidatedMove(0, C4_HOST);
assert.equal(res.row, 0);
assert.equal(res.currentTurn, C4_GUEST);
console.log("PASS: Host played (0,0), next turn is guest");

// 2. Out-of-turn rejection
const illegalMove = validateC4Move(board, 0, C4_HOST, currentTurn, winner);
assert.equal(illegalMove.valid, false);
assert.equal(illegalMove.reason, "Not your turn");
console.log("PASS: Out-of-turn move rejected by host");

// 3. Guest plays col 0
res = applyHostValidatedMove(0, C4_GUEST);
assert.equal(res.row, 1);
assert.equal(res.currentTurn, C4_HOST);
console.log("PASS: Guest stacked on (1,0), next turn is host");

// 4. Play through a horizontal win for Host across cols 1, 2, 3
applyHostValidatedMove(1, C4_HOST);
applyHostValidatedMove(1, C4_GUEST);
applyHostValidatedMove(2, C4_HOST);
applyHostValidatedMove(2, C4_GUEST);
res = applyHostValidatedMove(3, C4_HOST);

assert.equal(res.winner, "host");
console.log("PASS: Host reached 4-in-a-row horizontally, winner detected as 'host'");

// 5. Post-game move rejected
const postGameOver = validateC4Move(board, 4, C4_GUEST, currentTurn, winner);
assert.equal(postGameOver.valid, false);
assert.equal(postGameOver.reason, "Game is already over");
console.log("PASS: Post-game move rejected");

// 6. Rematch reset
board = Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
winner = null;
currentTurn = C4_GUEST;
res = applyHostValidatedMove(3, C4_GUEST);
assert.equal(res.currentTurn, C4_HOST);
console.log("PASS: Rematch reset board and successfully accepted guest opening move");

console.log("\nALL CONNECT FOUR ONLINE LOGIC TESTS PASSED!");
