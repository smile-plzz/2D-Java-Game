import { Game } from "../framework/game.js";
import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys, Mouse } from "../framework/input.js";
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
    BLITZ: "blitz",
    MULTIBALL: "multiball"
};

/** Menu copy and per-mode tuning, kept together so a new mode is one entry. */
export const MODE_INFO = {
    [Mode.CLASSIC]: {
        label: "Classic",
        tagline: "You against a reflex-limited AI. First to seven takes it.",
        winScore: 7,
        balls: 1,
        serveSpeed: 320,
        maxSpeed: 720,
        rallyGain: 1.04,
        paddleHeight: 80,
        aiSpeed: 300
    },
    [Mode.BLITZ]: {
        label: "Blitz",
        tagline: "Shorter paddles, a faster serve and an AI that keeps up. First to five.",
        winScore: 5,
        balls: 1,
        serveSpeed: 430,
        maxSpeed: 900,
        rallyGain: 1.06,
        paddleHeight: 58,
        aiSpeed: 385
    },
    [Mode.MULTIBALL]: {
        label: "Multiball",
        tagline: "Three balls in play at once. Longer paddles, and a race to eleven.",
        winScore: 11,
        balls: 3,
        serveSpeed: 300,
        maxSpeed: 700,
        rallyGain: 1.03,
        paddleHeight: 94,
        aiSpeed: 330
    }
};

const HIGH_SCORE_PREFIX = "neon-pong.highscore.";
const BALL_RADIUS = 6;
const PADDLE_MARGIN = 26;

/**
 * Neon Pong: player versus a reflex-limited AI. Classic, Blitz and Multiball
 * all run through the same loop; MODE_INFO holds everything that differs.
 * Reuses the same framework port and HUD conventions as the rest of the arcade.
 */
