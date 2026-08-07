import { Game } from "../framework/game.js";
import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Keyboard, Keys, Mouse, MouseKeys } from "../framework/input.js";
import { Back, Exponential, Quadratic } from "../framework/ease.js";
import { ParticleSystem } from "./particles.js";
import { AudioBank } from "./audio.js";
import { TouchControls } from "./touch.js";
import {
    Palette, Player, Pickup, Seeker, Drifter, Splitter, Turret, WEAPONS, neonStroke, polygonPath
} from "./entities.js";

export const State = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    GAME_OVER: "gameover"
};

export const Mode = {
    SURVIVAL: "survival",
    TIME_ATTACK: "time_attack",
    ZEN: "zen"
};

/** Menu copy and per-mode tuning, kept together so a new mode is one entry. */
export const MODE_INFO = {
    [Mode.SURVIVAL]: {
        label: "Survival",
        tagline: "Clear waves of geometry. Dash through the gaps. Keep the combo alive.",
        timeLimit: Infinity,
        spawnScale: 1,
        intermissionScale: 1
    },
    [Mode.TIME_ATTACK]: {
        label: "Time Attack",
        tagline: "90 seconds on the clock. Waves come in fast — bank as much score as you can.",
        timeLimit: 90,
        spawnScale: 1.35,
        intermissionScale: 0.55
    },
    [Mode.ZEN]: {
        label: "Zen",
        tagline: "No lives to lose. Hits knock you back instead of costing a life — just play.",
        timeLimit: Infinity,
        spawnScale: 0.85,
        intermissionScale: 1
    }
};

const HIGH_SCORE_PREFIX = "vector-arena.highscore.";
const COMBO_WINDOW = 2.6;
const INTERMISSION = 2.4;

/**
 * Vector Arena: a wave based survival shooter built on the ported framework.
 */
export class Arena extends Game {
    constructor(canvas) {
        super(canvas, { backgroundColor: "#070b14" });

        this.particles = new ParticleSystem(1000);
        this.audio = new AudioBank();
        this.touch = new TouchControls(canvas);

        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.pickups = [];
        this.popups = [];

        this.state = State.MENU;
        this.listeners = new Set();

        this.mode = Mode.SURVIVAL;
        this.highScores = {};
        for (const mode of Object.keys(MODE_INFO)) this.highScores[mode] = Arena.loadHighScore(mode);

        this.score = 0;
        this.wave = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.multiplier = 1;
        this.modeTimeLeft = Infinity;
        this.timedOut = false;

        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.intermission = 0;
        this.bannerTime = Infinity;
        this.bannerText = "";

        this.shakeAmount = 0;
        this.hitFlash = 0;
        this.aim = new Vector2(1, 0);
        this.pointerAimed = false;
    }

    //<editor-fold desc="Framework hooks">
    initialize() {
        this.emit();
    }

    loadContent() {
        // Every visual is drawn from primitives, so there is nothing to fetch.
    }

    onResize(width, height) {
        // Keep everything inside the new bounds after an orientation change.
        for (const entity of this.allEntities()) {
            entity.position.x = MathHelper.clamp(entity.position.x, 0, width);
            entity.position.y = MathHelper.clamp(entity.position.y, 0, height);
        }
    }

    onWindowBlur() {
        super.onWindowBlur();
        this.touch.reset();
        if (this.state === State.PLAYING) this.pause();
    }
    //</editor-fold>

    get highScore() { return this.highScores[this.mode]; }

    //<editor-fold desc="State">
    /**
     * Chooses the mode a new game will start in. Only takes effect from the
     * menu; a run in progress keeps the mode it started with.
     */
    setMode(mode) {
        if (!MODE_INFO[mode] || this.state === State.PLAYING || this.state === State.PAUSED) return;
        if (this.mode === mode) return;
        this.mode = mode;
        this.emit();
    }

