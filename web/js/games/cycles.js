import { Game } from "../framework/game.js";
import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys } from "../framework/input.js";
import { Quality } from "../framework/quality.js";
import { ParticleSystem } from "../game/particles.js";
import { AudioBank } from "../game/audio.js";
import { MessageType } from "../net/protocol.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    GAME_OVER: "gameover"
};

export const Mode = {
    CLASSIC: "classic",
    TURBO: "turbo",
    ARENA: "arena"
};

export const MODE_INFO = {
    [Mode.CLASSIC]: {
        label: "Classic",
        tagline: "Standard grid speed. Cut off your opponent without crossing a trail.",
        speed: 0.048,
        boostSpeed: 0.028,
        obstacles: 0,
        winScore: 3
    },
    [Mode.TURBO]: {
        label: "Turbo",
        tagline: "High-octane reflex combat. Faster cycles and narrow turn corridors.",
        speed: 0.034,
        boostSpeed: 0.02,
        obstacles: 0,
        winScore: 3
    },
    [Mode.ARENA]: {
        label: "Arena",
        tagline: "Interior barrier pylons scattered across the grid. Spatial awareness is key.",
        speed: 0.046,
        boostSpeed: 0.028,
        obstacles: 14,
        winScore: 3
    }
};

const HIGH_SCORE_PREFIX = "neon-cycles.wins.";
const CELL = 14;

