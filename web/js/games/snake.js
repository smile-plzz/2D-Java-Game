import { Game } from "../framework/game.js";
import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys } from "../framework/input.js";
import { Quality } from "../framework/quality.js";
import { ParticleSystem } from "../game/particles.js";
import { AudioBank } from "../game/audio.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    GAME_OVER: "gameover"
};

export const Mode = {
    CLASSIC: "classic",
    WRAP: "wrap",
    MAZE: "maze"
};

/** Menu copy and per-mode tuning, kept together so a new mode is one entry. */
export const MODE_INFO = {
    [Mode.CLASSIC]: {
        label: "Classic",
        tagline: "Eat, grow, don't double back. The walls are lethal.",
        wrap: false,
        walls: 0,
        startInterval: 0.15,
        minInterval: 0.06,
        ramp: 0.003,
        foodScore: 10
    },
    [Mode.WRAP]: {
        label: "Wrap",
        tagline: "The edges tunnel through to the far side. Only your own tail can end this.",
        wrap: true,
        walls: 0,
        startInterval: 0.13,
        minInterval: 0.05,
        ramp: 0.0035,
        foodScore: 12
    },
    [Mode.MAZE]: {
        label: "Maze",
        tagline: "Blocks scattered through the arena. Thread between them — food never lands on one.",
        wrap: true,
        // Share of the grid given over to walls; scaled to whatever the screen
        // turns out to be, so a phone and a monitor play the same game.
        walls: 0.035,
        startInterval: 0.15,
        minInterval: 0.06,
        ramp: 0.003,
        foodScore: 15
    }
};

const HIGH_SCORE_PREFIX = "neon-snake.highscore.";
const CELL = 22;
const FOOD_COLOR = "#f0abfc";
const WALL_COLOR = "#64748b";

/**
 * Neon Snake: classic grid snake, built on the same framework port as
 * Vector Arena. Movement is stepped on its own timer so speed can change
 * independent of the render frame rate.
 */
