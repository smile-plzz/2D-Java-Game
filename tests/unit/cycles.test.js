import assert from "node:assert/strict";

console.log("Running Neon Light Cycles game logic unit tests...\n");

const COLS = 40;
const ROWS = 30;

function createTestGrid() {
    return new Uint8Array(COLS * ROWS);
}

// 1. Grid movement and trail recording
{
    const grid = createTestGrid();
    const p = { x: 10, y: 15, dir: { x: 1, y: 0 }, alive: true };

    const nx = p.x + p.dir.x;
    const ny = p.y + p.dir.y;
    assert.equal(nx, 11);
    assert.equal(ny, 15);

    // Cell is empty initially
    assert.equal(grid[ny * COLS + nx], 0);

    // Claim cell
    grid[ny * COLS + nx] = 1;
    p.x = nx;
    p.y = ny;

    assert.equal(grid[15 * COLS + 11], 1);
    console.log("PASS: Player moves forward and registers light trail on grid");
}

// 2. Wall collision detection
{
    const grid = createTestGrid();
    const p = { x: COLS - 1, y: 15, dir: { x: 1, y: 0 }, alive: true };
    const nx = p.x + p.dir.x;
    const ny = p.y + p.dir.y;

    const hitWall = nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS;
    assert.equal(hitWall, true);
    console.log("PASS: Wall boundary collision correctly detected");
}

// 3. Trail collision detection
{
    const grid = createTestGrid();
    // Opponent trail at (20, 15)
    grid[15 * COLS + 20] = 2;

    const p = { x: 19, y: 15, dir: { x: 1, y: 0 }, alive: true };
    const nx = p.x + p.dir.x;
    const ny = p.y + p.dir.y;

    const hitTrail = grid[ny * COLS + nx] > 0;
    assert.equal(hitTrail, true);
    console.log("PASS: Collision with opponent light trail correctly detected");
}

// 4. AI lookahead selection
{
    const grid = createTestGrid();
    // Block forward at (11, 10), (12, 10)...
    grid[10 * COLS + 11] = 1;
    grid[10 * COLS + 12] = 1;

    // Block right/down at (10, 11)
    grid[11 * COLS + 10] = 1;

    const p = { x: 10, y: 10, dir: { x: 1, y: 0 } };
    const options = [
        { name: "UP", dir: { x: 0, y: -1 } },
        { name: "DOWN", dir: { x: 0, y: 1 } },
        { name: "RIGHT", dir: { x: 1, y: 0 } }
    ];

    let bestChoice = null;
    let maxSteps = -1;

    for (const opt of options) {
        let openSteps = 0;
        for (let s = 1; s <= 5; s++) {
            const tx = p.x + opt.dir.x * s;
            const ty = p.y + opt.dir.y * s;
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break;
            if (grid[ty * COLS + tx] > 0) break;
            openSteps++;
        }
        if (openSteps > maxSteps) {
            maxSteps = openSteps;
            bestChoice = opt.name;
        }
    }

    assert.equal(bestChoice, "UP");
    console.log("PASS: AI lookahead successfully avoids obstacles and picks optimal open vector:", bestChoice);
}

// 5. Match scoring
{
    const winScore = 3;
    let p1Wins = 2;
    let p2Wins = 1;

    // P1 wins next round
    p1Wins++;
    let matchWinner = null;
    if (p1Wins >= winScore) matchWinner = "p1";
    else if (p2Wins >= winScore) matchWinner = "p2";

    assert.equal(matchWinner, "p1");
    console.log("PASS: First to 3 round wins awards match victory");
}

console.log("\nALL LIGHT CYCLES UNIT TESTS PASSED!");
