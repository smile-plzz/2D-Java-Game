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
    BLITZ: "blitz",
    SHIELDS: "shields"
};

export const MODE_INFO = {
    [Mode.CLASSIC]: {
        label: "Classic",
        tagline: "Clear waves of asteroids. Break large rocks into smaller faster fragments.",
        startAsteroids: 4,
        hasShield: false,
        timeLimit: 0,
        blitzMultiplier: false
    },
    [Mode.BLITZ]: {
        label: "Blitz",
        tagline: "60-second score attack. Continuous asteroid storm with combo multipliers.",
        startAsteroids: 6,
        hasShield: false,
        timeLimit: 60,
        blitzMultiplier: true
    },
    [Mode.SHIELDS]: {
        label: "Shields",
        tagline: "Heavy asteroid belt with an overcharged energy shield and twin lasers.",
        startAsteroids: 7,
        hasShield: true,
        timeLimit: 0,
        blitzMultiplier: false
    }
};

const HIGH_SCORE_PREFIX = "neon-asteroids.highscore.";

const ASTEROID_CONFIG = {
    large: { radius: 38, speed: 65, score: 20, split: "medium", color: "#38bdf8" },
    medium: { radius: 22, speed: 110, score: 50, split: "small", color: "#f59e0b" },
    small: { radius: 12, speed: 170, score: 100, split: null, color: "#ec4899" }
};

export class AsteroidsGame extends Game {
    constructor(canvas) {
        super(canvas);

        this.audio = new AudioBank();
        this.particles = new ParticleSystem(1200);

        this.state = State.MENU;
        this.mode = Mode.CLASSIC;

        this.bestScores = {};
        for (const mode of Object.keys(MODE_INFO)) {
            this.bestScores[mode] = AsteroidsGame.loadBestScore(mode);
        }

        // Ship properties
        this.shipPos = new Vector2(this.width / 2, this.height / 2);
        this.shipVel = new Vector2(0, 0);
        this.shipAngle = -Math.PI / 2;
        this.shipRadius = 14;
        this.isThrusting = false;
        this.invulnerableTimer = 0;
        this.hyperspaceCooldown = 0;
        this.fireCooldown = 0;

        // Game progression
        this.score = 0;
        this.lives = 3;
        this.shield = 100;
        this.wave = 1;
        this.timeLeft = 0;
        this.combo = 1;
        this.comboTimer = 0;
        this.shakeAmount = 0;

        // Collections
        this.asteroids = [];
        this.bullets = [];
        this.floatingTexts = [];

        // Input state for touch/mouse
        this.touchTurning = 0;
        this.touchThrusting = false;
        this.touchFiring = false;

        this.setupTouchControls(canvas);
    }

    static loadBestScore(mode) {
        try {
            return parseInt(localStorage.getItem(HIGH_SCORE_PREFIX + mode) || "0", 10) || 0;
        } catch {
            return 0;
        }
    }

    static saveBestScore(mode, score) {
        try {
            localStorage.setItem(HIGH_SCORE_PREFIX + mode, String(score));
        } catch {
            // Storage unavailable
        }
    }

    get bestScore() {
        return this.bestScores[this.mode] || 0;
    }

    get rules() {
        return MODE_INFO[this.mode];
    }

    get stateData() {
        return {
            state: this.state,
            mode: this.mode,
            score: this.score,
            highScore: this.bestScore,
            lives: this.lives,
            shield: Math.round(this.shield),
            wave: this.wave,
            timeLeft: Math.ceil(this.timeLeft),
            combo: this.combo,
            isNewBest: this.score > this.bestScore,
            muted: this.audio.muted
        };
    }

    onStateChange(callback) {
        this.stateListener = callback;
    }

    emit() {
        if (this.stateListener) {
            this.stateListener(this.state, this.stateData);
        }
    }

    setState(newState) {
        this.state = newState;
        this.emit();
    }

    setMode(mode) {
        if (!MODE_INFO[mode]) return;
        this.mode = mode;
        this.emit();
    }