export class CyclesGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(400);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.mode = Mode.CLASSIC;
        this.highScores = {};
        for (const m of Object.keys(MODE_INFO)) {
            this.highScores[m] = CyclesGame.loadHighScore(m);
        }

        this.score = 0; // Host/Player round wins
        this.opponentScore = 0; // Guest/AI round wins
        this.winner = null;
        this.roundMessage = "";
        this.roundResetTimer = 0;

        // Multiplayer state
        this.isOnline = false;
        this.session = null;
        this.myRole = null; // 'host' or 'guest'
        this.snapshotTick = 0;
        this.lastSnapshotSent = 0;
        this.lastInputSent = 0;

        this.cols = 10;
        this.rows = 10;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.grid = null; // Uint8Array

        // Players: p1 (Cyan), p2 (Rose)
        this.p1 = { x: 0, y: 0, dir: new Vector2(1, 0), nextDir: new Vector2(1, 0), alive: true, boost: false };
        this.p2 = { x: 0, y: 0, dir: new Vector2(-1, 0), nextDir: new Vector2(-1, 0), alive: true, boost: false };

        this.stepTimer = 0;
        this.shakeAmount = 0;

        // Touch swipe support
        let touchStartX = 0;
        let touchStartY = 0;
        canvas.addEventListener("touchstart", (e) => {
            if (e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        canvas.addEventListener("touchend", (e) => {
            if (e.changedTouches.length > 0) {
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        this.handlePlayerInput(dx > 0 ? "RIGHT" : "LEFT");
                    } else {
                        this.handlePlayerInput(dy > 0 ? "DOWN" : "UP");
                    }
                }
            }
        }, { passive: true });

        canvas.addEventListener("pointerdown", () => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) {
                if (this.isOnline) return;
                this.startGame();
            }
        });
    }

    //<editor-fold desc="Framework Hooks">
    initialize() {
        this.computeGrid();
        this.emit();
    }

    loadContent() {}

    onResize(width, height) {
        this.computeGrid();
    }

    onWindowBlur() {
        super.onWindowBlur();
        if (!this.isOnline && this.state === State.PLAYING) this.pause();
    }

    computeGrid() {
        const padX = 24;
        const padY = 32;
        const availW = Math.max(100, this.width - padX * 2);
        const availH = Math.max(100, this.height - padY * 2);

        this.cols = Math.max(20, Math.floor(availW / CELL));
        this.rows = Math.max(16, Math.floor(availH / CELL));

        this.gridOffsetX = (this.width - this.cols * CELL) / 2;
        this.gridOffsetY = (this.height - this.rows * CELL) / 2;

        this.grid = new Uint8Array(this.cols * this.rows);
    }
    //</editor-fold>

    get highScore() { return this.highScores[this.mode]; }

    get rules() { return MODE_INFO[this.mode]; }

    //<editor-fold desc="State Management">
    setMode(mode) {
        if (!MODE_INFO[mode] || this.mode === mode) return;
        if (this.state === State.PLAYING || this.state === State.PAUSED) return;
        this.mode = mode;
        this.emit();
    }

    onStateChange(listener) {
        this.listeners.add(listener);
        listener(this.state, this.snapshot());
        return () => this.listeners.delete(listener);
    }

    emit() {
        for (const cb of this.listeners) cb(this.state, this.snapshot());
    }

    snapshot() {
        return {
            score: this.score,
            opponentScore: this.opponentScore,
            highScore: this.highScore,
            highScores: this.highScores,
            mode: this.mode,
            target: this.rules.winScore,
            winner: this.winner,
            muted: this.audio.muted,
            isOnline: this.isOnline,
            myRole: this.myRole
        };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame(mode = this.mode) {
        this.isOnline = false;
        this.mode = MODE_INFO[mode] ? mode : Mode.CLASSIC;
        this.score = 0;
        this.opponentScore = 0;
        this.winner = null;
        this.particles.clear();
        this.shakeAmount = 0;

        this.startRound();
        this.audio.ensureContext();
        this.setState(State.PLAYING);
    }

    startRound() {
        this.grid.fill(0);
        this.roundMessage = "";
        this.roundResetTimer = 0;

        // Place obstacles if Arena mode
        if (this.rules.obstacles > 0) {
            this.seedObstacles();
        }

        // P1 starts left heading right
        this.p1.x = Math.floor(this.cols * 0.2);
        this.p1.y = Math.floor(this.rows * 0.5);
        this.p1.dir = new Vector2(1, 0);
        this.p1.nextDir = new Vector2(1, 0);
        this.p1.alive = true;
        this.p1.boost = false;
        this.grid[this.p1.y * this.cols + this.p1.x] = 1;

        // P2 starts right heading left
        this.p2.x = Math.floor(this.cols * 0.8);
        this.p2.y = Math.floor(this.rows * 0.5);
        this.p2.dir = new Vector2(-1, 0);
        this.p2.nextDir = new Vector2(-1, 0);
        this.p2.alive = true;
        this.p2.boost = false;
        this.grid[this.p2.y * this.cols + this.p2.x] = 2;
    }

    seedObstacles() {
        const count = this.rules.obstacles;
        for (let i = 0; i < count; i++) {
            const ox = MathHelper.randomInt(Math.floor(this.cols * 0.35), Math.floor(this.cols * 0.65));
            const oy = MathHelper.randomInt(4, this.rows - 5);
            // 2x2 pillar
            for (let dx = 0; dx < 2; dx++) {
                for (let dy = 0; dy < 2; dy++) {
                    const idx = (oy + dy) * this.cols + (ox + dx);
                    if (idx < this.grid.length) this.grid[idx] = 3;
                }
            }
        }
    }

    pause() {
        if (this.isOnline || this.state !== State.PLAYING) return;
        this.gameTime.stop();
        this.setState(State.PAUSED);
    }

    resume() {
        if (this.state !== State.PAUSED) return;
        this.gameTime.start();
        Keyboard.clear();
        this.setState(State.PLAYING);
    }

    togglePause() {
        if (this.isOnline) return;
        if (this.state === State.PLAYING) this.pause();
        else if (this.state === State.PAUSED) this.resume();
    }

    finishMatch(winner) {
        this.winner = winner;
        if (!this.isOnline) {
            if (winner === "player" && this.score > this.highScores[this.mode]) {
                this.highScores[this.mode] = this.score;
                CyclesGame.saveHighScore(this.mode, this.score);
            }
            this.audio.play(winner === "player" ? "wave" : "crash");
        } else {
            const iWon = (winner === "host" && this.myRole === "host") || (winner === "guest" && this.myRole === "guest");
            this.audio.play(iWon ? "wave" : "crash");
        }
        this.setState(State.GAME_OVER);
    }

    static loadHighScore(mode) {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_PREFIX + mode)) || 0;
        } catch (e) {
            return 0;
        }
    }

    static saveHighScore(mode, val) {
        try {
            window.localStorage.setItem(HIGH_SCORE_PREFIX + mode, String(val));
        } catch (e) {}
    }
    //</editor-fold>

    //<editor-fold desc="Multiplayer Online Support">
    startOnlineMatch(session) {
        this.isOnline = true;
        this.session = session;
        this.myRole = session.role;
        this.mode = Mode.CLASSIC;
        this.score = 0;
        this.opponentScore = 0;
        this.winner = null;
        this.particles.clear();
        this.shakeAmount = 0;
        this.audio.ensureContext();

        session.onMessage((msg) => this.handleNetworkMessage(msg));

        if (session.isHost) {
            this.startRound();
            session.send(MessageType.CYCLES_START, {
                cols: this.cols,
                rows: this.rows,
                winScore: this.rules.winScore
            });
            this.setState(State.PLAYING);
        } else {
            this.setState(State.PLAYING);
        }
        this.emit();
    }

    handleNetworkMessage(msg) {
        if (!this.isOnline) return;

        if (msg.t === MessageType.CYCLES_START) {
            this.score = 0;
            this.opponentScore = 0;
            this.winner = null;
            this.startRound();
            this.setState(State.PLAYING);
            this.emit();
            return;
        }

        if (msg.t === MessageType.CYCLES_INPUT && this.session && this.session.isHost) {
            // Guest sends steer direction for P2
            const dir = this.parseDirection(msg.dir);
            if (dir && (dir.x !== -this.p2.dir.x || dir.y !== -this.p2.dir.y)) {
                this.p2.nextDir = dir;
            }
            if (typeof msg.boost === "boolean") {
                this.p2.boost = msg.boost;
            }
            return;
        }

        if (msg.t === MessageType.CYCLES_SNAPSHOT && this.session && this.session.isGuest) {
            // Guest updates state directly from host authoritative snapshot
            this.p1.x = msg.p1.x;
            this.p1.y = msg.p1.y;
            this.p1.dir = new Vector2(msg.p1.dx, msg.p1.dy);
            this.p1.alive = msg.p1.alive;

            this.p2.x = msg.p2.x;
            this.p2.y = msg.p2.y;
            this.p2.dir = new Vector2(msg.p2.dx, msg.p2.dy);
            this.p2.alive = msg.p2.alive;

            if (msg.gridBase64) {
                this.decodeGrid(msg.gridBase64);
            }

            this.score = msg.score;
            this.opponentScore = msg.opponentScore;
            return;
        }

        if (msg.t === MessageType.CYCLES_EVENT) {
            if (msg.event === "crash") {
                this.shakeAmount = 8;
                this.audio.play("crash");
                const pos = this.gridToWorld(msg.x, msg.y);
                this.particles.burst(pos, msg.loser === 1 ? "#38bdf8" : "#f43f5e", 30, 260, 0.6, 2.2);
            } else if (msg.event === "round_win") {
                this.score = msg.score;
                this.opponentScore = msg.opponentScore;
                this.roundMessage = msg.message;
                this.emit();
            } else if (msg.event === "match_over") {
                this.score = msg.score;
                this.opponentScore = msg.opponentScore;
                this.finishMatch(msg.winner);
            }
            return;
        }

        if (msg.t === MessageType.REMATCH_REQUEST && this.session && this.session.isHost) {
            this.startOnlineMatch(this.session);
        }
    }

    parseDirection(str) {
        if (str === "UP") return new Vector2(0, -1);
        if (str === "DOWN") return new Vector2(0, 1);
        if (str === "LEFT") return new Vector2(-1, 0);
        if (str === "RIGHT") return new Vector2(1, 0);
        return null;
    }

    requestRematch() {
        if (!this.isOnline || !this.session) return;
        if (this.session.isHost) {
            this.startOnlineMatch(this.session);
        } else {
            this.session.send(MessageType.REMATCH_REQUEST);
        }
    }

    leaveOnline() {
        if (!this.isOnline) return;
        this.isOnline = false;
        if (this.session) {
            this.session.leave();
            this.session = null;
        }
        this.setState(State.MENU);
        this.emit();
    }
    //</editor-fold>

    //<editor-fold desc="Input Handling">
    handlePlayerInput(dirKey) {
        if (this.state !== State.PLAYING) return;

        const target = (this.isOnline && this.myRole === "guest") ? this.p2 : this.p1;
        const newDir = this.parseDirection(dirKey);
        if (!newDir) return;

        // Prevent reversing directly into own trail
        if (newDir.x !== -target.dir.x || newDir.y !== -target.dir.y) {
            target.nextDir = newDir;
            this.audio.play("paddle");
        }

        if (this.isOnline && this.session && this.session.isGuest) {
            this.session.sendUnreliable(MessageType.CYCLES_INPUT, {
                dir: dirKey,
                boost: target.boost
            });
        }
    }

    checkControls() {
        // Player 1 controls (WASD or Arrows in single-player/host)
        const activePlayer = (this.isOnline && this.myRole === "guest") ? "p2" : "p1";

        if (Keyboard.keyDownOnce(Keys.UP) || Keyboard.keyDownOnce(Keys.W)) this.handlePlayerInput("UP");
        if (Keyboard.keyDownOnce(Keys.DOWN) || Keyboard.keyDownOnce(Keys.S)) this.handlePlayerInput("DOWN");
        if (Keyboard.keyDownOnce(Keys.LEFT) || Keyboard.keyDownOnce(Keys.A)) this.handlePlayerInput("LEFT");
        if (Keyboard.keyDownOnce(Keys.RIGHT) || Keyboard.keyDownOnce(Keys.D)) this.handlePlayerInput("RIGHT");

        const target = activePlayer === "p2" ? this.p2 : this.p1;
        target.boost = Keyboard.keyDown(Keys.SPACE) || Keyboard.keyDown(Keys.SHIFT);
    }
    //</editor-fold>

    //<editor-fold desc="Update Loop">
    update(gameTime) {
        const delta = gameTime.getDeltaTimeSeconds();

        if (Keyboard.keyDownOnce(Keys.M)) {
            this.audio.toggleMute();
            this.emit();
        }
        if (Keyboard.keyDownOnce(Keys.P) || Keyboard.keyDownOnce(Keys.ESCAPE)) {
            this.togglePause();
        }

        if (this.state === State.MENU || this.state === State.GAME_OVER) {
            if (!this.isOnline && (Keyboard.keyDownOnce(Keys.ENTER) || Keyboard.keyDownOnce(Keys.R))) {
                this.startGame();
            }
        }

        this.shakeAmount = Math.max(0, this.shakeAmount - delta * 30);

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        this.checkControls();

        if (!this.isOnline || (this.session && this.session.isHost)) {
            this.updateSimulation(delta);
        }

        this.particles.update(delta);
    }

    updateSimulation(delta) {
        // Round reset delay after a crash
        if (this.roundResetTimer > 0) {
            this.roundResetTimer -= delta;
            if (this.roundResetTimer <= 0) {
                if (this.score >= this.rules.winScore) {
                    const winner = this.isOnline ? "host" : "player";
                    this.finishMatch(winner);
                    if (this.isOnline && this.session) {
                        this.session.send(MessageType.CYCLES_EVENT, {
                            event: "match_over",
                            winner,
                            score: this.score,
                            opponentScore: this.opponentScore
                        });
                    }
                } else if (this.opponentScore >= this.rules.winScore) {
                    const winner = this.isOnline ? "guest" : "ai";
                    this.finishMatch(winner);
                    if (this.isOnline && this.session) {
                        this.session.send(MessageType.CYCLES_EVENT, {
                            event: "match_over",
                            winner,
                            score: this.score,
                            opponentScore: this.opponentScore
                        });
                    }
                } else {
                    this.startRound();
                }
            }
            return;
        }

        // Stepped movement timer
        const currentSpeed = (this.p1.boost || this.p2.boost) ? this.rules.boostSpeed : this.rules.speed;
        this.stepTimer += delta;

        if (this.stepTimer >= currentSpeed) {
            this.stepTimer = 0;

            // AI step in single-player
            if (!this.isOnline) {
                this.stepAi();
            }

            // Advance P1
            this.stepPlayer(this.p1, 1);
            // Advance P2
            this.stepPlayer(this.p2, 2);

            // Broadcast state snapshot to guest in online mode
            if (this.isOnline && this.session && this.session.isHost) {
                const now = performance.now();
                if (now - this.lastSnapshotSent >= 30) {
                    this.lastSnapshotSent = now;
                    this.session.sendUnreliable(MessageType.CYCLES_SNAPSHOT, {
                        tick: ++this.snapshotTick,
                        p1: { x: this.p1.x, y: this.p1.y, dx: this.p1.dir.x, dy: this.p1.dir.y, alive: this.p1.alive },
                        p2: { x: this.p2.x, y: this.p2.y, dx: this.p2.dir.x, dy: this.p2.dir.y, alive: this.p2.alive },
                        score: this.score,
                        opponentScore: this.opponentScore
                    });
                }
            }
        }
    }

    stepPlayer(p, id) {
        if (!p.alive) return;

        p.dir = p.nextDir;
        const nx = p.x + p.dir.x;
        const ny = p.y + p.dir.y;

        // Wall collision
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) {
            this.handleCrash(p, id, p.x, p.y);
            return;
        }

        // Trail / obstacle collision
        const cell = this.grid[ny * this.cols + nx];
        if (cell > 0) {
            this.handleCrash(p, id, nx, ny);
            return;
        }

        // Valid move: claim cell
        p.x = nx;
        p.y = ny;
        this.grid[ny * this.cols + nx] = id;
    }

    handleCrash(p, loserId, cx, cy) {
        p.alive = false;
        this.shakeAmount = 10;
        this.audio.play("crash");

        const worldPos = this.gridToWorld(cx, cy);
        this.particles.burst(worldPos, loserId === 1 ? "#38bdf8" : "#f43f5e", 35, 280, 0.6, 2.4);

        if (loserId === 1) {
            this.opponentScore += 1;
            this.roundMessage = this.isOnline ? "Point to Opponent (Rose)" : "AI scores round point!";
        } else {
            this.score += 1;
            this.roundMessage = this.isOnline ? "Point to Host (Cyan)" : "You score round point!";
        }

        this.emit();
        this.roundResetTimer = 1.4;

        if (this.isOnline && this.session && this.session.isHost) {
            this.session.send(MessageType.CYCLES_EVENT, {
                event: "crash",
                loser: loserId,
                x: cx,
                y: cy,
                score: this.score,
                opponentScore: this.opponentScore,
                message: this.roundMessage
            });
        }
    }

    stepAi() {
        const p = this.p2;
        const options = [
            new Vector2(0, -1),
            new Vector2(0, 1),
            new Vector2(-1, 0),
            new Vector2(1, 0)
        ];

        // Filter out immediate reverse
        const valid = options.filter((d) => d.x !== -p.dir.x || d.y !== -p.dir.y);

        // Evaluate forward lookahead space
        let bestDir = p.dir;
        let maxOpen = -1;

        for (const dir of valid) {
            let openSteps = 0;
            for (let step = 1; step <= 6; step++) {
                const tx = p.x + dir.x * step;
                const ty = p.y + dir.y * step;
                if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) break;
                if (this.grid[ty * this.cols + tx] > 0) break;
                openSteps++;
            }
            if (openSteps > maxOpen) {
                maxOpen = openSteps;
                bestDir = dir;
            }
        }

        p.nextDir = bestDir;
    }
    //</editor-fold>

    //<editor-fold desc="Render">
    draw(ctx) {
        ctx.save();
        if (this.shakeAmount > 0) {
            ctx.translate(
                MathHelper.random(-this.shakeAmount, this.shakeAmount),
                MathHelper.random(-this.shakeAmount, this.shakeAmount)
            );
        }

        this.drawArena(ctx);
        if (this.state !== State.MENU) {
            this.drawGridTrails(ctx);
            this.drawCycles(ctx);
        }
        this.particles.draw(ctx);
        ctx.restore();

        if (this.state !== State.MENU) {
            this.drawHud(ctx);
        }
    }

    gridToWorld(gx, gy) {
        return {
            x: this.gridOffsetX + gx * CELL + CELL / 2,
            y: this.gridOffsetY + gy * CELL + CELL / 2
        };
    }

    drawArena(ctx) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 2;
        const width = this.cols * CELL;
        const height = this.rows * CELL;

        ctx.strokeRect(this.gridOffsetX, this.gridOffsetY, width, height);

        // Subdued background grid
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= this.cols; x += 4) {
            const rx = this.gridOffsetX + x * CELL;
            ctx.moveTo(rx, this.gridOffsetY);
            ctx.lineTo(rx, this.gridOffsetY + height);
        }
        for (let y = 0; y <= this.rows; y += 4) {
            const ry = this.gridOffsetY + y * CELL;
            ctx.moveTo(this.gridOffsetX, ry);
            ctx.lineTo(this.gridOffsetX + width, ry);
        }
        ctx.stroke();
    }

    drawGridTrails(ctx) {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r * this.cols + c];
                if (cell === 0) continue;

                const x = this.gridOffsetX + c * CELL;
                const y = this.gridOffsetY + r * CELL;

                if (cell === 1) {
                    ctx.fillStyle = "rgba(56, 189, 248, 0.75)";
                    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
                } else if (cell === 2) {
                    ctx.fillStyle = "rgba(244, 63, 94, 0.75)";
                    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
                } else if (cell === 3) {
                    ctx.fillStyle = "#64748b";
                    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
                }
            }
        }
    }

    drawCycles(ctx) {
        // Draw P1 (Cyan)
        if (this.p1.alive) {
            const pos = this.gridToWorld(this.p1.x, this.p1.y);
            ctx.fillStyle = "#e0f2fe";
            ctx.shadowColor = "#38bdf8";
            ctx.shadowBlur = Quality.glow(16);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, CELL * 0.65, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Draw P2 (Rose)
        if (this.p2.alive) {
            const pos = this.gridToWorld(this.p2.x, this.p2.y);
            ctx.fillStyle = "#ffe4e6";
            ctx.shadowColor = "#f43f5e";
            ctx.shadowBlur = Quality.glow(16);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, CELL * 0.65, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    drawHud(ctx) {
        const pad = 18;
        ctx.textBaseline = "top";
        ctx.font = "700 24px 'JetBrains Mono', ui-monospace, monospace";

        // Score display
        ctx.textAlign = "right";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(String(this.score), this.width / 2 - 20, pad);

        ctx.textAlign = "left";
        ctx.fillStyle = "#f43f5e";
        ctx.fillText(String(this.opponentScore), this.width / 2 + 20, pad);

        ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";

        if (this.isOnline) {
            const roleText = this.myRole === "host" ? "YOU: CYAN · OPPONENT: ROSE" : "YOU: ROSE · OPPONENT: CYAN";
            ctx.fillText(`ONLINE 2-PLAYER · ${roleText} · FIRST TO ${this.rules.winScore}`, this.width / 2, pad + 32);
        } else {
            ctx.fillText(`${this.rules.label.toUpperCase()} · YOU VS AI · FIRST TO ${this.rules.winScore}`, this.width / 2, pad + 32);
        }

        // Round message banner
        if (this.roundMessage) {
            ctx.font = "700 16px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = "#f0abfc";
            ctx.fillText(this.roundMessage, this.width / 2, this.height - 38);
        }
    }
    //</editor-fold>
}
