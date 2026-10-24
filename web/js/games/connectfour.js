import { Game } from "../framework/game.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys, Mouse } from "../framework/input.js";
import { Quality } from "../framework/quality.js";
import { ParticleSystem } from "../game/particles.js";
import { AudioBank } from "../game/audio.js";
import {
    MessageType,
    validateC4Move,
    checkC4Win,
    isC4BoardFull
} from "../net/protocol.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    GAME_OVER: "gameover"
};

export const Mode = {
    CASUAL: "casual",
    STANDARD: "standard",
    EXPERT: "expert"
};

/**
 * Menu copy and per-mode tuning. Difficulty here is search depth plus a
 * blunder rate: a shallower search plays worse positionally, and the chance of
 * taking the second best column keeps the easier modes from feeling scripted.
 */
export const MODE_INFO = {
    [Mode.CASUAL]: {
        label: "Casual",
        tagline: "The AI looks two moves ahead and sometimes takes the second best column.",
        depth: 2,
        blunderChance: 0.25,
        thinkTime: 0.35
    },
    [Mode.STANDARD]: {
        label: "Standard",
        tagline: "Minimax with alpha-beta pruning, five plies deep. It will punish a loose column.",
        depth: 5,
        blunderChance: 0,
        thinkTime: 0.5
    },
    [Mode.EXPERT]: {
        label: "Expert",
        tagline: "Seven plies and no mercy. Take the centre early or don't bother.",
        depth: 7,
        blunderChance: 0,
        thinkTime: 0.6
    }
};

const HIGH_SCORE_PREFIX = "neon-connect-four.beststreak.";
const COLS = 7;
const ROWS = 6;
const PLAYER = 1;
const AI = 2;

