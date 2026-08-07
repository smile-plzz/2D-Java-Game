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

const HIGH_SCORE_KEY = "neon-2048.highscore";
const SIZE = 4;
const TILE_COLORS = {
    2: "#94a3b8", 4: "#a3e635", 8: "#4ade80", 16: "#34d399",
    32: "#38bdf8", 64: "#818cf8", 128: "#a78bfa", 256: "#c084fc",
    512: "#f0abfc", 1024: "#f472b6", 2048: "#fbbf24"
};

/**
 * Neon 2048: the sliding tile puzzle, drawn straight to canvas so it can
 * share the arcade's overlay chrome and framework port instead of a DOM
 * grid. Turn based — update() only reacts to key presses, one per frame.
 */
export class Game2048 extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(200);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.grid = [];
        this.score = 0;
        this.highScore = Game2048.loadHighScore();
        this.best = 0;
        this.moved = false;

        this.gridSize = 0;
        this.cell = 0;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

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
            if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? "right" : "left");
            else this.move(dy > 0 ? "down" : "up");
        });
    }

    //<editor-fold desc="Framework hooks">
    initialize() { this.emit(); }
    loadContent() {}

    onResize(width, height) {
        this.gridSize = Math.floor(Math.min(width, height) * 0.86);
        this.cell = this.gridSize / SIZE;
        this.gridOffsetX = (width - this.gridSize) / 2;
        this.gridOffsetY = (height - this.gridSize) / 2;
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
        return { score: this.score, highScore: this.highScore, best: this.best, muted: this.audio.muted };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame() {
        this.grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
        this.score = 0;
        this.best = 0;
        this.particles.clear();
        this.addRandomTile();
        this.addRandomTile();

        this.audio.ensureContext();
        this.setState(State.PLAYING);
    }

    gameOver() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            Game2048.saveHighScore(this.highScore);
        }
        this.audio.play("crash");
        this.setState(State.GAME_OVER);
    }

    static loadHighScore() {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
        } catch (error) {
            return 0;
        }
    }

    static saveHighScore(value) {
        try {
            window.localStorage.setItem(HIGH_SCORE_KEY, String(value));
        } catch (error) {
            // Losing the high score is not worth breaking the run over.
        }
    }
    //</editor-fold>

    //<editor-fold desc="Grid logic">
    addRandomTile() {
        const empty = [];
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                if (this.grid[y][x] === 0) empty.push({ x, y });
            }
        }
        if (empty.length === 0) return;
        const cell = empty[MathHelper.randomInt(0, empty.length - 1)];
        this.grid[cell.y][cell.x] = Math.random() < 0.9 ? 2 : 4;
    }

    /** Slides and merges one row (already ordered toward the target edge). */
    collapseLine(line) {
        const values = line.filter((v) => v !== 0);
        const result = [];
        let gained = 0;
        for (let i = 0; i < values.length; i++) {
            if (values[i] === values[i + 1]) {
                const merged = values[i] * 2;
                result.push(merged);
                gained += merged;
                if (merged === 2048) this.audio.play("wave");
                i++;
            } else {
                result.push(values[i]);
            }
        }
        while (result.length < line.length) result.push(0);
        return { result, gained };
    }

    move(direction) {
        if (this.state !== State.PLAYING) return;

        let changed = false;
        let gained = 0;

        const horizontal = direction === "left" || direction === "right";
        const reverse = direction === "right" || direction === "down";

        for (let i = 0; i < SIZE; i++) {
            let line = [];
            for (let j = 0; j < SIZE; j++) {
                line.push(horizontal ? this.grid[i][j] : this.grid[j][i]);
            }
            if (reverse) line.reverse();

            const { result, gained: lineGained } = this.collapseLine(line);
            gained += lineGained;
            if (reverse) result.reverse();

            for (let j = 0; j < SIZE; j++) {
                const value = result[j];
                const target = horizontal ? this.grid[i][j] : this.grid[j][i];
                if (target !== value) changed = true;
                if (horizontal) this.grid[i][j] = value;
                else this.grid[j][i] = value;
            }
        }

        if (!changed) return;

        this.score += gained;
        if (this.score > this.best) this.best = this.score;
        if (gained > 0) this.audio.play("eat");
        this.addRandomTile();
        this.emit();

        if (!this.hasMoves()) this.gameOver();
    }

    hasMoves() {
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                if (this.grid[y][x] === 0) return true;
                if (x < SIZE - 1 && this.grid[y][x] === this.grid[y][x + 1]) return true;
                if (y < SIZE - 1 && this.grid[y][x] === this.grid[y + 1][x]) return true;
            }
        }
        return false;
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

        if (this.state === State.PLAYING) {
            if (Keyboard.keyDownOnce(Keys.W) || Keyboard.keyDownOnce(Keys.UP)) this.move("up");
            else if (Keyboard.keyDownOnce(Keys.S) || Keyboard.keyDownOnce(Keys.DOWN)) this.move("down");
            else if (Keyboard.keyDownOnce(Keys.A) || Keyboard.keyDownOnce(Keys.LEFT)) this.move("left");
            else if (Keyboard.keyDownOnce(Keys.D) || Keyboard.keyDownOnce(Keys.RIGHT)) this.move("right");
        }

        this.particles.update(delta);
    }
    //</editor-fold>

    //<editor-fold desc="Draw">
    draw(ctx) {
        this.drawBoard(ctx);
        this.particles.draw(ctx);
        if (this.state !== State.MENU) this.drawHud(ctx);
    }

    drawBoard(ctx) {
        ctx.fillStyle = "rgba(13, 20, 36, 0.6)";
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(this.gridOffsetX, this.gridOffsetY, this.gridSize, this.gridSize, 12);
            ctx.fill();
        } else {
            ctx.fillRect(this.gridOffsetX, this.gridOffsetY, this.gridSize, this.gridSize);
        }

        if (this.grid.length === 0) return;

        const pad = this.cell * 0.08;
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const value = this.grid[y][x];
                const cx = this.gridOffsetX + x * this.cell;
                const cy = this.gridOffsetY + y * this.cell;

                ctx.beginPath();
                const rect = [cx + pad, cy + pad, this.cell - pad * 2, this.cell - pad * 2];
                if (ctx.roundRect) ctx.roundRect(...rect, 8);
                else ctx.rect(...rect);

                if (value === 0) {
                    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    continue;
                }

                const color = TILE_COLORS[value] || "#e2e8f0";
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.16;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.shadowColor = color;
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.fillStyle = "#e2e8f0";
                ctx.font = `700 ${Math.round(this.cell * (value >= 1000 ? 0.26 : 0.32))}px 'JetBrains Mono', ui-monospace, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(value), cx + this.cell / 2, cy + this.cell / 2 + 1);
            }
        }
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
    }
    //</editor-fold>
}
