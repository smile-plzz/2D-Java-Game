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

const HIGH_SCORE_KEY = "neon-pong.highscore";
const WIN_SCORE = 7;
const BALL_RADIUS = 6;
const PADDLE_MARGIN = 26;

/**
 * Neon Pong: player versus a reflex-limited AI, first to seven. Reuses the
 * same framework port and HUD conventions as the other games in the arcade.
 */
export class PongGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(200);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.playerScore = 0;
        this.aiScore = 0;
        this.highScore = PongGame.loadHighScore();
        this.winner = null;

        this.paddleHeight = 80;
        this.paddleWidth = 12;
        this.player = { y: 0 };
        this.ai = { y: 0 };
        this.ball = { position: new Vector2(), velocity: new Vector2() };
        this.shakeAmount = 0;

        this.pointerY = null;
        canvas.addEventListener("pointermove", (event) => {
            const rect = canvas.getBoundingClientRect();
            this.pointerY = ((event.clientY - rect.top) / rect.height) * this.height;
        });
        canvas.addEventListener("pointerdown", () => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) this.startGame();
        });
    }

    //<editor-fold desc="Framework hooks">
    initialize() { this.emit(); }
    loadContent() {}

    onResize(width, height) {
        this.player.y = MathHelper.clamp(this.player.y, 0, height - this.paddleHeight);
        this.ai.y = MathHelper.clamp(this.ai.y, 0, height - this.paddleHeight);
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
            score: this.playerScore,
            opponentScore: this.aiScore,
            highScore: this.highScore,
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
        this.playerScore = 0;
        this.aiScore = 0;
        this.winner = null;
        this.player.y = (this.height - this.paddleHeight) / 2;
        this.ai.y = (this.height - this.paddleHeight) / 2;
        this.particles.clear();
        this.shakeAmount = 0;
        this.resetBall(Math.random() < 0.5 ? 1 : -1);

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
        this.winner = this.playerScore > this.aiScore ? "player" : "ai";
        if (this.playerScore > this.highScore) {
            this.highScore = this.playerScore;
            PongGame.saveHighScore(this.highScore);
        }
        this.audio.play(this.winner === "player" ? "wave" : "crash");
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

    //<editor-fold desc="Ball and scoring">
    resetBall(direction) {
        this.ball.position = new Vector2(this.width / 2, this.height / 2);
        const angle = MathHelper.random(-0.35, 0.35) + (direction < 0 ? Math.PI : 0);
        this.ball.velocity = Vector2.fromAngle(angle, 320);
    }

    scorePoint(scorer) {
        if (scorer === "player") this.playerScore += 1;
        else this.aiScore += 1;
        this.emit();

        if (this.playerScore >= WIN_SCORE || this.aiScore >= WIN_SCORE) {
            this.gameOver();
            return;
        }
        this.audio.play(scorer === "player" ? "eat" : "hurt");
        this.resetBall(scorer === "player" ? -1 : 1);
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

        if (this.state !== State.PLAYING) {
            this.particles.update(delta);
            return;
        }

        this.movePlayer(delta);
        this.moveAi(delta);
        this.updateBall(delta);
        this.particles.update(delta);
    }

    movePlayer(delta) {
        const speed = 620;
        if (this.pointerY !== null) {
            this.player.y = MathHelper.clamp(this.pointerY - this.paddleHeight / 2, 0, this.height - this.paddleHeight);
        }
        if (Keyboard.anyDown(Keys.W, Keys.UP)) this.player.y -= speed * delta;
        if (Keyboard.anyDown(Keys.S, Keys.DOWN)) this.player.y += speed * delta;
        this.player.y = MathHelper.clamp(this.player.y, 0, this.height - this.paddleHeight);
    }

    moveAi(delta) {
        // Deliberately slower than the player and aimed at a slightly stale
        // target, so it is beatable without being trivial.
        const speed = 300;
        const target = this.ball.position.y - this.paddleHeight / 2;
        const current = this.ai.y;
        const diff = target - current;
        if (Math.abs(diff) > 6) this.ai.y += Math.sign(diff) * speed * delta;
        this.ai.y = MathHelper.clamp(this.ai.y, 0, this.height - this.paddleHeight);
    }

    updateBall(delta) {
        const ball = this.ball;
        ball.position.addSelf(ball.velocity.multiply(delta));

        if (ball.position.y < BALL_RADIUS) {
            ball.position.y = BALL_RADIUS;
            ball.velocity.y *= -1;
        } else if (ball.position.y > this.height - BALL_RADIUS) {
            ball.position.y = this.height - BALL_RADIUS;
            ball.velocity.y *= -1;
        }

        this.tryPaddleBounce(ball, PADDLE_MARGIN, this.player.y, 1);
        this.tryPaddleBounce(ball, this.width - PADDLE_MARGIN, this.ai.y, -1);

        if (ball.position.x < -20) this.scorePoint("ai");
        else if (ball.position.x > this.width + 20) this.scorePoint("player");
    }

    tryPaddleBounce(ball, paddleX, paddleY, facing) {
        const withinX = facing > 0
            ? ball.velocity.x < 0 && ball.position.x - BALL_RADIUS <= paddleX && ball.position.x > paddleX - 30
            : ball.velocity.x > 0 && ball.position.x + BALL_RADIUS >= paddleX && ball.position.x < paddleX + 30;
        if (!withinX) return;
        if (ball.position.y < paddleY || ball.position.y > paddleY + this.paddleHeight) return;

        const hitPoint = (ball.position.y - (paddleY + this.paddleHeight / 2)) / (this.paddleHeight / 2);
        const speed = Math.min(ball.velocity.magnitude() * 1.04, 720);
        const spread = MathHelper.clamp(hitPoint, -1, 1) * 0.9;
        const baseAngle = facing > 0 ? 0 : Math.PI;
        this.ball.velocity = Vector2.fromAngle(baseAngle + spread, speed);
        ball.position.x = facing > 0 ? paddleX + BALL_RADIUS + 0.5 : paddleX - BALL_RADIUS - 0.5;

        this.shakeAmount = 3;
        this.audio.play("paddle");
        this.particles.burst(ball.position.copy(), "#38bdf8", 10, 180, 0.4, 1.6);
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

        this.drawArena(ctx);
        if (this.state !== State.MENU) {
            this.drawPaddle(ctx, PADDLE_MARGIN - this.paddleWidth / 2, this.player.y, "#4ade80");
            this.drawPaddle(ctx, this.width - PADDLE_MARGIN - this.paddleWidth / 2, this.ai.y, "#f43f5e");
            this.drawBall(ctx);
        }
        this.particles.draw(ctx);
        ctx.restore();

        if (this.state !== State.MENU) this.drawHud(ctx);
    }

    drawArena(ctx) {
        ctx.strokeStyle = "rgba(94, 234, 212, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, this.width - 2, this.height - 2);

        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(this.width / 2, 0);
        ctx.lineTo(this.width / 2, this.height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawPaddle(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, this.paddleWidth, this.paddleHeight, 5);
        else ctx.rect(x, y, this.paddleWidth, this.paddleHeight);
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
        ctx.textBaseline = "top";
        ctx.font = "700 28px 'JetBrains Mono', ui-monospace, monospace";

        ctx.textAlign = "right";
        ctx.fillStyle = "#4ade80";
        ctx.fillText(String(this.playerScore), this.width / 2 - 24, 18);

        ctx.textAlign = "left";
        ctx.fillStyle = "#f43f5e";
        ctx.fillText(String(this.aiScore), this.width / 2 + 24, 18);

        ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText(`FIRST TO ${WIN_SCORE}`, this.width / 2, 56);
    }
    //</editor-fold>
}
