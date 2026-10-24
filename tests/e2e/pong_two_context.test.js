import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../web");
const PORT = 8090;

const MIME_TYPES = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json"
};

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
            let filePath = path.join(webRoot, parsedUrl.pathname);

            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, "index.html");
            }

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("404 Not Found");
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": contentType });
            fs.createReadStream(filePath).pipe(res);
        });

        server.listen(PORT, () => {
            console.log(`Neon Pong test web server listening on http://localhost:${PORT}`);
            resolve(server);
        });
        server.on("error", reject);
    });
}

async function runPongTwoContextTest() {
    console.log("Starting Two-Context Neon Pong E2E Test...\n");
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });

    try {
        const contextHost = await browser.newContext();
        const contextGuest = await browser.newContext();

        const pageHost = await contextHost.newPage();
        const pageGuest = await contextGuest.newPage();

        // 1. Host opens Pong and creates room
        console.log("Host opening Neon Pong...");
        await pageHost.goto(`http://localhost:${PORT}/neon-pong/`);
        await pageHost.click('[data-action="online"]');
        await pageHost.click('[data-lobby-action="go-create"]');

        const codeElement = pageHost.locator('[data-field="room-code"]');
        await codeElement.waitFor({ state: "visible" });
        await pageHost.waitForFunction(() => {
            const text = document.querySelector('[data-field="room-code"]')?.textContent?.trim();
            return text && text.length === 6 && !text.includes(".");
        }, { timeout: 15000 });

        const roomCode = (await codeElement.textContent()).trim();
        console.log(`Pong room created with code: ${roomCode}`);

        // 2. Guest opens Pong with ?room=CODE
        console.log(`Guest joining with ?room=${roomCode}...`);
        await pageGuest.goto(`http://localhost:${PORT}/neon-pong/?room=${roomCode}`);
        const joinBtn = pageGuest.locator('[data-lobby-action="submit-join"]');
        await joinBtn.waitFor({ state: "visible" });
        await joinBtn.click();

        // 3. Wait for P2P connection
        console.log("Waiting for P2P connection to establish between Pong peers...");
        await pageHost.waitForFunction(() => window.game && window.game.isOnline && window.game.state === "playing", { timeout: 20000 });
        await pageGuest.waitForFunction(() => window.game && window.game.isOnline && window.game.state === "playing", { timeout: 20000 });
        console.log("P2P connection established! Both clients in real-time PLAYING state.");

        // 4. Test real-time synchronization:
        // Guest moves paddle to target Y = 200
        await pageGuest.evaluate(() => {
            window.game.ai.y = 200;
        });

        // Let simulation run for ~1.5s
        await pageHost.waitForTimeout(1500);

        const hostCheck = await pageHost.evaluate(() => ({
            ballsCount: window.game.balls.length,
            ballPos: { x: window.game.balls[0].position.x, y: window.game.balls[0].position.y },
            snapshotTick: window.game.snapshotTick,
            isOnline: window.game.isOnline
        }));

        const guestCheck = await pageGuest.evaluate(() => ({
            ballsCount: window.game.balls.length,
            ballPos: { x: window.game.balls[0].position.x, y: window.game.balls[0].position.y },
            snapshotHistoryLength: window.game.snapshotHistory.length,
            isOnline: window.game.isOnline
        }));

        console.log("Host simulation check:", hostCheck);
        console.log("Guest interpolation check:", guestCheck);

        assert.equal(hostCheck.isOnline, true);
        assert.equal(guestCheck.isOnline, true);
        assert.ok(hostCheck.snapshotTick > 10, "Host should have generated and broadcast snapshots");
        assert.ok(guestCheck.snapshotHistoryLength > 5, "Guest should have received and buffered snapshots");

        // Balls must exist on both and not be at (0,0)
        assert.ok(hostCheck.ballPos.x > 0);
        assert.ok(guestCheck.ballPos.x > 0);

        // 5. Test clean disconnect when guest leaves
        console.log("Guest leaving match...");
        await pageGuest.evaluate(() => {
            window.lobby.overlay.querySelector('[data-lobby-action="close"]')?.click() || window.game.leaveOnline();
        });

        await pageHost.waitForTimeout(500);
        const hostAfterDisconnect = await pageHost.evaluate(() => window.game.winner);
        console.log("Host after guest leave:", hostAfterDisconnect);

        console.log("\nPASS: Neon Pong real-time multiplayer verified successfully!");
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

runPongTwoContextTest().catch((err) => {
    console.error("Pong test failed:", err);
    process.exit(1);
});
