import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../web");
const PORT = 8089;

const MIME_TYPES = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json"
};

// Simple static file server for tests
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
            console.log(`Test web server listening on http://localhost:${PORT}`);
            resolve(server);
        });
        server.on("error", reject);
    });
}

async function runTwoContextTest() {
    console.log("Starting Two-Context Connect Four E2E Test...\n");
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });

    try {
        const contextHost = await browser.newContext();
        const contextGuest = await browser.newContext();

        const pageHost = await contextHost.newPage();
        const pageGuest = await contextGuest.newPage();

        pageHost.on("console", (msg) => console.log("[HOST CONSOLE]", msg.text()));
        pageHost.on("pageerror", (err) => console.error("[HOST ERROR]", err));
        pageGuest.on("console", (msg) => console.log("[GUEST CONSOLE]", msg.text()));
        pageGuest.on("pageerror", (err) => console.error("[GUEST ERROR]", err));

        // 1. Host opens game and clicks Play online
        console.log("Navigating Host to Connect Four...");
        await pageHost.goto(`http://localhost:${PORT}/connect-four/`);
        await pageHost.click('[data-action="online"]');

        // 2. Host creates room
        console.log("Host creating room...");
        await pageHost.click('[data-lobby-action="go-create"]');

        // Wait for room code to appear
        const codeElement = pageHost.locator('[data-field="room-code"]');
        await codeElement.waitFor({ state: "visible" });
        await pageHost.waitForFunction(() => {
            const text = document.querySelector('[data-field="room-code"]')?.textContent?.trim();
            return text && text.length === 6 && !text.includes(".");
        }, { timeout: 15000 });

        const roomCode = (await codeElement.textContent()).trim();
        console.log(`Room created with code: ${roomCode}`);
        assert.equal(roomCode.length, 6);

        // 3. Guest joins using direct URL with ?room=CODE
        console.log(`Navigating Guest with ?room=${roomCode}...`);
        await pageGuest.goto(`http://localhost:${PORT}/connect-four/?room=${roomCode}`);

        // Click Join Match
        const joinBtn = pageGuest.locator('[data-lobby-action="submit-join"]');
        await joinBtn.waitFor({ state: "visible" });
        await joinBtn.click();

        // 4. Wait for both to connect and start playing
        console.log("Waiting for P2P connection to establish between Host and Guest...");
        await pageHost.waitForFunction(() => window.game && window.game.isOnline && window.game.state === "playing", { timeout: 20000 });
        await pageGuest.waitForFunction(() => window.game && window.game.isOnline && window.game.state === "playing", { timeout: 20000 });
        console.log("P2P connection established! Both clients in PLAYING state.");

        // 5. Play a game to completion
        console.log("Playing simulated turns to a 4-in-a-row win...");

        // Determine who has turn and play alternately
        for (let turnCount = 0; turnCount < 12; turnCount++) {
            const hostState = await pageHost.evaluate(() => ({
                turn: window.game.turn,
                myRole: window.game.myRole,
                state: window.game.state,
                winner: window.game.winner,
                board: window.game.board
            }));

            const guestState = await pageGuest.evaluate(() => ({
                turn: window.game.turn,
                myRole: window.game.myRole,
                state: window.game.state,
                winner: window.game.winner,
                board: window.game.board
            }));

            console.log(`[Turn ${turnCount}] Host: turn=${hostState.turn}, winner=${hostState.winner} | Guest: turn=${guestState.turn}, winner=${guestState.winner}`);

            if (hostState.state === "gameover" || hostState.winner !== null) {
                break;
            }

            if (hostState.turn === 1) {
                // Host plays in col 0 (stacking up to 4)
                await pageHost.evaluate(() => {
                    window.game.handlePlayerMove(0);
                });
            } else {
                // Guest plays in col 1
                await pageGuest.evaluate(() => {
                    window.game.handlePlayerMove(1);
                });
            }

            // Delay for P2P network propagation
            await pageHost.waitForTimeout(500);
        }

        // Wait for game over
        await pageHost.waitForFunction(() => window.game.state === "gameover", { timeout: 10000 });
        await pageGuest.waitForFunction(() => window.game.state === "gameover", { timeout: 10000 });

        const hostResult = await pageHost.evaluate(() => ({
            winner: window.game.winner,
            label: document.querySelector('[data-field="result-label"]')?.textContent?.trim()
        }));

        const guestResult = await pageGuest.evaluate(() => ({
            winner: window.game.winner,
            label: document.querySelector('[data-field="result-label"]')?.textContent?.trim()
        }));

        console.log("Host result:", hostResult);
        console.log("Guest result:", guestResult);

        assert.ok(hostResult.winner === "host" || hostResult.winner === "guest");
        assert.equal(hostResult.winner, guestResult.winner);

        if (hostResult.winner === "host") {
            assert.match(hostResult.label, /You win/i);
            assert.match(guestResult.label, /Opponent/i);
        } else {
            assert.match(guestResult.label, /You win/i);
            assert.match(hostResult.label, /Opponent/i);
        }

        console.log("\nPASS: Both clients successfully completed match and agreed on result!");
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

runTwoContextTest().catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