export class SnakeGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(300);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.mode = Mode.CLASSIC;
        this.highScores = {};
        for (const mode of Object.keys(MODE_INFO)) {
            this.highScores[mode] = SnakeGame.loadHighScore(mode);
        }

        this.score = 0;
        this.walls = new Set();

        this.cols = 1;
        this.rows = 1;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

        this.snake = [];
        this.direction = new Vector2(1, 0);
        this.pendingDirections = [];
        this.food = new Vector2(0, 0);
        this.stepTimer = 0;
        this.stepInterval = MODE_INFO[this.mode].startInterval;

        this.shakeAmount = 0;
        this.eatPulse = 0;
        this.swipeStart = null;

        canvas.addEventListener("pointerdown", (event) => {
            this.swipeStart = { x: event.clientX, y: event.clientY };
        });
        canvas.addEventListener("pointerup", (event) => {
            if (!this.swipeStart) return;
            const dx = event.clientX - this.swipeStart.x;
            const dy = event.clientY - this.swipeStart.y;
            this.swipeStart = null;

            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
                if (this.state === State.MENU || this.state === State.GAME_OVER) this.startGame();
                return;
            }
            if (Math.abs(dx) > Math.abs(dy)) this.queueDirection(new Vector2(dx > 0 ? 1 : -1, 0));
            else this.queueDirection(new Vector2(0, dy > 0 ? 1 : -1));
        });
    }

    //<editor-fold desc="Framework hooks">
    initialize() { this.emit(); }
    loadContent() {}

    onResize(width, height) {
        this.cols = Math.max(6, Math.floor(width / CELL));
        this.rows = Math.max(6, Math.floor(height / CELL));
        this.gridOffsetX = (width - this.cols * CELL) / 2;
        this.gridOffsetY = (height - this.rows * CELL) / 2;
    }

    onWindowBlur() {
        super.onWindowBlur();
        this.swipeStart = null;
        if (this.state === State.PLAYING) this.pause();
    }
    //</editor-fold>

    get highScore() { return this.highScores[this.mode]; }

    //<editor-fold desc="State">
    /**
     * Chooses the mode the next run starts in. Only takes effect outside a run;
     * a game in progress keeps the mode it started with.
     */
    setMode(mode) {
        if (!MODE_INFO[mode] || this.mode === mode) return;
        if (this.state === State.PLAYING || this.state === State.PAUSED) return;
        this.mode = mode;
        this.emit();
    }

    /** Tuning for the mode currently selected. */
    get rules() { return MODE_INFO[this.mode]; }

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
            score: this.score,
            highScore: this.highScore,
            highScores: this.highScores,
            mode: this.mode,
            length: this.snake.length,
            muted: this.audio.muted
        };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame(mode = this.mode) {
        this.mode = MODE_INFO[mode] ? mode : Mode.CLASSIC;
        this.direction = new Vector2(1, 0);
        this.pendingDirections = [];

        const cx = Math.floor(this.cols / 2);
        const cy = Math.floor(this.rows / 2);
        this.snake = [
            new Vector2(cx - 1, cy),
            new Vector2(cx - 2, cy),
            new Vector2(cx - 3, cy)
        ];

        this.buildWalls();
        this.score = 0;
        this.stepInterval = this.rules.startInterval;
        this.stepTimer = this.stepInterval;
        this.shakeAmount = 0;
        this.eatPulse = 0;
        this.particles.clear();
        this.placeFood();

        this.audio.ensureContext();
        this.setState(State.PLAYING);
    }

    pause() {
        if (this.state !== State.PLAYING) return;
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
        if (this.state === State.PLAYING) this.pause();
        else if (this.state === State.PAUSED) this.resume();
    }

    gameOver() {
        if (this.score > this.highScores[this.mode]) {
            this.highScores[this.mode] = this.score;
            SnakeGame.saveHighScore(this.mode, this.score);
        }
        this.audio.play("crash");
        this.setState(State.GAME_OVER);
    }

    static loadHighScore(mode) {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_PREFIX + mode)) || 0;
        } catch (error) {
            return 0;
        }
    }

    static saveHighScore(mode, value) {
        try {
            window.localStorage.setItem(HIGH_SCORE_PREFIX + mode, String(value));
        } catch (error) {
            // Losing the high score is not worth breaking the run over.
        }
    }
    //</editor-fold>

    //<editor-fold desc="Walls">
    /**
     * Lays out the maze: short horizontal and vertical bars, none of them
     * within a few cells of where the snake starts, so the opening seconds are
     * never a coin flip. Cells are keyed by index rather than by object so a
     * lookup during a step is a single hash probe.
     */
    buildWalls() {
        this.walls.clear();
        const share = this.rules.walls;
        if (!share) return;

        const centerX = Math.floor(this.cols / 2);
        const centerY = Math.floor(this.rows / 2);
        const target = Math.round(this.cols * this.rows * share);

        let guard = target * 12;
        while (this.walls.size < target && guard-- > 0) {
            const horizontal = Math.random() < 0.5;
            const length = MathHelper.randomInt(2, 4);
            const x = MathHelper.randomInt(1, this.cols - 2);
            const y = MathHelper.randomInt(1, this.rows - 2);

            for (let i = 0; i < length; i++) {
                const cellX = horizontal ? x + i : x;
                const cellY = horizontal ? y : y + i;
                if (cellX >= this.cols - 1 || cellY >= this.rows - 1) break;
                // Leave the spawn corridor and the row the snake starts on clear.
                if (Math.abs(cellY - centerY) <= 1 && Math.abs(cellX - centerX) <= 6) continue;
                this.walls.add(this.cellKey(cellX, cellY));
            }
        }
    }

    cellKey(x, y) {
        return y * this.cols + x;
    }

    isWall(x, y) {
        return this.walls.has(this.cellKey(x, y));
    }
    //</editor-fold>

    //<editor-fold desc="Input">
    queueDirection(direction) {
        const last = this.pendingDirections[this.pendingDirections.length - 1] || this.direction;
        // Reject reversals and repeats so a fast double-tap can't fold the
        // snake back into its own neck.
        if (direction.x === -last.x && direction.y === -last.y) return;
        if (direction.x === last.x && direction.y === last.y) return;
        if (this.pendingDirections.length < 2) this.pendingDirections.push(direction);
    }

    gatherInput() {
        if (Keyboard.anyDown(Keys.W, Keys.UP)) this.queueDirection(new Vector2(0, -1));
        else if (Keyboard.anyDown(Keys.S, Keys.DOWN)) this.queueDirection(new Vector2(0, 1));
        else if (Keyboard.anyDown(Keys.A, Keys.LEFT)) this.queueDirection(new Vector2(-1, 0));
        else if (Keyboard.anyDown(Keys.D, Keys.RIGHT)) this.queueDirection(new Vector2(1, 0));
    }
    //</editor-fold>

    //<editor-fold desc="Update">
    update(gameTime) {
        const delta = gameTime.getDeltaTimeSeconds();

        if (Keyboard.keyDownOnce(Keys.M)) {
            this.audio.toggleMute();
            this.emit();
        }
        if (Keyboard.keyDownOnce(Keys.P) || Keyboard.keyDownOnce(Keys.ESCAPE)) this.togglePause();

        if (this.state === State.MENU || this.state === State.GAME_OVER) {
            if (Keyboard.keyDownOnce(Keys.ENTER) || Keyboard.keyDownOnce(Keys.R)) this.startGame();
        }

        this.shakeAmount = Math.max(0, this.shakeAmount - delta * 40);
        this.eatPulse = Math.max(0, this.eatPulse - delta * 3);

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        this.gatherInput();

        this.stepTimer -= delta;
        if (this.stepTimer <= 0) {
            this.stepTimer += this.stepInterval;
            this.step();
        }
        this.particles.update(delta);
    }

    step() {
        if (this.pendingDirections.length > 0) this.direction = this.pendingDirections.shift();

        const head = this.snake[0];
        const rules = this.rules;
        const next = new Vector2(head.x + this.direction.x, head.y + this.direction.y);

        if (rules.wrap) {
            // Leaving one edge arrives at the opposite one.
            next.x = MathHelper.wrap(next.x, 0, this.cols);
            next.y = MathHelper.wrap(next.y, 0, this.rows);
        } else if (next.x < 0 || next.y < 0 || next.x >= this.cols || next.y >= this.rows) {
            this.shakeAmount = 18;
            this.gameOver();
            return;
        }

        if (this.isWall(next.x, next.y)) {
            this.shakeAmount = 18;
            this.particles.burst(this.cellCenter(next), WALL_COLOR, 18, 220, 0.5, 2);
            this.gameOver();
            return;
        }

        for (let i = 0; i < this.snake.length - 1; i++) {
            if (this.snake[i].x === next.x && this.snake[i].y === next.y) {
                this.shakeAmount = 18;
                this.gameOver();
                return;
            }
        }

        this.snake.unshift(next);

        if (next.x === this.food.x && next.y === this.food.y) {
            this.score += rules.foodScore;
            this.eatPulse = 1;
            this.stepInterval = Math.max(rules.minInterval, this.stepInterval - rules.ramp);
            this.audio.play("eat");
            this.particles.burst(this.cellCenter(next), FOOD_COLOR, 16, 200, 0.5, 2);
            this.placeFood();
            this.emit();
        } else {
            this.snake.pop();
        }
    }

    placeFood() {
        // Bounded rather than a do..while: a nearly full board could otherwise
        // spin here forever looking for the last empty cell.
        for (let attempt = 0; attempt < 400; attempt++) {
            const x = MathHelper.randomInt(0, this.cols - 1);
            const y = MathHelper.randomInt(0, this.rows - 1);
            if (this.isWall(x, y)) continue;
            if (this.snake.some((segment) => segment.x === x && segment.y === y)) continue;
            this.food = new Vector2(x, y);
            return;
        }

        // Exhausted the random attempts: take the first free cell there is.
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.isWall(x, y)) continue;
                if (this.snake.some((segment) => segment.x === x && segment.y === y)) continue;
                this.food = new Vector2(x, y);
                return;
            }
        }
    }

    cellCenter(cell) {
        return new Vector2(
            this.gridOffsetX + cell.x * CELL + CELL / 2,
            this.gridOffsetY + cell.y * CELL + CELL / 2
        );
    }
    //</editor-fold>

    //<editor-fold desc="Draw">
    draw(ctx) {
        ctx.save();
        if (this.shakeAmount > 0) {
            ctx.translate(
                MathHelper.random(-this.shakeAmount, this.shakeAmount),
                MathHelper.random(-this.shakeAmount, this.shakeAmount)
            );
        }

        this.drawGrid(ctx);
        if (this.state !== State.MENU) {
            this.drawWalls(ctx);
            this.drawFood(ctx);
            this.drawSnake(ctx);
        }
        this.particles.draw(ctx);
        ctx.restore();

        if (this.state !== State.MENU) this.drawHud(ctx);
    }

    drawGrid(ctx) {
        ctx.strokeStyle = "rgba(56, 89, 148, 0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= this.cols; x++) {
            const px = this.gridOffsetX + x * CELL;
            ctx.moveTo(px, this.gridOffsetY);
            ctx.lineTo(px, this.gridOffsetY + this.rows * CELL);
        }
        for (let y = 0; y <= this.rows; y++) {
            const py = this.gridOffsetY + y * CELL;
            ctx.moveTo(this.gridOffsetX, py);
            ctx.lineTo(this.gridOffsetX + this.cols * CELL, py);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(94, 234, 212, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.gridOffsetX + 1, this.gridOffsetY + 1,
            this.cols * CELL - 2, this.rows * CELL - 2
        );
    }

    drawWalls(ctx) {
        if (this.walls.size === 0) return;
        // Every wall block is the same colour, so they share one fill and one
        // stroke: two draw calls for the whole maze.
        ctx.beginPath();
        for (const key of this.walls) {
            const x = this.gridOffsetX + (key % this.cols) * CELL;
            const y = this.gridOffsetY + Math.floor(key / this.cols) * CELL;
            ctx.rect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
        ctx.fillStyle = "rgba(100, 116, 139, 0.22)";
        ctx.fill();
        ctx.strokeStyle = WALL_COLOR;
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }

    drawSnake(ctx) {
        this.snake.forEach((segment, i) => {
            const x = this.gridOffsetX + segment.x * CELL;
            const y = this.gridOffsetY + segment.y * CELL;
            const pad = i === 0 ? 1.5 : 2.5;
            const color = i === 0 ? "#4ade80" : "#38bdf8";

            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, 5);
            else ctx.rect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = Quality.glow(i === 0 ? 14 : 8);
            ctx.stroke();
            ctx.shadowBlur = 0;
        });
    }

    drawFood(ctx) {
        const center = this.cellCenter(this.food);
        const pulse = 1 + Math.sin(performance.now() / 160) * 0.12 + this.eatPulse * 0.4;

        ctx.beginPath();
        ctx.arc(center.x, center.y, (CELL / 2 - 3) * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = FOOD_COLOR;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = FOOD_COLOR;
        ctx.shadowBlur = Quality.glow(16);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawHud(ctx) {
        const pad = 18;
        ctx.font = "700 15px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`SCORE ${this.score.toLocaleString()}`, pad, pad);

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`BEST ${Math.max(this.highScore, this.score).toLocaleString()}`, pad, pad + 22);

        ctx.textAlign = "right";
        ctx.font = "700 15px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`LENGTH ${this.snake.length}`, this.width - pad, pad);

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(this.rules.label.toUpperCase(), this.width - pad, pad + 22);
    }
    //</editor-fold>
}