    setupTouchControls(canvas) {
        canvas.addEventListener("pointerdown", (e) => {
            if (this.state === State.MENU || this.state === State.GAME_OVER) {
                this.startGame();
                return;
            }
            if (this.state === State.PAUSED) {
                this.setState(State.PLAYING);
                return;
            }
            // In game: tap right side to shoot, tap left to thrust
            const rect = canvas.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width;
            if (relX > 0.5) {
                this.touchFiring = true;
                this.fireBullet();
            } else {
                this.touchThrusting = true;
            }
        });

        canvas.addEventListener("pointerup", () => {
            this.touchFiring = false;
            this.touchThrusting = false;
        });
    }

    startGame() {
        this.audio.ensureContext();
        this.score = 0;
        this.lives = 3;
        this.shield = 100;
        this.wave = 1;
        this.timeLeft = this.rules.timeLimit;
        this.combo = 1;
        this.comboTimer = 0;
        this.shakeAmount = 0;

        this.bullets = [];
        this.floatingTexts = [];
        this.particles.clear();

        this.resetShip();
        this.spawnAsteroidWave(this.rules.startAsteroids);

        this.audio.play("launch");
        this.setState(State.PLAYING);
    }

    resetShip() {
        this.shipPos = new Vector2(this.width / 2, this.height / 2);
        this.shipVel = new Vector2(0, 0);
        this.shipAngle = -Math.PI / 2;
        this.isThrusting = false;
        this.invulnerableTimer = 2.5;
        this.fireCooldown = 0;
    }

    spawnAsteroidWave(count) {
        this.asteroids = [];
        for (let i = 0; i < count; i++) {
            this.spawnAsteroid("large");
        }
    }

    spawnAsteroid(sizeKey, pos = null, inheritedVel = null) {
        const cfg = ASTEROID_CONFIG[sizeKey];
        let p = pos;
        if (!p) {
            // Spawn outside ship safe radius
            do {
                p = new Vector2(MathHelper.random(0, this.width), MathHelper.random(0, this.height));
            } while (this.shipPos.distance(p) < 180);
        }

        const angle = MathHelper.random(0, Math.PI * 2);
        const speed = cfg.speed * MathHelper.random(0.85, 1.25);
        let vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        if (inheritedVel) {
            vel = vel.add(inheritedVel.multiply(0.4));
        }

        // Jagged polygon points
        const numVertices = MathHelper.randomInt(8, 12);
        const offsets = [];
        for (let j = 0; j < numVertices; j++) {
            offsets.push(MathHelper.random(0.75, 1.25));
        }

        this.asteroids.push({
            pos: p,
            vel,
            size: sizeKey,
            radius: cfg.radius,
            score: cfg.score,
            color: cfg.color,
            split: cfg.split,
            spin: MathHelper.random(-1.8, 1.8),
            angle: MathHelper.random(0, Math.PI * 2),
            vertices: offsets
        });
    }

    fireBullet() {
        if (this.fireCooldown > 0) return;
        this.fireCooldown = 0.16;

        const forward = new Vector2(Math.cos(this.shipAngle), Math.sin(this.shipAngle));
        const bulletSpeed = 700;

        if (this.mode === Mode.SHIELDS) {
            // Twin lasers
            const perp = new Vector2(-Math.sin(this.shipAngle), Math.cos(this.shipAngle)).multiply(8);
            const p1 = this.shipPos.add(forward.multiply(this.shipRadius)).add(perp);
            const p2 = this.shipPos.add(forward.multiply(this.shipRadius)).subtract(perp);
            const vel = forward.multiply(bulletSpeed).add(this.shipVel.multiply(0.4));

            this.bullets.push({ pos: p1, vel, ttl: 0.95 });
            this.bullets.push({ pos: p2, vel, ttl: 0.95 });
        } else {
            const spawnPos = this.shipPos.add(forward.multiply(this.shipRadius + 2));
            const vel = forward.multiply(bulletSpeed).add(this.shipVel.multiply(0.4));
            this.bullets.push({ pos: spawnPos, vel, ttl: 1.05 });
        }

        this.audio.play("shoot");
    }

    hyperspace() {
        if (this.hyperspaceCooldown > 0) return;
        this.hyperspaceCooldown = 4.0;

        // Disappear particles
        this.particles.burst(this.shipPos, "#38bdf8", 20, 200, 0.45, 1.8);
        this.audio.play("shield");

        this.shipPos = new Vector2(
            MathHelper.random(50, this.width - 50),
            MathHelper.random(50, this.height - 50)
        );
        this.shipVel = new Vector2(0, 0);
        this.invulnerableTimer = 1.2;

        // Reappear particles
        this.particles.burst(this.shipPos, "#4ade80", 24, 220, 0.45, 1.8);
    }