/**
 * Neon Connect Four: player versus a minimax AI with alpha-beta pruning,
 * or 2-player peer-to-peer online multiplayer.
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

        // Multiplayer state
        this.isOnline = false;
        this.session = null;
        this.myRole = null; // 1 = host, 2 = guest
        this.rematchRequested = false;

        this.mode = Mode.STANDARD;
        this.bestStreaks = {};
        for (const mode of Object.keys(MODE_INFO)) {
            this.bestStreaks[mode] = ConnectFourGame.loadBestStreak(mode);
        }
        this.winStreak = 0;

        this.boardSize = { width: 0, height: 0 };
        this.cell = 0;
        this.offsetX = 0;
        this.offsetY = 0;

        canvas.addEventListener("pointermove", (event) => {
            // Mouse holds a cached box for this same canvas, so hovering a
            // column costs no layout work per pointer event.
            const rect = Mouse.getBounds();
            if (!rect || !rect.width) return;
            const x = ((event.clientX - rect.left) / rect.width) * this.width;
            this.hoverColumn = MathHelper.clamp(Math.floor((x - this.offsetX) / this.cell), 0, COLS - 1);
        });

        canvas.addEventListener("pointerdown", () => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) {
                if (this.isOnline) return;
                this.startGame();
                return;
            }
            if (this.state === State.PLAYING) {
                if (this.isOnline) {
                    if (this.turn === this.myRole) {
                        this.handlePlayerMove(this.hoverColumn);
                    }
                } else if (this.turn === PLAYER) {
                    this.dropDisc(this.hoverColumn);
                }
            }
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
            highScores: this.bestStreaks,
            mode: this.mode,
            winner: this.winner,
            muted: this.audio.muted,
            isOnline: this.isOnline,
            myRole: this.myRole,
            turn: this.turn
        };
    }

    get bestStreak() { return this.bestStreaks[this.mode]; }

    /** Tuning for the difficulty currently selected. */
    get rules() { return MODE_INFO[this.mode]; }

    /**
     * Chooses the difficulty the next game is played at. Only takes effect
     * outside a game; one in progress keeps the difficulty it started with.
     */
    setMode(mode) {
        if (!MODE_INFO[mode] || this.mode === mode) return;
        if (this.state === State.PLAYING) return;
        this.mode = mode;
        this.emit();
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame(mode = this.mode) {
        this.isOnline = false;
        this.mode = MODE_INFO[mode] ? mode : Mode.STANDARD;
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
                this.bestStreaks[this.mode] = this.winStreak;
                ConnectFourGame.saveBestStreak(this.mode, this.winStreak);
            }
        } else if (winner === "ai") {
            this.winStreak = 0;
        }
        this.emit();
        this.audio.play(winner === "player" ? "wave" : winner === "ai" ? "crash" : "pop");
        this.setState(State.GAME_OVER);
    }

    static loadBestStreak(mode) {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_PREFIX + mode)) || 0;
        } catch (error) {
            return 0;
        }
    }

    static saveBestStreak(mode, value) {
        try {
            window.localStorage.setItem(HIGH_SCORE_PREFIX + mode, String(value));
        } catch (error) {
            // Losing the streak is not worth breaking the run over.
        }
    }
    //</editor-fold>

    //<editor-fold desc="Multiplayer Online Mode">
    startOnlineMatch(session) {
        this.isOnline = true;
        this.session = session;
        this.myRole = session.role === "host" ? 1 : 2;
        this.rematchRequested = false;
        this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
        this.winner = null;
        this.particles.clear();
        this.audio.ensureContext();

        session.onMessage((msg) => this.handleNetworkMessage(msg));

        if (session.isHost) {
            // Host randomly picks who goes first
            this.turn = Math.random() < 0.5 ? 1 : 2;
            session.send(MessageType.C4_START, { firstTurn: this.turn });
            this.setState(State.PLAYING);
        } else {
            this.setState(State.PLAYING);
        }
        this.emit();
    }

    handleNetworkMessage(msg) {
        if (!this.isOnline) return;

        if (msg.t === MessageType.C4_START) {
            this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
            this.winner = null;
            this.turn = msg.firstTurn;
            this.setState(State.PLAYING);
            this.emit();
            return;
        }

        if (msg.t === MessageType.C4_MOVE && this.session && this.session.isHost) {
            // Host receives move from guest (role 2)
            const validation = validateC4Move(this.board, msg.col, 2, this.turn, this.winner);
            if (!validation.valid) return;

            const row = this.executeMove(msg.col, 2);
            if (row === -1) return;

            if (checkC4Win(this.board, 2)) {
                this.finishOnline("guest");
            } else if (isC4BoardFull(this.board)) {
                this.finishOnline("draw");
            } else {
                this.turn = 1;
            }

            this.session.send(MessageType.C4_STATE, {
                board: this.board,
                lastMove: { col: msg.col, row, piece: 2 },
                turn: this.turn,
                winner: this.winner
            });
            this.emit();
            return;
        }

        if (msg.t === MessageType.C4_STATE && this.session && this.session.isGuest) {
            // Guest receives authoritative state from host
            this.board = msg.board;
            if (msg.lastMove) {
                this.playMoveEffect(msg.lastMove.row, msg.lastMove.col, msg.lastMove.piece);
            }
            this.turn = msg.turn;
            if (msg.winner) {
                this.finishOnline(msg.winner);
            }
            this.emit();
            return;
        }

        if (msg.t === MessageType.REMATCH_REQUEST) {
            if (this.session && this.session.isHost) {
                // Opponent requested rematch: start new game and broadcast start
                this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
                this.winner = null;
                this.turn = Math.random() < 0.5 ? 1 : 2;
                this.session.send(MessageType.C4_START, { firstTurn: this.turn });
                this.setState(State.PLAYING);
                this.emit();
            }
        }
    }

    handlePlayerMove(col) {
        if (!this.isOnline || this.state !== State.PLAYING || this.winner !== null) return;
        if (this.turn !== this.myRole) return;

        if (this.session && this.session.isHost) {
            const validation = validateC4Move(this.board, col, 1, this.turn, this.winner);
            if (!validation.valid) return;

            const row = this.executeMove(col, 1);
            if (row === -1) return;

            if (checkC4Win(this.board, 1)) {
                this.finishOnline("host");
            } else if (isC4BoardFull(this.board)) {
                this.finishOnline("draw");
            } else {
                this.turn = 2;
            }

            this.session.send(MessageType.C4_STATE, {
                board: this.board,
                lastMove: { col, row, piece: 1 },
                turn: this.turn,
                winner: this.winner
            });
            this.emit();
        } else if (this.session && this.session.isGuest) {
            // Guest sends move to host for authoritative validation
            if (this.nextOpenRow(this.board, col) === -1) return;
            this.session.send(MessageType.C4_MOVE, { col });
        }
    }

    executeMove(col, piece) {
        const row = this.nextOpenRow(this.board, col);
        if (row === -1) return -1;
        this.board[row][col] = piece;
        this.playMoveEffect(row, col, piece);
        return row;
    }

    playMoveEffect(row, col, piece) {
        this.audio.play("paddle");
        this.particles.burst(
            this.cellCenter(row, col),
            piece === 1 ? "#4ade80" : "#f43f5e",
            12,
            160,
            0.4,
            1.6
        );
    }

    finishOnline(winner) {
        this.winner = winner;
        this.emit();
        const iWon = (winner === "host" && this.myRole === 1) || (winner === "guest" && this.myRole === 2);
        this.audio.play(iWon ? "wave" : winner === "draw" ? "pop" : "crash");
        this.setState(State.GAME_OVER);
    }

    requestRematch() {
        if (!this.isOnline || !this.session) return;
        if (this.session.isHost) {
            this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
            this.winner = null;
            this.turn = Math.random() < 0.5 ? 1 : 2;
            this.session.send(MessageType.C4_START, { firstTurn: this.turn });
            this.setState(State.PLAYING);
            this.emit();
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
            this.aiTimer = this.rules.thinkTime;
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
        return checkC4Win(board, piece);
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
        const rules = this.rules;
        const [column] = this.minimax(this.board, rules.depth, -Infinity, Infinity, true);
        let choice = column;

        if (rules.blunderChance > 0 && Math.random() < rules.blunderChance) {
            const alternatives = this.validColumns(this.board).filter((col) => col !== column);
            if (alternatives.length > 0) {
                choice = alternatives[MathHelper.randomInt(0, alternatives.length - 1)];
            }
        }

        if (choice !== null && choice !== undefined) this.dropDisc(choice);
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
            if (!this.isOnline && (Keyboard.keyDownOnce(Keys.ENTER) || Keyboard.keyDownOnce(Keys.R))) {
                this.startGame();
            }
        }

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        if (!this.isOnline && this.turn === AI) {
            this.aiTimer -= delta;
            if (this.aiTimer <= 0) this.playAiMove();
        } else if (this.isOnline ? (this.turn === this.myRole) : (this.turn === PLAYER)) {
            if (Keyboard.keyDownOnce(Keys.LEFT) || Keyboard.keyDownOnce(Keys.A)) {
                this.hoverColumn = Math.max(0, this.hoverColumn - 1);
            }
            if (Keyboard.keyDownOnce(Keys.RIGHT) || Keyboard.keyDownOnce(Keys.D)) {
                this.hoverColumn = Math.min(COLS - 1, this.hoverColumn + 1);
            }
            if (Keyboard.keyDownOnce(Keys.SPACE) || Keyboard.keyDownOnce(Keys.ENTER)) {
                if (this.isOnline) {
                    this.handlePlayerMove(this.hoverColumn);
                } else {
                    this.dropDisc(this.hoverColumn);
                }
            }
        }

        this.particles.update(delta);
    }
    //</editor-fold>

    //<editor-fold desc="Draw">
    draw(ctx) {
        this.drawFrame(ctx);
        const shouldDrawHover = this.state === State.PLAYING && (this.isOnline ? this.turn === this.myRole : this.turn === PLAYER);
        if (shouldDrawHover) this.drawHoverMarker(ctx);
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
        const color = this.isOnline
            ? (this.myRole === 1 ? "rgba(74, 222, 128, 0.5)" : "rgba(244, 63, 94, 0.5)")
            : "rgba(74, 222, 128, 0.5)";
        ctx.fillStyle = color;
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
                const color = piece === 1 ? "#4ade80" : "#f43f5e";
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.22;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.shadowColor = color;
                ctx.shadowBlur = Quality.glow(10);
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

        if (this.isOnline) {
            ctx.fillText("ONLINE MATCH", pad, pad);
            ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = "#94a3b8";
            const roleText = this.myRole === 1 ? "YOU: GREEN · OPPONENT: RED" : "YOU: RED · OPPONENT: GREEN";
            ctx.fillText(roleText, pad, pad + 22);

            if (this.state === State.PLAYING) {
                ctx.textAlign = "right";
                ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
                const isMyTurn = this.turn === this.myRole;
                ctx.fillStyle = isMyTurn ? "#4ade80" : "#f43f5e";
                ctx.fillText(isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN", this.width - pad, pad);
            }
        } else {
            ctx.fillText(`WIN STREAK ${this.winStreak}`, pad, pad);
            ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = "#94a3b8";
            ctx.fillText(`BEST ${this.bestStreak} · ${this.rules.label.toUpperCase()}`, pad, pad + 22);

            if (this.state === State.PLAYING) {
                ctx.textAlign = "right";
                ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
                ctx.fillStyle = this.turn === PLAYER ? "#4ade80" : "#f43f5e";
                ctx.fillText(this.turn === PLAYER ? "YOUR TURN" : "AI THINKING…", this.width - pad, pad);
            }
        }
    }
    //</editor-fold>
}
