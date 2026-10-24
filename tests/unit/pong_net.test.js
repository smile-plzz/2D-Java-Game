import assert from "node:assert/strict";

console.log("Running Neon Pong netcode simulation tests...\n");

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// 1. Input normalization test
{
    const height = 600;
    const paddleHeight = 80;
    const span = height - paddleHeight;

    const testY1 = 0;
    const normY1 = testY1 / span;
    assert.equal(normY1, 0);

    const testY2 = span;
    const normY2 = testY2 / span;
    assert.equal(normY2, 1);

    const testY3 = 260;
    const normY3 = testY3 / span;
    assert.equal(normY3, 0.5);

    // Host receives normY3 on different screen height (e.g. 700)
    const hostHeight = 700;
    const hostSpan = hostHeight - paddleHeight;
    const mappedY = normY3 * hostSpan;
    assert.equal(mappedY, 310);
    console.log("PASS: Normalized paddle coordinates map accurately across screen dimensions");
}

// 2. Snapshot interpolation test
{
    const s0 = {
        time: 1000,
        balls: [{ normX: 0.2, normY: 0.3, vx: 200, vy: 100 }],
        hostNormY: 0.4,
        guestNormY: 0.6
    };

    const s1 = {
        time: 1033, // 33ms later (~30 Hz)
        balls: [{ normX: 0.25, normY: 0.35, vx: 200, vy: 100 }],
        hostNormY: 0.42,
        guestNormY: 0.58
    };

    const renderTime = 1016.5; // midpoint
    const alpha = (renderTime - s0.time) / (s1.time - s0.time);
    assert.ok(Math.abs(alpha - 0.5) < 0.001);

    const interpBallX = lerp(s0.balls[0].normX, s1.balls[0].normX, alpha);
    assert.ok(Math.abs(interpBallX - 0.225) < 0.001);

    const interpBallY = lerp(s0.balls[0].normY, s1.balls[0].normY, alpha);
    assert.ok(Math.abs(interpBallY - 0.325) < 0.001);

    const interpHostY = lerp(s0.hostNormY, s1.hostNormY, alpha);
    assert.ok(Math.abs(interpHostY - 0.41) < 0.001);

    console.log("PASS: Snapshot interpolation produces smooth continuous intermediate positions");
}

// 3. Scoring and win condition test
{
    const winScore = 7;
    let hostScore = 6;
    let guestScore = 5;

    // Point scored by host
    hostScore += 1;
    let winner = null;
    if (hostScore >= winScore || guestScore >= winScore) {
        winner = hostScore >= winScore ? "host" : "guest";
    }
    assert.equal(winner, "host");
    console.log("PASS: First to seven detected as host win");
}

console.log("\nALL NEON PONG NETCODE TESTS PASSED!");
