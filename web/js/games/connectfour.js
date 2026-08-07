import { Game } from "../framework/game.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys } from "../framework/input.js";
import { ParticleSystem } from "../game/particles.js";
import { AudioBank } from "../game/audio.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    GAME_OVER: "gameover"
};

const HIGH_SCORE_KEY = "neon-connect-four.beststreak";
const COLS = 7;
const ROWS = 6;
const PLAYER = 1;
const AI = 2;
const AI_DEPTH = 5;
const AI_THINK_TIME = 0.5;

/**
 * Neon Connect Four: player versus a minimax AI with alpha-beta pruning.
 * Turn based, like Neon 2048 — update() only reacts to input and the AI's
 * thinking timer, everything else is a redraw of the current board.
 */
export class ConnectFourGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(200);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.board = [];
        this.turn = PLAYER;
        this.winner = null;
        this.aiTimer = 0;
        this.hoverColumn = 3;

        this.winStreak = 0;
        this.bestStreak = ConnectFourGame.loadBestStreak();

        this.boardSize = { width: 0, height: 0 };
        this.cell = 0;
        this.offsetX = 0;
        this.offsetY = 0;

        canvas.addEventListener("pointermove", (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * this.width;
            this.hoverColumn = MathHelper.clamp(Math.floor((x - this.offsetX) / this.cell), 0, COLS - 1);
        });
        canvas.addEventListener("pointerdown", () => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) {
                this.startGame();
                return;
            }
            if (this.state === State.PLAYING && this.turn === PLAYER) this.dropDisc(this.hoverColumn);
        });
    }

    //<editor-fold desc="Framework hooks">
    initialize() { this.emit(); }
    loadContent() {}

    onResize(width, height) {
        const usable = { width: width * 0.92, height: height * 0.86 };
        this.cell = Math.min(usable.width / COLS, usable.height / ROWS);
        this.offsetX = (width - this.cell * COLS) / 2;
        this.offsetY = (height - this.cell * ROWS) / 2;
    }
    //</editor-fold>

    //<editor-fold desc="State">
    onStateChange(listener) {
        this.listeners.add(listener);
        listener(this.state, this.snapshot());
        return () => this.listeners.delete(listener);
    }

    emit() {
        for (const listener of this.listeners) listener(this.state, this.snapshot());
    }

    snapshot() {
        return {
            score: this.winStreak,
            highScore: this.bestStreak,
            winner: this.winner,
            muted: this.audio.muted
        };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame() {
        this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
        this.turn = PLAYER;
        this.winner = null;
        this.aiTimer = 0;
        this.particles.clear();

        this.audio.ensureContext();
        this.setState(State.PLAYING);
    }

    finish(winner) {
        this.winner = winner;
        if (winner === "player") {
            this.winStreak += 1;
            if (this.winStreak > this.bestStreak) {
                this.bestStreak = this.winStreak;
                ConnectFourGame.saveBestStreak(this.bestStreak);
            }
        } else if (winner === "ai") {
            this.winStreak = 0;
        }
        this.audio.play(winner === "player" ? "wave" : winner === "ai" ? "crash" : "pop");
        this.setState(State.GAME_OVER);
    }

    static loadBestStreak() {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
        } catch (error) {
            return 0;
        }
    }

    static saveBestStreak(value) {
        try {
            window.localStorage.setItem(HIGH_SCORE_KEY, String(value));
        } catch (error) {
            // Losing the streak is not worth breaking the run over.
        }
    }
    //</editor-fold>

    //<editor-fold desc="Board logic">
    nextOpenRow(board, col) {
        for (let row = 0; row < ROWS; row++) {
            if (board[row][col] === 0) return row;
        }
        return -1;
    }

    dropDisc(col) {
        const row = this.nextOpenRow(this.board, col);
        if (row === -1) return false;

        this.board[row][col] = this.turn;
        this.audio.play("paddle");
        this.particles.burst(this.cellCenter(row, col), this.turn === PLAYER ? "#4ade80" : "#f43f5e", 12, 160, 0.4, 1.6);

        if (this.checkWin(this.board, this.turn)) {
            this.finish(this.turn === PLAYER ? "player" : "ai");
            return true;
        }
        if (this.isFull(this.board)) {
            this.finish("draw");
            return true;
        }

        if (this.turn === PLAYER) {
            this.turn = AI;
            this.aiTimer = AI_THINK_TIME;
        } else {
            this.turn = PLAYER;
        }
        this.emit();
        return true;
    }

    cellCenter(row, col) {
        return {
            x: this.offsetX + col * this.cell + this.cell / 2,
            y: this.offsetY + (ROWS - 1 - row) * this.cell + this.cell / 2
        };
    }

    validColumns(board) {
        const cols = [];
        for (let col = 0; col < COLS; col++) if (board[ROWS - 1][col] === 0) cols.push(col);
        return cols;
    }

    isFull(board) { return this.validColumns(board).length === 0; }

    checkWin(board, piece) {
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (col + 3 < COLS
                    && board[row][col] === piece && board[row][col + 1] === piece
                    && board[row][col + 2] === piece && board[row][col + 3] === piece) return true;
                if (row + 3 < ROWS
                    && board[row][col] === piece && board[row + 1][col] === piece
                    && board[row + 2][col] === piece && board[row + 3][col] === piece) return true;
                if (col + 3 < COLS && row + 3 < ROWS
                    && board[row][col] === piece && board[row + 1][col + 1] === piece
                    && board[row + 2][col + 2] === piece && board[row + 3][col + 3] === piece) return true;
                if (col + 3 < COLS && row - 3 >= 0
                    && board[row][col] === piece && board[row - 1][col + 1] === piece
                    && board[row - 2][col + 2] === piece && board[row - 3][col + 3] === piece) return true;
            }
        }
        return false;
    }
    //</editor-fold>

    //<editor-fold desc="AI">
    evaluateWindow(window, piece) {
        const opponent = piece === AI ? PLAYER : AI;
        const count = (value) => window.filter((v) => v === value).length;
        const pieces = count(piece);
        const empties = count(0);
        const opponents = count(opponent);

        if (pieces === 4) return 100;
        if (pieces === 3 && empties === 1) return 5;
        if (pieces === 2 && empties === 2) return 2;
        if (opponents === 3 && empties === 1) return -4;
        return 0;
    }

    scorePosition(board, piece) {
        let score = 0;
        const centerCol = Math.floor(COLS / 2);
        for (let row = 0; row < ROWS; row++) if (board[row][centerCol] === piece) score += 3;

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS - 3; col++) {
                score += this.evaluateWindow(
                    [board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]], piece
                );
            }
        }
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS - 3; row++) {
                score += this.evaluateWindow(
                    [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]], piece
                );
            }
        }
        for (let row = 0; row < ROWS - 3; row++) {
            for (let col = 0; col < COLS - 3; col++) {
                score += this.evaluateWindow(
                    [board[row][col], board[row + 1][col + 1], board[row + 2][col + 2], board[row + 3][col + 3]], piece
                );
                score += this.evaluateWindow(
                    [board[row + 3][col], board[row + 2][col + 1], board[row + 1][col + 2], board[row][col + 3]], piece
                );
            }
        }
        return score;
    }

    minimax(board, depth, alpha, beta, maximizing) {
        const validCols = this.validColumns(board);
        const isTerminal = this.checkWin(board, AI) || this.checkWin(board, PLAYER) || validCols.length === 0;

        if (depth === 0 || isTerminal) {
            if (isTerminal) {
                if (this.checkWin(board, AI)) return [null, 1_000_000];
                if (this.checkWin(board, PLAYER)) return [null, -1_000_000];
                return [null, 0];
            }
            return [null, this.scorePosition(board, AI)];
        }

        let bestColumn = validCols[0];
        if (maximizing) {
            let value = -Infinity;
            for (const col of validCols) {
                const row = this.nextOpenRow(board, col);
                board[row][col] = AI;
                const score = this.minimax(board, depth - 1, alpha, beta, false)[1];
                board[row][col] = 0;
                if (score > value) { value = score; bestColumn = col; }
                alpha = Math.max(alpha, value);
                if (alpha >= beta) break;
            }
            return [bestColumn, value];
        }

        let value = Infinity;
        for (const col of validCols) {
            const row = this.nextOpenRow(board, col);
            board[row][col] = PLAYER;
            const score = this.minimax(board, depth - 1, alpha, beta, true)[1];
            board[row][col] = 0;
            if (score < value) { value = score; bestColumn = col; }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return [bestColumn, value];
    }

    playAiMove() {
        const [column] = this.minimax(this.board, AI_DEPTH, -Infinity, Infinity, true);
        if (column !== null && column !== undefined) this.dropDisc(column);
    }
    //</editor-fold>

    //<editor-fold desc="Update">
    update(gameTime) {
        const delta = gameTime.getDeltaTimeSeconds();

        if (Keyboard.keyDownOnce(Keys.M)) {
            this.audio.toggleMute();
            this.emit();
        }
        if (this.state === State.MENU || this.state === State.GAME_OVER) {
            if (Keyboard.keyDownOnce(Keys.ENTER) || Keyboard.keyDownOnce(Keys.R)) this.startGame();
        }

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        if (this.turn === AI) {
            this.aiTimer -= delta;
            if (this.aiTimer <= 0) this.playAiMove();
        } else {
            if (Keyboard.keyDownOnce(Keys.LEFT) || Keyboard.keyDownOnce(Keys.A)) {
                this.hoverColumn = Math.max(0, this.hoverColumn - 1);
            }
            if (Keyboard.keyDownOnce(Keys.RIGHT) || Keyboard.keyDownOnce(Keys.D)) {
                this.hoverColumn = Math.min(COLS - 1, this.hoverColumn + 1);
            }
            if (Keyboard.keyDownOnce(Keys.SPACE) || Keyboard.keyDownOnce(Keys.ENTER)) {
                this.dropDisc(this.hoverColumn);
            }
        }

        this.particles.update(delta);
    }
    //</editor-fold>

    //<editor-fold desc="Draw">
    draw(ctx) {
        this.drawFrame(ctx);
        if (this.state === State.PLAYING && this.turn === PLAYER) this.drawHoverMarker(ctx);
        if (this.board.length > 0) this.drawBoard(ctx);
        this.particles.draw(ctx);
        if (this.state !== State.MENU) this.drawHud(ctx);
    }

    drawFrame(ctx) {
        ctx.fillStyle = "rgba(13, 20, 36, 0.6)";
        const width = this.cell * COLS;
        const height = this.cell * ROWS;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(this.offsetX, this.offsetY, width, height, 10);
            ctx.fill();
        } else {
            ctx.fillRect(this.offsetX, this.offsetY, width, height);
        }
    }

    drawHoverMarker(ctx) {
        const x = this.offsetX + this.hoverColumn * this.cell + this.cell / 2;
        const y = this.offsetY - this.cell * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, this.cell * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(74, 222, 128, 0.5)";
        ctx.fill();
    }

    drawBoard(ctx) {
        const radius = this.cell * 0.38;
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const piece = this.board[row][col];
                const center = this.cellCenter(row, col);

                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
                if (piece === 0) {
                    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
                    ctx.lineWidth = 1.4;
                    ctx.stroke();
                    continue;
                }
                const color = piece === PLAYER ? "#4ade80" : "#f43f5e";
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.22;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.shadowColor = color;
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    }

    drawHud(ctx) {
        const pad = 18;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = "700 15px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`WIN STREAK ${this.winStreak}`, pad, pad);

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`BEST ${this.bestStreak}`, pad, pad + 22);

        if (this.state === State.PLAYING) {
            ctx.textAlign = "right";
            ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = this.turn === PLAYER ? "#4ade80" : "#f43f5e";
            ctx.fillText(this.turn === PLAYER ? "YOUR TURN" : "AI THINKING…", this.width - pad, pad);
        }
    }
    //</editor-fold>
}