    wrap(pos, margin = 20) {
        if (pos.x < -margin) pos.x = this.width + margin;
        else if (pos.x > this.width + margin) pos.x = -margin;
        if (pos.y < -margin) pos.y = this.height + margin;
        else if (pos.y > this.height + margin) pos.y = -margin;
    }

    shake(amount) {
        this.shakeAmount = Math.min(this.shakeAmount + amount, 30);
    }

    addScore(points, pos) {
        const earned = points * this.combo;
        this.score += earned;
        if (this.score > this.bestScore) {
            this.bestScores[this.mode] = this.score;
            AsteroidsGame.saveBestScore(this.mode, this.score);
        }

        this.floatingTexts.push({
            pos: new Vector2(pos.x, pos.y),
            text: this.combo > 1 ? `+${earned} (x${this.combo})` : `+${earned}`,
            color: this.combo > 1 ? "#f59e0b" : "#4ade80",
            ttl: 0.85
        });

        if (this.rules.blitzMultiplier) {
            this.combo = Math.min(this.combo + 1, 8);
            this.comboTimer = 2.4;
        }
        this.emit();
    }

    gameOver() {
        this.audio.play("crash");
        this.particles.burst(this.shipPos, "#f43f5e", 45, 340, 0.7, 2.5);
        this.shake(25);
        this.setState(State.GAME_OVER);
    }

    //<editor-fold desc="Update">
    update(gameTime) {
        const delta = gameTime.getDeltaTimeSeconds();

        if (Keyboard.keyDownOnce(Keys.M)) {
            this.audio.toggleMute();
            this.emit();
        }

        if (this.state === State.MENU || this.state === State.GAME_OVER) {
            if (Keyboard.keyDownOnce(Keys.ENTER) || Keyboard.keyDownOnce(Keys.SPACE)) {
                this.startGame();
            }
            this.particles.update(delta);
            return;
        }

        if (this.state === State.PLAYING && (Keyboard.keyDownOnce(Keys.P) || Keyboard.keyDownOnce(Keys.ESCAPE))) {
            this.setState(State.PAUSED);
            return;
        }

        if (this.state === State.PAUSED) {
            if (Keyboard.keyDownOnce(Keys.P) || Keyboard.keyDownOnce(Keys.ESCAPE) || Keyboard.keyDownOnce(Keys.ENTER)) {
                this.setState(State.PLAYING);
            }
            return;
        }

        // Timer in Blitz mode
        if (this.rules.timeLimit > 0) {
            this.timeLeft -= delta;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.gameOver();
                return;
            }
        }