export class PongGame extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(200);
        this.audio = new AudioBank();

        this.state = State.MENU;
        this.listeners = new Set();

        this.mode = Mode.CLASSIC;
        this.highScores = {};
        for (const mode of Object.keys(MODE_INFO)) {
            this.highScores[mode] = PongGame.loadHighScore(mode);
        }

        this.playerScore = 0;
        this.aiScore = 0;
        this.winner = null;

        this.paddleHeight = MODE_INFO[this.mode].paddleHeight;
        this.paddleWidth = 12;
        this.player = { y: 0 };
        this.ai = { y: 0 };
        // Every mode plays out of the same list; classic simply keeps one in it.
        this.balls = [];
        this.shakeAmount = 0;

        this.pointerY = null;
        canvas.addEventListener("pointermove", (event) => {
            // Mouse holds a cached box for this same canvas, so tracking the
            // paddle costs no layout work per pointer event.
            const rect = Mouse.getBounds();
            if (!rect || !rect.height) return;
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

    get highScore() { return this.highScores[this.mode]; }

    /** Tuning for the mode currently selected. */
    get rules() { return MODE_INFO[this.mode]; }

    //<editor-fold desc="State">
    /**
     * Chooses the mode the next match starts in. Only takes effect outside a
     * match; one in progress keeps the mode it started with.
     */
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
        for (const listener of this.listeners) listener(this.state, this.snapshot());
    }

    snapshot() {
        return {
            score: this.playerScore,
            opponentScore: this.aiScore,
            highScore: this.highScore,
            highScores: this.highScores,
            mode: this.mode,
            target: this.rules.winScore,
            winner: this.winner,
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
        this.playerScore = 0;
        this.aiScore = 0;
        this.winner = null;
        this.paddleHeight = this.rules.paddleHeight;
        this.player.y = (this.height - this.paddleHeight) / 2;
        this.ai.y = (this.height - this.paddleHeight) / 2;
        this.particles.clear();
        this.shakeAmount = 0;

        this.balls.length = 0;
        for (let i = 0; i < this.rules.balls; i++) {
            // Fan the serves out so a multiball opening does not stack three
            // balls on the same line.
            this.balls.push(this.serve(Math.random() < 0.5 ? 1 : -1, i / this.rules.balls));
        }

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
        if (this.playerScore > this.highScores[this.mode]) {
            this.highScores[this.mode] = this.playerScore;
            PongGame.saveHighScore(this.mode, this.playerScore);
        }
        this.audio.play(this.winner === "player" ? "wave" : "crash");
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

    //<editor-fold desc="Ball and scoring">
    /**
     * Builds a ball at the centre line heading toward one side.
     * @param spread 0 to 1, spacing several serves apart vertically
     */
    serve(direction, spread = 0) {
        const angle = MathHelper.random(-0.35, 0.35)
            + (spread - 0.5) * 0.9
            + (direction < 0 ? Math.PI : 0);
        return {
            position: new Vector2(this.width / 2, this.height / 2),
            velocity: Vector2.fromAngle(angle, this.rules.serveSpeed)
        };
    }

    /** Puts a ball that has just gone out back into play. */
    respawn(ball, direction) {
        const fresh = this.serve(direction, Math.random());
        ball.position.set(fresh.position.x, fresh.position.y);
        ball.velocity.set(fresh.velocity.x, fresh.velocity.y);
    }

    scorePoint(scorer, ball) {
        if (scorer === "player") this.playerScore += 1;
        else this.aiScore += 1;
        this.emit();

        const target = this.rules.winScore;
        if (this.playerScore >= target || this.aiScore >= target) {
            this.gameOver();
            return;
        }
        this.audio.play(scorer === "player" ? "eat" : "hurt");
        // The ball that went out is the one served back, so multiball keeps its
        // full complement without ever gaining one.
        this.respawn(ball, scorer === "player" ? -1 : 1);
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
        for (const ball of this.balls) {
            this.updateBall(ball, delta);
            // A point may have ended the match mid-list; stop simulating then.
            if (this.state !== State.PLAYING) break;
        }
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
        // target, so it is beatable without being trivial. With several balls
        // in play it tracks whichever one is arriving first.
        const speed = this.rules.aiSpeed;
        const threat = this.threateningBall();
        if (!threat) return;

        const target = threat.position.y - this.paddleHeight / 2;
        const diff = target - this.ai.y;
        if (Math.abs(diff) > 6) this.ai.y += Math.sign(diff) * speed * delta;
        this.ai.y = MathHelper.clamp(this.ai.y, 0, this.height - this.paddleHeight);
    }

    /** The incoming ball closest to the AI's own goal, or the nearest of any. */
    threateningBall() {
        let best = null;
        let bestDistance = Infinity;
        for (const ball of this.balls) {
            // An outgoing ball is not a threat while an incoming one exists.
            const distance = (this.width - ball.position.x)
                + (ball.velocity.x > 0 ? 0 : this.width);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = ball;
            }
        }
        return best;
    }

    updateBall(ball, delta) {
        ball.position.x += ball.velocity.x * delta;
        ball.position.y += ball.velocity.y * delta;

        if (ball.position.y < BALL_RADIUS) {
            ball.position.y = BALL_RADIUS;
            ball.velocity.y *= -1;
        } else if (ball.position.y > this.height - BALL_RADIUS) {
            ball.position.y = this.height - BALL_RADIUS;
            ball.velocity.y *= -1;
        }

        this.tryPaddleBounce(ball, PADDLE_MARGIN, this.player.y, 1);
        this.tryPaddleBounce(ball, this.width - PADDLE_MARGIN, this.ai.y, -1);

        if (ball.position.x < -20) this.scorePoint("ai", ball);
        else if (ball.position.x > this.width + 20) this.scorePoint("player", ball);
    }

    tryPaddleBounce(ball, paddleX, paddleY, facing) {
        const withinX = facing > 0
            ? ball.velocity.x < 0 && ball.position.x - BALL_RADIUS <= paddleX && ball.position.x > paddleX - 30
            : ball.velocity.x > 0 && ball.position.x + BALL_RADIUS >= paddleX && ball.position.x < paddleX + 30;
        if (!withinX) return;
        if (ball.position.y < paddleY || ball.position.y > paddleY + this.paddleHeight) return;

        const hitPoint = (ball.position.y - (paddleY + this.paddleHeight / 2)) / (this.paddleHeight / 2);
        const rules = this.rules;
        const speed = Math.min(ball.velocity.magnitude() * rules.rallyGain, rules.maxSpeed);
        const spread = MathHelper.clamp(hitPoint, -1, 1) * 0.9;
        const angle = (facing > 0 ? 0 : Math.PI) + spread;
        ball.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
        ball.position.x = facing > 0 ? paddleX + BALL_RADIUS + 0.5 : paddleX - BALL_RADIUS - 0.5;

        this.shakeAmount = 3;
        this.audio.play("paddle");
        this.particles.burst(ball.position, "#38bdf8", 10, 180, 0.4, 1.6);
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
            this.drawBalls(ctx);
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
        ctx.shadowBlur = Quality.glow(14);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, this.paddleWidth, this.paddleHeight, 5);
        else ctx.rect(x, y, this.paddleWidth, this.paddleHeight);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawBalls(ctx) {
        // The balls share every piece of state, so they share one path too.
        ctx.beginPath();
        for (const ball of this.balls) {
            ctx.moveTo(ball.position.x + BALL_RADIUS, ball.position.y);
            ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
        }
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#e2e8f0";
        ctx.shadowBlur = Quality.glow(12);
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
        ctx.fillText(`${this.rules.label.toUpperCase()} · FIRST TO ${this.rules.winScore}`,
            this.width / 2, 56);
    }
    //</editor-fold>
}