    /** Registers a listener notified whenever the game state changes. */
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
            modeTimeLeft: this.modeTimeLeft,
            timedOut: this.timedOut,
            wave: this.wave,
            lives: this.player ? this.player.lives : 0,
            muted: this.audio.muted
        };
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.emit();
    }

    startGame(mode = this.mode) {
        this.mode = MODE_INFO[mode] ? mode : Mode.SURVIVAL;
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies.length = 0;
        this.bullets.length = 0;
        this.pickups.length = 0;
        this.popups.length = 0;
        this.particles.clear();

        this.score = 0;
        this.wave = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.multiplier = 1;
        this.spawnQueue.length = 0;
        this.intermission = 0.9;
        this.shakeAmount = 0;
        this.hitFlash = 0;
        this.pointerAimed = false;
        this.modeTimeLeft = MODE_INFO[this.mode].timeLimit;
        this.timedOut = false;

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
        this.bannerText = "";
        if (this.score > this.highScores[this.mode]) {
            this.highScores[this.mode] = this.score;
            Arena.saveHighScore(this.mode, this.score);
        }
        this.playSound("over");
        this.setState(State.GAME_OVER);
    }

    static loadHighScore(mode) {
        try {
            return Number(window.localStorage.getItem(HIGH_SCORE_PREFIX + mode)) || 0;
        } catch (error) {
            // Private browsing modes can throw on storage access.
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

    //<editor-fold desc="World services used by entities">
    shake(amount) {
        this.shakeAmount = Math.min(this.shakeAmount + amount, 40);
    }

    playSound(name) {
        this.audio.play(name);
    }

    addScore(value, position) {
        const gained = Math.round(value * this.multiplier);
        this.score += gained;
        this.popups.push({
            position: position.copy(),
            text: `+${gained}`,
            life: 0.9,
            maxLife: 0.9
        });
    }

    registerKill(enemy) {
        this.addScore(enemy.score, enemy.position);
        this.combo += 1;
        this.comboTimer = COMBO_WINDOW;
        this.multiplier = MathHelper.clamp(1 + Math.floor(this.combo / 4), 1, 10);

        if (Math.random() < 0.11) this.dropPickup(enemy.position);
    }

    dropPickup(position) {
        const player = this.player;
        const pool = ["rapid", "triple", "scatter", "shield"];
        // Only offer an extra life when the player actually needs one.
        if (player && player.lives < 3) pool.push("life", "life");
        const type = pool[MathHelper.randomInt(0, pool.length - 1)];
        this.pickups.push(new Pickup(position.x, position.y, type));
    }

    allEntities() {
        const all = [...this.enemies, ...this.bullets, ...this.pickups];
        if (this.player) all.push(this.player);
        return all;
    }
    //</editor-fold>

    //<editor-fold desc="Waves">
    startWave() {
        this.wave += 1;
        const tier = this.wave;
        let budget = Math.round((4 + tier * 2.2) * MODE_INFO[this.mode].spawnScale);

        const catalogue = [
            { type: Seeker, cost: 1, from: 1 },
            { type: Drifter, cost: 2, from: 2 },
            { type: Turret, cost: 3, from: 4 },
            { type: Splitter, cost: 4, from: 6 }
        ].filter((entry) => tier >= entry.from);

        this.spawnQueue.length = 0;
        while (budget > 0) {
            const affordable = catalogue.filter((entry) => entry.cost <= budget);
            const choice = affordable[MathHelper.randomInt(0, affordable.length - 1)];
            this.spawnQueue.push(choice.type);
            budget -= choice.cost;
        }
        // Spawn the cheap fodder first so waves ramp up rather than front-load.
        this.spawnQueue.sort(() => Math.random() - 0.5);

        this.spawnTimer = 0;
        this.showBanner(`WAVE ${this.wave}`);
        this.playSound("wave");
        this.emit();
    }

    showBanner(text) {
        this.bannerText = text;
        this.bannerTime = 0;
    }

    /**
     * Picks a spawn point away from the player so nothing lands in their lap.
     */
    findSpawnPoint() {
        const margin = 60;
        let best = new Vector2(this.width / 2, this.height / 2);
        let bestDistance = -1;
        for (let attempt = 0; attempt < 12; attempt++) {
            const candidate = new Vector2(
                MathHelper.random(margin, this.width - margin),
                MathHelper.random(margin, this.height - margin)
            );
            const distance = this.player
                ? candidate.distanceSquared(this.player.position)
                : Infinity;
            if (distance > bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
            if (bestDistance > 260 * 260) break;
        }
        return best;
    }

    updateWaves(delta) {
        if (this.intermission > 0) {
            this.intermission -= delta;
            if (this.intermission <= 0) this.startWave();
            return;
        }

        if (this.spawnQueue.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const Type = this.spawnQueue.pop();
                const point = this.findSpawnPoint();
                this.enemies.push(new Type(point.x, point.y, this.wave));
                this.spawnTimer = MathHelper.random(0.28, 0.7);
            }
            return;
        }

        if (this.enemies.length === 0) {
            this.intermission = INTERMISSION * MODE_INFO[this.mode].intermissionScale;
            this.showBanner(`WAVE ${this.wave} CLEAR`);
        }
    }
    //</editor-fold>

    //<editor-fold desc="Input">
    gatherInput() {
        this.touch.update();

        const move = new Vector2();
        if (Keyboard.anyDown(Keys.W, Keys.UP)) move.y -= 1;
        if (Keyboard.anyDown(Keys.S, Keys.DOWN)) move.y += 1;
        if (Keyboard.anyDown(Keys.A, Keys.LEFT)) move.x -= 1;
        if (Keyboard.anyDown(Keys.D, Keys.RIGHT)) move.x += 1;

        let firing = Mouse.buttonDown(MouseKeys.LEFT) || Keyboard.keyDown(Keys.SPACE);
        let dash = Keyboard.keyDownOnce(Keys.SHIFT) || Keyboard.keyDownOnce(Keys.SHIFT_RIGHT);

        if (this.touch.move.magnitudeSquared() > 0) move.set(this.touch.move.x, this.touch.move.y);
        if (this.touch.aim.magnitudeSquared() > 0) {
            this.aim = this.touch.aim.normalize();
            this.pointerAimed = true;
        }
        if (this.touch.firing) firing = true;
        if (this.touch.consumeDash()) dash = true;

        if (!this.touch.firing) {
            if (Mouse.inside) {
                const toPointer = Mouse.getPosition().subtract(this.player.position);
                if (toPointer.magnitudeSquared() > 4) {
                    this.aim = toPointer.normalize();
                    this.pointerAimed = true;
                }
            } else if (!this.pointerAimed) {
                // Keyboard only players get a gentle assist toward the nearest threat.
                const target = this.nearestEnemy();
                if (target) {
                    this.aim = target.position.subtract(this.player.position).normalize();
                } else if (move.magnitudeSquared() > 0) {
                    this.aim = move.normalize();
                }
            }
        }

        return { move, aim: this.aim, firing, dash };
    }

    nearestEnemy() {
        let best = null;
        let bestDistance = Infinity;
        for (const enemy of this.enemies) {
            if (enemy.isSpawning()) continue;
            const distance = enemy.position.distanceSquared(this.player.position);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = enemy;
            }
        }
        return best;
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

        this.bannerTime += delta;
        this.shakeAmount = Math.max(0, this.shakeAmount - delta * 46);
        this.hitFlash = Math.max(0, this.hitFlash - delta * 3.5);

        if (this.state !== State.PLAYING) {
            // Keep the backdrop alive without advancing the simulation.
            if (this.state === State.MENU && Math.random() < delta * 1.6)
                this.spawnAmbientDrift();
            this.particles.update(delta);
            return;
        }

        if (this.mode === Mode.TIME_ATTACK && Number.isFinite(this.modeTimeLeft)) {
            this.modeTimeLeft = Math.max(0, this.modeTimeLeft - delta);
            if (this.modeTimeLeft <= 0) {
                this.timedOut = true;
                this.gameOver();
                return;
            }
        }

        this.updateWaves(delta);

        const input = this.gatherInput();
        this.player.update(delta, this, input);

        for (const enemy of this.enemies) enemy.update(delta, this);
        for (const bullet of this.bullets) bullet.update(delta, this);
        for (const pickup of this.pickups) pickup.update(delta, this);
        this.particles.update(delta);

        this.separateEnemies();
        this.resolveCollisions();

        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) {
                this.combo = 0;
                this.multiplier = 1;
            }
        }

        for (const popup of this.popups) {
            popup.life -= delta;
            popup.position.y -= 34 * delta;
        }

        this.enemies = this.enemies.filter((enemy) => enemy.alive);
        this.bullets = this.bullets.filter((bullet) => bullet.alive);
        this.pickups = this.pickups.filter((pickup) => pickup.alive);
        this.popups = this.popups.filter((popup) => popup.life > 0);

        if (this.player.lives <= 0) this.gameOver();
    }

    /**
     * Pushes overlapping enemies apart so a wave reads as a crowd of distinct
     * shapes rather than one stacked blob.
     */
    separateEnemies() {
        const enemies = this.enemies;
        for (let i = 0; i < enemies.length; i++) {
            const a = enemies[i];
            if (a.isSpawning()) continue;
            for (let j = i + 1; j < enemies.length; j++) {
                const b = enemies[j];
                if (b.isSpawning()) continue;

                const offset = b.position.subtract(a.position);
                const minimum = a.radius + b.radius;
                const distanceSquared = offset.magnitudeSquared();
                if (distanceSquared >= minimum * minimum) continue;

                const distance = Math.sqrt(distanceSquared);
                // Perfectly stacked spawns have no direction to push along.
                const direction = distance > 0.001
                    ? offset.divide(distance)
                    : Vector2.random();
                const push = direction.multiply((minimum - distance) * 0.5);
                a.position.subtractSelf(push);
                b.position.addSelf(push);
            }
        }
    }

    resolveCollisions() {
        const player = this.player;

        for (const bullet of this.bullets) {
            if (!bullet.alive) continue;

            if (bullet.fromPlayer) {
                for (const enemy of this.enemies) {
                    if (!enemy.alive || enemy.isSpawning()) continue;
                    if (!bullet.collidesWith(enemy)) continue;
                    bullet.alive = false;
                    this.particles.cone(bullet.position, bullet.velocity.normalize().negate(),
                        enemy.color, 6, 220, 0.8, 0.25, 1.8);
                    if (enemy.damage(bullet.damage, this)) this.registerKill(enemy);
                    break;
                }
            } else if (bullet.collidesWith(player)) {
                bullet.alive = false;
                this.damagePlayer();
            }
        }

        for (const enemy of this.enemies) {
            if (!enemy.alive || enemy.isSpawning()) continue;
            if (enemy.collidesWith(player)) {
                // Ramming is mutual: the enemy dies too, so a hit is never a
                // dead end even when the player is boxed in.
                if (this.damagePlayer()) {
                    enemy.alive = false;
                    enemy.onDeath(this);
                }
            }
        }

        for (const pickup of this.pickups) {
            if (!pickup.alive || !pickup.collidesWith(player)) continue;
            pickup.alive = false;
            this.applyPickup(pickup);
        }
    }

    /** @returns true when the player was actually hurt */
    damagePlayer() {
        if (this.mode === Mode.ZEN) {
            // Zen never costs a life: hits just knock the combo down and
            // grant a short breather, like a shield that never runs out.
            if (this.player.invulnerable > 0 || this.player.dashTimer > 0) return false;
            this.player.invulnerable = 1;
            this.particles.burst(this.player.position, Palette.shield, 30, 300, 0.6, 2.2);
            this.shake(10);
            this.playSound("shield");
            this.combo = 0;
            this.multiplier = 1;
            this.hitFlash = 0.6;
            this.emit();
            return false;
        }

        const hurt = this.player.takeHit(this);
        if (hurt) {
            this.combo = 0;
            this.multiplier = 1;
            this.hitFlash = 1;
            this.emit();
        }
        return hurt;
    }

    applyPickup(pickup) {
        const player = this.player;
        switch (pickup.type) {
            case "rapid":
            case "triple":
            case "scatter":
                player.weapon = WEAPONS[pickup.type];
                player.weaponTimer = 12;
                break;
            case "shield":
                player.shield = 14;
                break;
            case "life":
                player.lives = Math.min(player.lives + 1, 5);
                this.emit();
                break;
            default:
                break;
        }
        this.particles.burst(pickup.position, Palette.pickup, 26, 260, 0.6, 2);
        this.popups.push({
            position: pickup.position.copy(),
            text: pickup.type.toUpperCase(),
            life: 1.1,
            maxLife: 1.1
        });
        this.playSound("pickup");
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
        this.particles.draw(ctx);

        for (const pickup of this.pickups) pickup.draw(ctx);
        for (const enemy of this.enemies) enemy.draw(ctx);
        for (const bullet of this.bullets) bullet.draw(ctx);
        if (this.player && this.state !== State.MENU) this.player.draw(ctx);

        this.drawPopups(ctx);
        ctx.restore();

        if (this.state !== State.MENU) this.drawHud(ctx);
        this.drawBanner(ctx);
        this.touch.draw(ctx);

        if (this.hitFlash > 0) {
            ctx.globalAlpha = this.hitFlash * 0.25;
            ctx.fillStyle = Palette.seeker;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.globalAlpha = 1;
        }
    }

    drawArena(ctx) {
        const spacing = 64;
        ctx.strokeStyle = "rgba(56, 89, 148, 0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = spacing; x < this.width; x += spacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        for (let y = spacing; y < this.height; y += spacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(94, 234, 212, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, this.width - 2, this.height - 2);
    }

    drawPopups(ctx) {
        ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const popup of this.popups) {
            const fade = popup.life / popup.maxLife;
            ctx.globalAlpha = Quadratic.easeOut(1 - fade, 1, -1, 1);
            ctx.fillStyle = "#e2e8f0";
            ctx.fillText(popup.text, popup.position.x, popup.position.y);
        }
        ctx.globalAlpha = 1;
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
        if (this.mode === Mode.TIME_ATTACK) {
            const seconds = Math.ceil(this.modeTimeLeft);
            ctx.fillStyle = seconds <= 10 ? Palette.seeker : "#e2e8f0";
            ctx.fillText(`TIME ${seconds}s`, this.width - pad, pad);
        } else {
            ctx.fillText(`WAVE ${Math.max(this.wave, 1)}`, this.width - pad, pad);
        }

        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`ENEMIES ${this.enemies.length + this.spawnQueue.length}`,
            this.width - pad, pad + 22);

        // Lives, drawn as small copies of the ship. Zen has none to lose.
        if (this.player && this.mode !== Mode.ZEN) {
            for (let i = 0; i < this.player.lives; i++) {
                const x = pad + 9 + i * 22;
                const y = this.height - pad - 8;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(9, 0);
                ctx.lineTo(-6, 5.5);
                ctx.lineTo(-3, 0);
                ctx.lineTo(-6, -5.5);
                ctx.closePath();
                neonStroke(ctx, Palette.player, 1.6, 8);
                ctx.restore();
            }
        }

        this.drawStatusBars(ctx, pad);

        if (this.multiplier > 1) {
            const punch = Back.easeOut(
                MathHelper.clamp(COMBO_WINDOW - this.comboTimer, 0, 0.35), 0, 1, 0.35
            );
            ctx.save();
            ctx.translate(this.width / 2, pad + 14);
            ctx.scale(1 + (1 - punch) * 0.35, 1 + (1 - punch) * 0.35);
            ctx.textAlign = "center";
            ctx.font = "800 22px 'JetBrains Mono', ui-monospace, monospace";
            ctx.fillStyle = Palette.pickup;
            ctx.shadowColor = Palette.pickup;
            ctx.shadowBlur = 16;
            ctx.fillText(`x${this.multiplier}`, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();

            // Timer ring around the multiplier showing how long it survives.
            const remaining = MathHelper.clamp(this.comboTimer / COMBO_WINDOW, 0, 1);
            ctx.beginPath();
            ctx.arc(this.width / 2, pad + 22, 26, -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * remaining);
            ctx.strokeStyle = Palette.pickup;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    drawStatusBars(ctx, pad) {
        const player = this.player;
        if (!player) return;

        const bars = [];
        if (player.weaponTimer > 0)
            bars.push({ label: player.weapon.name, value: player.weaponTimer / 12, color: Palette.pickup });
        if (player.shield > 0)
            bars.push({ label: "SHIELD", value: player.shield / 14, color: Palette.shield });
        bars.push({
            label: "DASH",
            value: 1 - player.dashCooldown / 1.1,
            color: player.dashCooldown > 0 ? "#64748b" : Palette.player
        });

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.font = "600 10px 'JetBrains Mono', ui-monospace, monospace";

        bars.forEach((bar, index) => {
            // Sit clear of the sound and fullscreen buttons in the corner.
            const y = this.height - pad - 46 - index * 16;
            const width = 84;
            const x = this.width - pad - width;
            ctx.fillStyle = "#94a3b8";
            ctx.fillText(bar.label, x - 8, y);
            ctx.fillStyle = "rgba(148, 163, 184, 0.2)";
            ctx.fillRect(x, y - 3, width, 6);
            ctx.fillStyle = bar.color;
            ctx.fillRect(x, y - 3, width * MathHelper.clamp(bar.value, 0, 1), 6);
        });
    }

    drawBanner(ctx) {
        const duration = 1.8;
        if (!this.bannerText || this.bannerTime > duration) return;

        const time = this.bannerTime;
        // Slide in with an overshoot, then fade out with an exponential tail.
        const offset = Back.easeOut(Math.min(time, 0.6), 60, -60, 0.6);
        const alpha = time < duration - 0.6
            ? 1
            : Exponential.easeIn(time - (duration - 0.6), 1, -1, 0.6);

        ctx.save();
        ctx.globalAlpha = MathHelper.clamp(alpha, 0, 1);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const size = Math.round(MathHelper.clamp(this.width * 0.06, 26, 46));
        ctx.font = `800 ${size}px 'JetBrains Mono', ui-monospace, monospace`;
        ctx.fillStyle = "#e2e8f0";
        ctx.shadowColor = Palette.shield;
        ctx.shadowBlur = 24;
        ctx.fillText(this.bannerText, this.width / 2, this.height / 2 - 40 + offset);
        ctx.restore();
    }
    //</editor-fold>

    //<editor-fold desc="Menu backdrop">
    /**
     * Idle attract mode: a slow drift of shapes behind the menu so the canvas
     * is never a dead rectangle.
     */
    spawnAmbientDrift() {
        const point = new Vector2(
            MathHelper.random(0, this.width),
            MathHelper.random(0, this.height)
        );
        const colors = [Palette.seeker, Palette.drifter, Palette.splitter, Palette.turret];
        this.particles.burst(point, colors[MathHelper.randomInt(0, colors.length - 1)],
            10, 90, 1.6, 1.6);
    }
    //</editor-fold>
}

/** Draws the framework's easing curves; used by the mechanics panel. */
export function drawEasingPreview(canvas, easing) {
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Sample first so overshooting curves (Back, Elastic) fit inside the box.
    const samples = [];
    for (let i = 0; i <= width; i++) samples.push(easing(i / width, 0, 1, 1));
    const lowest = Math.min(...samples, 0);
    const highest = Math.max(...samples, 1);
    const span = highest - lowest || 1;
    const padding = 8;

    ctx.beginPath();
    samples.forEach((value, i) => {
        const y = height - padding - ((value - lowest) / span) * (height - padding * 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    });
    neonStroke(ctx, Palette.shield, 2, 10);
}