        // Combo decay
        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) {
                this.combo = 1;
            }
        }

        // Screen shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount = Math.max(0, this.shakeAmount - delta * 45);
        }

        // Cooldowns
        if (this.fireCooldown > 0) this.fireCooldown -= delta;
        if (this.invulnerableTimer > 0) this.invulnerableTimer -= delta;
        if (this.hyperspaceCooldown > 0) this.hyperspaceCooldown -= delta;

        // Ship rotation
        const turnSpeed = 4.4;
        if (Keyboard.keyDown(Keys.LEFT) || Keyboard.keyDown(Keys.A)) {
            this.shipAngle -= turnSpeed * delta;
        }
        if (Keyboard.keyDown(Keys.RIGHT) || Keyboard.keyDown(Keys.D)) {
            this.shipAngle += turnSpeed * delta;
        }

        // Ship thrust
        this.isThrusting = Keyboard.keyDown(Keys.UP) || Keyboard.keyDown(Keys.W) || this.touchThrusting;
        if (this.isThrusting) {
            const thrust = 420;
            const forward = new Vector2(Math.cos(this.shipAngle), Math.sin(this.shipAngle));
            this.shipVel = this.shipVel.add(forward.multiply(thrust * delta));

            // Thruster particle exhaust
            const exhaustPos = this.shipPos.subtract(forward.multiply(this.shipRadius + 2));
            const spread = MathHelper.random(-0.35, 0.35);
            const exhaustAngle = this.shipAngle + Math.PI + spread;
            const exhaustVel = new Vector2(Math.cos(exhaustAngle) * 160, Math.sin(exhaustAngle) * 160);

            this.particles.burst(exhaustPos, "#38bdf8", 2, 60, 0.22, 1.2);
        }

        // Inertia drag dampening
        this.shipVel = this.shipVel.multiply(Math.pow(0.982, delta * 60));
        this.shipPos = this.shipPos.add(this.shipVel.multiply(delta));
        this.wrap(this.shipPos);

        // Shooting
        if (Keyboard.keyDown(Keys.SPACE) || this.touchFiring) {
            this.fireBullet();
        }

        // Hyperspace
        if (Keyboard.keyDownOnce(Keys.SHIFT) || Keyboard.keyDownOnce(Keys.H)) {
            this.hyperspace();
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.pos = b.pos.add(b.vel.multiply(delta));
            this.wrap(b.pos);
            b.ttl -= delta;
            if (b.ttl <= 0) {
                this.bullets.splice(i, 1);
            }
        }

        // Update asteroids
        for (const ast of this.asteroids) {
            ast.pos = ast.pos.add(ast.vel.multiply(delta));
            ast.angle += ast.spin * delta;
            this.wrap(ast.pos, ast.radius);
        }

        // Bullet vs Asteroid collision
        for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
            const b = this.bullets[bIdx];
            let bulletConsumed = false;

            for (let aIdx = this.asteroids.length - 1; aIdx >= 0; aIdx--) {
                const ast = this.asteroids[aIdx];
                if (b.pos.distance(ast.pos) <= ast.radius) {
                    bulletConsumed = true;
                    this.bullets.splice(bIdx, 1);

                    // Particle explosion
                    this.particles.burst(ast.pos, ast.color, Math.floor(ast.radius * 0.9), 190, 0.45, 1.8);
                    this.audio.play("pop");
                    this.shake(4);
                    this.addScore(ast.score, ast.pos);

                    // Split into smaller fragments
                    if (ast.split) {
                        this.spawnAsteroid(ast.split, new Vector2(ast.pos.x, ast.pos.y), ast.vel);
                        this.spawnAsteroid(ast.split, new Vector2(ast.pos.x, ast.pos.y), ast.vel);
                    }

                    this.asteroids.splice(aIdx, 1);
                    break;
                }
            }
            if (bulletConsumed) continue;
        }

        // Check wave progression or blitz respawning
        if (this.rules.blitzMultiplier) {
            if (this.asteroids.length < 5) {
                this.spawnAsteroid(MathHelper.randomChoice(["large", "medium"]));
            }
        } else if (this.asteroids.length === 0) {
            this.wave += 1;
            this.audio.play("wave");
            this.particles.burst(this.shipPos, "#4ade80", 35, 260, 0.6, 2.0);
            this.spawnAsteroidWave(this.rules.startAsteroids + this.wave - 1);
            this.emit();
        }

        // Ship vs Asteroid collision
        if (this.invulnerableTimer <= 0) {
            for (let i = 0; i < this.asteroids.length; i++) {
                const ast = this.asteroids[i];
                if (this.shipPos.distance(ast.pos) <= ast.radius + this.shipRadius - 4) {
                    if (this.mode === Mode.SHIELDS && this.shield > 20) {
                        // Shield absorbs impact
                        this.shield -= 35;
                        this.invulnerableTimer = 1.0;
                        this.audio.play("shield");
                        this.shake(12);
                        this.particles.burst(this.shipPos, "#38bdf8", 25, 200, 0.45, 2.0);
                        // Repel asteroid
                        const pushDir = ast.pos.subtract(this.shipPos).normalize();
                        ast.vel = pushDir.multiply(220);
                        this.emit();
                        break;
                    } else {
                        // Ship destroyed
                        this.lives -= 1;
                        this.emit();
                        if (this.lives <= 0) {
                            this.gameOver();
                            return;
                        } else {
                            this.audio.play("hurt");
                            this.particles.burst(this.shipPos, "#f43f5e", 35, 260, 0.6, 2.2);
                            this.shake(18);
                            this.resetShip();
                            break;
                        }
                    }
                }
            }
        }

        // Update floating scores
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.pos.y -= 38 * delta;
            ft.ttl -= delta;
            if (ft.ttl <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }

        this.particles.update(delta);
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

        this.drawBackgroundGrid(ctx);
        this.particles.draw(ctx);
        this.drawAsteroids(ctx);
        this.drawBullets(ctx);

        if (this.state === State.PLAYING || this.state === State.PAUSED) {
            this.drawShip(ctx);
        }

        this.drawFloatingTexts(ctx);
        ctx.restore();

        if (this.state !== State.MENU) {
            this.drawHud(ctx);
        }
    }

    drawBackgroundGrid(ctx) {
        ctx.strokeStyle = "rgba(30, 41, 59, 0.45)";
        ctx.lineWidth = 1;
        const spacing = 48;
        ctx.beginPath();
        for (let x = 0; x <= this.width; x += spacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        for (let y = 0; y <= this.height; y += spacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();
    }

    drawShip(ctx) {
        // Blinking if invulnerable
        if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
            return;
        }

        ctx.save();
        ctx.translate(this.shipPos.x, this.shipPos.y);
        ctx.rotate(this.shipAngle);

        // Ship triangle
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = Quality.glow(12);

        ctx.beginPath();
        ctx.moveTo(this.shipRadius + 4, 0);
        ctx.lineTo(-this.shipRadius, -this.shipRadius * 0.75);
        ctx.lineTo(-this.shipRadius * 0.5, 0);
        ctx.lineTo(-this.shipRadius, this.shipRadius * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Thruster flame
        if (this.isThrusting) {
            ctx.strokeStyle = "#f59e0b";
            ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
            ctx.shadowColor = "#f59e0b";
            ctx.beginPath();
            ctx.moveTo(-this.shipRadius * 0.5, -4);
            ctx.lineTo(-this.shipRadius - MathHelper.random(6, 14), 0);
            ctx.lineTo(-this.shipRadius * 0.5, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Shield bubble
        if (this.mode === Mode.SHIELDS && this.shield > 0) {
            ctx.strokeStyle = "rgba(74, 222, 128, 0.6)";
            ctx.fillStyle = "rgba(74, 222, 128, 0.08)";
            ctx.shadowColor = "#4ade80";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(0, 0, this.shipRadius + 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    drawAsteroids(ctx) {
        for (const ast of this.asteroids) {
            ctx.save();
            ctx.translate(ast.pos.x, ast.pos.y);
            ctx.rotate(ast.angle);

            ctx.strokeStyle = ast.color;
            ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
            ctx.lineWidth = 2;
            ctx.shadowColor = ast.color;
            ctx.shadowBlur = Quality.glow(10);

            const n = ast.vertices.length;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2;
                const r = ast.radius * ast.vertices[i];
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }
    }

    drawBullets(ctx) {
        ctx.fillStyle = "#ec4899";
        ctx.shadowColor = "#ec4899";
        ctx.shadowBlur = Quality.glow(10);

        for (const b of this.bullets) {
            ctx.beginPath();
            ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    drawFloatingTexts(ctx) {
        ctx.save();
        ctx.font = "700 13px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textAlign = "center";
        for (const ft of this.floatingTexts) {
            ctx.globalAlpha = Math.max(0, ft.ttl / 0.85);
            ctx.fillStyle = ft.color;
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 6;
            ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
        }
        ctx.restore();
    }

    drawHud(ctx) {
        const pad = 18;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = "700 16px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`SCORE ${this.score}`, pad, pad);

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";

        if (this.rules.blitzMultiplier) {
            ctx.fillText(`TIME ${Math.ceil(this.timeLeft)}s · COMBO x${this.combo}`, pad, pad + 24);
        } else if (this.mode === Mode.SHIELDS) {
            ctx.fillText(`WAVE ${this.wave} · SHIELD ${Math.max(0, Math.round(this.shield))}%`, pad, pad + 24);
        } else {
            ctx.fillText(`WAVE ${this.wave} · BEST ${this.bestScore}`, pad, pad + 24);
        }

        // Lives indicator on top right
        ctx.textAlign = "right";
        ctx.font = "600 14px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#38bdf8";
        let livesIcons = "";
        for (let l = 0; l < this.lives; l++) livesIcons += "▲ ";
        ctx.fillText(livesIcons.trim(), this.width - pad, pad);
    }
    //</editor-fold>
}
