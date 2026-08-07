import { Game } from "../framework/game.js";
import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys } from "../framework/input.js";
import { ParticleSystem } from "../game/particles.js";
import { AudioBank } from "../game/audio.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    GAME_OVER: "gameover"
};

const HIGH_SCORE_KEY = "brick-breaker.highscore";
const ROW_COLORS = ["#f43f5e", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa"];
const BALL_RADIUS = 7;

/**
 * Brick Breaker: a paddle-and-ball arcade game on the same framework port
 * as Vector Arena. Levels regenerate a denser brick grid once cleared.
 */
export class BreakerGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(400);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.score = 0;
        this.highScore = BreakerGame.loadHighScore();
        this.level = 1;
        this.lives = 3;

        this.paddle = { x: 0, y: 0, width: 90, height: 12 };
        this.ball = { position: new Vector2(), velocity: new Vector2(), launched: false };
        this.bricks = [];
        this.shakeAmount = 0;

        this.pointerX = null;
        canvas.addEventListener("pointermove", (event) => {
            const rect = canvas.getBoundingClientRect();
            this.pointerX = ((event.clientX - rect.left) / rect.width) * this.width;
        });
        canvas.addEventListener("pointerdown", () => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) this.startGame();
            else if (this.state === State.PLAYING && !this.ball.launched) this.launchBall();
        });
    }

    //<editor-fold desc="Framework hooks">
    initialize() { this.emit(); }
    loadContent() {}

    onResize(width, height) {
        this.paddle.y = height - 34;
        this.paddle.x = MathHelper.clamp(this.paddle.x, 0, width - this.paddle.width);
    }

    onWindowBlur() {
        super.onWindowBlur();
        if (this.state === State.PLAYING) this.pause();
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
            score: this.score,
            highScore: this.highScore,
            level: this.level,
            lives: this.lives,
            muted: this.audio.muted
        };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.paddle.width = 90;
        this.paddle.x = (this.width - this.paddle.width) / 2;
        this.particles.clear();
        this.shakeAmount = 0;
        this.buildLevel();
        this.resetBall();

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
        if (this.score > this.highScore) {
            this.highScore = this.score;
            BreakerGame.saveHighScore(this.highScore);
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

    //<editor-fold desc="Level and ball">
    buildLevel() {
        const cols = 9;
        const rows = Math.min(3 + this.level, 7);
        const margin = 40;
        const gap = 6;
        const brickWidth = (this.width - margin * 2 - gap * (cols - 1)) / cols;
        const brickHeight = 16;

        this.bricks = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this.bricks.push({
                    x: margin + col * (brickWidth + gap),
                    y: 56 + row * (brickHeight + gap),
                    width: brickWidth,
                    height: brickHeight,
                    color: ROW_COLORS[row % ROW_COLORS.length],
                    score: (rows - row) * 10,
                    alive: true
                });
            }
        }
    }

    resetBall() {
        this.ball.launched = false;
        this.ball.position = new Vector2(this.width / 2, this.paddle.y - BALL_RADIUS - 2);
        this.ball.velocity = new Vector2(0, 0);
    }

    launchBall() {
        this.ball.launched = true;
        const speed = 360 + this.level * 12;
        const angle = MathHelper.random(-0.5, 0.5) - Math.PI / 2;
        this.ball.velocity = Vector2.fromAngle(angle, speed);
        this.audio.play("launch");
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
        if (this.state === State.PLAYING && !this.ball.launched
            && (Keyboard.keyDownOnce(Keys.SPACE) || Keyboard.keyDownOnce(Keys.ENTER))) {
            this.launchBall();
        }

        this.shakeAmount = Math.max(0, this.shakeAmount - delta * 40);

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        this.movePaddle(delta);
        if (!this.ball.launched) this.ball.position.x = this.paddle.x + this.paddle.width / 2;
        else this.updateBall(delta);

        this.particles.update(delta);
    }

    movePaddle(delta) {
        const speed = 620;
        if (this.pointerX !== null) {
            this.paddle.x = MathHelper.clamp(this.pointerX - this.paddle.width / 2, 0, this.width - this.paddle.width);
        }
        if (Keyboard.anyDown(Keys.A, Keys.LEFT)) this.paddle.x -= speed * delta;
        if (Keyboard.anyDown(Keys.D, Keys.RIGHT)) this.paddle.x += speed * delta;
        this.paddle.x = MathHelper.clamp(this.paddle.x, 0, this.width - this.paddle.width);
    }

    updateBall(delta) {
        const ball = this.ball;
        ball.position.addSelf(ball.velocity.multiply(delta));

        if (ball.position.x < BALL_RADIUS) {
            ball.position.x = BALL_RADIUS;
            ball.velocity.x *= -1;
        } else if (ball.position.x > this.width - BALL_RADIUS) {
            ball.position.x = this.width - BALL_RADIUS;
            ball.velocity.x *= -1;
        }
        if (ball.position.y < BALL_RADIUS) {
            ball.position.y = BALL_RADIUS;
            ball.velocity.y *= -1;
        }

        if (ball.velocity.y > 0
            && ball.position.y + BALL_RADIUS >= this.paddle.y
            && ball.position.y - BALL_RADIUS <= this.paddle.y + this.paddle.height
            && ball.position.x >= this.paddle.x
            && ball.position.x <= this.paddle.x + this.paddle.width) {
            // Where the ball lands on the paddle steers the bounce angle.
            const hitPoint = (ball.position.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2);
            const speed = ball.velocity.magnitude();
            const angle = MathHelper.clamp(hitPoint, -1, 1) * 1.1 - Math.PI / 2;
            ball.velocity = Vector2.fromAngle(angle, speed);
            ball.position.y = this.paddle.y - BALL_RADIUS - 0.5;
            this.audio.play("paddle");
        }

        for (const brick of this.bricks) {
            if (!brick.alive) continue;
            if (ball.position.x + BALL_RADIUS < brick.x || ball.position.x - BALL_RADIUS > brick.x + brick.width) continue;
            if (ball.position.y + BALL_RADIUS < brick.y || ball.position.y - BALL_RADIUS > brick.y + brick.height) continue;

            brick.alive = false;
            this.score += brick.score;
            this.shakeAmount = 4;
            this.audio.play("brick");
            this.particles.burst(
                new Vector2(brick.x + brick.width / 2, brick.y + brick.height / 2),
                brick.color, 14, 220, 0.5, 2
            );
            this.emit();

            // Reflect off whichever axis has the smaller overlap so corner
            // hits bounce the way they look like they should.
            const overlapX = Math.min(
                ball.position.x + BALL_RADIUS - brick.x,
                brick.x + brick.width - (ball.position.x - BALL_RADIUS)
            );
            const overlapY = Math.min(
                ball.position.y + BALL_RADIUS - brick.y,
                brick.y + brick.height - (ball.position.y - BALL_RADIUS)
            );
            if (overlapX < overlapY) ball.velocity.x *= -1;
            else ball.velocity.y *= -1;
            break;
        }

        if (this.bricks.every((brick) => !brick.alive)) {
            this.level += 1;
            this.buildLevel();
            this.resetBall();
            this.audio.play("wave");
            this.emit();
            return;
        }

        if (ball.position.y - BALL_RADIUS > this.height) {
            this.lives -= 1;
            this.emit();
            if (this.lives <= 0) {
                this.gameOver();
                return;
            }
            this.audio.play("hurt");
            this.resetBall();
        }
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

        ctx.strokeStyle = "rgba(94, 234, 212, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, this.width - 2, this.height - 2);

        if (this.state !== State.MENU) {
            this.drawBricks(ctx);
            this.drawPaddle(ctx);
            this.drawBall(ctx);
        }
        this.particles.draw(ctx);
        ctx.restore();

        if (this.state !== State.MENU) this.drawHud(ctx);
    }

    drawBricks(ctx) {
        for (const brick of this.bricks) {
            if (!brick.alive) continue;
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = brick.color;
            ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            ctx.globalAlpha = 1;

            ctx.strokeStyle = brick.color;
            ctx.lineWidth = 1.6;
            ctx.shadowColor = brick.color;
            ctx.shadowBlur = 8;
            ctx.strokeRect(brick.x + 1, brick.y + 1, brick.width - 2, brick.height - 2);
            ctx.shadowBlur = 0;
        }
    }

    drawPaddle(ctx) {
        ctx.fillStyle = "#4ade80";
        ctx.shadowColor = "#4ade80";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height, 6);
        else ctx.rect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawBall(ctx) {
        ctx.beginPath();
        ctx.arc(this.ball.position.x, this.ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#e2e8f0";
        ctx.shadowBlur = 12;
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
        ctx.fillText(`LEVEL ${this.level}`, this.width - pad, pad);

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`LIVES ${this.lives}`, this.width - pad, pad + 22);

        if (!this.ball.launched) {
            ctx.textAlign = "center";
            ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = "#94a3b8";
            ctx.fillText("CLICK OR SPACE TO LAUNCH", this.width / 2, this.paddle.y - 30);
        }
    }
    //</editor-fold>
}
