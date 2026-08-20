import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";
import { Quality } from "../framework/quality.js";
import { Sinusoidal } from "../framework/ease.js";

export const Palette = {
    player: "#4ade80",
    playerBullet: "#d9f99d",
    shield: "#38bdf8",
    seeker: "#f43f5e",
    drifter: "#fbbf24",
    splitter: "#a78bfa",
    turret: "#22d3ee",
    enemyBullet: "#fda4af",
    pickup: "#f0abfc",
    wall: "#1e293b"
};

// Unit polygons, cached per side count. Every shape on screen is one of five
// or six of these, so the sines and cosines are worth computing once and
// scaling rather than recomputing per vertex per frame.
const UNIT_POLYGONS = new Map();

function unitPolygon(sides) {
    let points = UNIT_POLYGONS.get(sides);
    if (!points) {
        points = new Float32Array(sides * 2);
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            points[i * 2] = Math.cos(angle);
            points[i * 2 + 1] = Math.sin(angle);
        }
        UNIT_POLYGONS.set(sides, points);
    }
    return points;
}

/**
 * Traces a regular polygon. Every entity in the game is drawn from one.
 */
export function polygonPath(ctx, x, y, radius, sides, rotation = 0) {
    const points = unitPolygon(sides);
    // One rotation applied to the cached unit shape, instead of a cos and a
    // sin per corner.
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const ux = points[i * 2];
        const uy = points[i * 2 + 1];
        const px = x + (ux * cos - uy * sin) * radius;
        const py = y + (ux * sin + uy * cos) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

/**
 * Strokes a shape with a glow. Kept in one place so the whole game shares a
 * single visual language — and so the glow, which is the most expensive thing
 * canvas does per shape, can be turned down from one place when the quality
 * level drops.
 */
export function neonStroke(ctx, color, lineWidth = 2, glow = 12) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    const blur = Quality.glow(glow);
    if (blur > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.stroke();
        ctx.shadowBlur = 0;
        return;
    }
    ctx.stroke();
}

/**
 * Anything that lives in the arena: a position, a velocity and a radius used
 * for circle collision.
 */
export class Entity {
    constructor(x, y, radius) {
        this.position = new Vector2(x, y);
        this.velocity = new Vector2();
        this.radius = radius;
        this.rotation = 0;
        this.alive = true;
    }

    update(delta, world) {
        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
    }

    draw(ctx) {} // eslint-disable-line no-unused-vars

    collidesWith(other) {
        const reach = this.radius + other.radius;
        return this.position.distanceSquared(other.position) <= reach * reach;
    }

    /** Keeps the entity inside the arena, bouncing off the walls. */
    bounceInBounds(world, restitution = 1) {
        if (this.position.x < this.radius) {
            this.position.x = this.radius;
            this.velocity.x = Math.abs(this.velocity.x) * restitution;
        } else if (this.position.x > world.width - this.radius) {
            this.position.x = world.width - this.radius;
            this.velocity.x = -Math.abs(this.velocity.x) * restitution;
        }
        if (this.position.y < this.radius) {
            this.position.y = this.radius;
            this.velocity.y = Math.abs(this.velocity.y) * restitution;
        } else if (this.position.y > world.height - this.radius) {
            this.position.y = world.height - this.radius;
            this.velocity.y = -Math.abs(this.velocity.y) * restitution;
        }
    }
}

//<editor-fold desc="Player">

export const WEAPONS = {
    single: { name: "SINGLE", cooldown: 0.14, shots: 1, spread: 0, speed: 720, damage: 1 },
    rapid: { name: "RAPID", cooldown: 0.06, shots: 1, spread: 0.05, speed: 820, damage: 1 },
    triple: { name: "TRIPLE", cooldown: 0.18, shots: 3, spread: 0.22, speed: 700, damage: 1 },
    scatter: { name: "SCATTER", cooldown: 0.3, shots: 6, spread: 0.55, speed: 640, damage: 1 }
};

export class Player extends Entity {
    constructor(x, y) {
        super(x, y, 13);
        this.acceleration = 2600;
        this.maxSpeed = 380;
        this.friction = 0.86;

        this.lives = 3;
        this.invulnerable = 1.5;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.fireTimer = 0;

        this.weapon = WEAPONS.single;
        this.weaponTimer = 0;
        this.shield = 0;
        this.aim = new Vector2(1, 0);
        this.thrust = new Vector2();
    }

    /**
     * @param input movement direction, aim direction, firing and dash flags
     */
    update(delta, world, input) {
        this.invulnerable = Math.max(0, this.invulnerable - delta);
        this.dashCooldown = Math.max(0, this.dashCooldown - delta);
        this.dashTimer = Math.max(0, this.dashTimer - delta);
        this.fireTimer = Math.max(0, this.fireTimer - delta);
        this.shield = Math.max(0, this.shield - delta);

        if (this.weaponTimer > 0) {
            this.weaponTimer -= delta;
            if (this.weaponTimer <= 0) this.weapon = WEAPONS.single;
        }

        this.thrust.set(input.move.x, input.move.y);
        if (input.aim.magnitudeSquared() > 0.0001) this.aim = input.aim.normalize();
        this.rotation = this.aim.angle();

        if (input.dash && this.dashCooldown <= 0 && this.thrust.magnitudeSquared() > 0.01) {
            this.dashTimer = 0.16;
            this.dashCooldown = 1.1;
            this.invulnerable = Math.max(this.invulnerable, 0.28);
            const direction = this.thrust.normalize();
            this.velocity = direction.multiply(1150);
            world.particles.cone(this.position, direction.negate(), Palette.shield, 22, 380, 0.5, 0.4, 2.5);
            world.shake(6);
        }

        const boosting = this.dashTimer > 0;
        if (!boosting) {
            // Scalar throughout: this is the one entity guaranteed to run every
            // single frame of every run.
            let pushX = this.thrust.x;
            let pushY = this.thrust.y;
            const thrustSquared = pushX * pushX + pushY * pushY;
            if (thrustSquared > 1) {
                const scale = 1 / Math.sqrt(thrustSquared);
                pushX *= scale;
                pushY *= scale;
            }
            const step = this.acceleration * delta;
            this.velocity.x += pushX * step;
            this.velocity.y += pushY * step;

            const speedSquared = this.velocity.x * this.velocity.x
                + this.velocity.y * this.velocity.y;
            if (speedSquared > this.maxSpeed * this.maxSpeed) {
                this.velocity.multiplySelf(this.maxSpeed / Math.sqrt(speedSquared));
            }
            // Exponential damping keeps the feel identical at any frame rate.
            this.velocity.multiplySelf(MathHelper.damping(this.friction, delta));
        }

        super.update(delta, world);

        // The arena walls stop the ship dead rather than bouncing it.
        this.position.x = MathHelper.clamp(this.position.x, this.radius, world.width - this.radius);
        this.position.y = MathHelper.clamp(this.position.y, this.radius, world.height - this.radius);

        if (Quality.trails && this.thrust.magnitudeSquared() > 0.05 && Math.random() < 0.7) {
            const length = this.thrust.magnitude();
            const backX = -this.thrust.x / length;
            const backY = -this.thrust.y / length;
            const angle = Math.atan2(backY, backX) + MathHelper.random(-0.28, 0.28);
            const speed = 190 * MathHelper.random(0.4, 1);
            world.particles.emitAt(
                this.position.x + backX * this.radius,
                this.position.y + backY * this.radius,
                Math.cos(angle) * speed, Math.sin(angle) * speed,
                Palette.player, 0.28 * MathHelper.random(0.7, 1.3), 2, 0.9
            );
        }

        if (input.firing && this.fireTimer <= 0) {
            this.fire(world);
            this.fireTimer = this.weapon.cooldown;
        }
    }

    fire(world) {
        const weapon = this.weapon;
        const baseAngle = this.aim.angle();
        const start = weapon.shots > 1 ? -weapon.spread * (weapon.shots - 1) / 2 : 0;

        for (let i = 0; i < weapon.shots; i++) {
            const angle = baseAngle + start + weapon.spread * i
                + MathHelper.random(-0.015, 0.015);
            const direction = Vector2.fromAngle(angle);
            const bullet = new Bullet(
                this.position.add(direction.multiply(this.radius + 4)),
                direction.multiply(weapon.speed).add(this.velocity.multiply(0.25)),
                Palette.playerBullet,
                weapon.damage,
                true
            );
            world.bullets.push(bullet);
        }

        world.particles.cone(this.position.add(this.aim.multiply(this.radius)), this.aim,
            Palette.playerBullet, 3, 260, 0.35, 0.18, 1.6);
        world.shake(weapon.shots > 3 ? 4 : 1.6);
        world.playSound("shoot");
    }

    /**
     * @returns true when the hit actually cost a life
     */
    takeHit(world) {
        if (this.invulnerable > 0 || this.dashTimer > 0) return false;
        if (this.shield > 0) {
            this.shield = 0;
            this.invulnerable = 1.2;
            world.particles.burst(this.position, Palette.shield, 40, 340, 0.7, 2.5);
            world.shake(14);
            world.playSound("shield");
            return false;
        }
        this.lives -= 1;
        this.invulnerable = 2;
        this.weapon = WEAPONS.single;
        this.weaponTimer = 0;
        world.particles.burst(this.position, Palette.player, 70, 460, 0.9, 3);
        world.shake(26);
        world.playSound("hurt");
        return true;
    }

    draw(ctx) {
        // Blink while the respawn grace period is running.
        if (this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0
            && this.dashTimer <= 0) {
            ctx.globalAlpha = 0.35;
        }

        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);

        // Hull: a dart pointing along the aim direction.
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.5, 0);
        ctx.lineTo(-this.radius * 0.9, this.radius * 0.85);
        ctx.lineTo(-this.radius * 0.45, 0);
        ctx.lineTo(-this.radius * 0.9, -this.radius * 0.85);
        ctx.closePath();
        neonStroke(ctx, this.dashTimer > 0 ? Palette.shield : Palette.player, 2.2, 16);

        ctx.restore();

        if (this.shield > 0) {
            const pulse = 1 + Math.sin(performance.now() / 120) * 0.06;
            polygonPath(ctx, this.position.x, this.position.y, this.radius * 1.9 * pulse, 12, 0);
            ctx.globalAlpha *= MathHelper.clamp(this.shield, 0, 1);
            neonStroke(ctx, Palette.shield, 1.6, 14);
            ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = 1;
    }
}

//</editor-fold>

//<editor-fold desc="Projectiles and pickups">

export class Bullet extends Entity {
    constructor(position, velocity, color, damage, fromPlayer) {
        super(position.x, position.y, fromPlayer ? 3.5 : 5);
        this.velocity = velocity;
        this.color = color;
        this.damage = damage;
        this.fromPlayer = fromPlayer;
        this.life = fromPlayer ? 1.4 : 4;
    }

    update(delta, world) {
        super.update(delta, world);
        this.life -= delta;
        if (this.life <= 0) this.alive = false;
        if (this.position.x < -20 || this.position.y < -20
            || this.position.x > world.width + 20 || this.position.y > world.height + 20) {
            this.alive = false;
        }
    }

    draw(ctx) {
        const tail = this.fromPlayer ? 0.022 : 0.03;
        ctx.beginPath();
        ctx.moveTo(this.position.x - this.velocity.x * tail,
            this.position.y - this.velocity.y * tail);
        ctx.lineTo(this.position.x, this.position.y);
        neonStroke(ctx, this.color, this.radius, 12);
    }
}

export const PICKUP_TYPES = ["rapid", "triple", "scatter", "shield", "life"];

export class Pickup extends Entity {
    constructor(x, y, type) {
        super(x, y, 11);
        this.type = type;
        this.life = 12;
        this.spin = MathHelper.random(-2, 2);
    }

    update(delta, world) {
        this.life -= delta;
        if (this.life <= 0) this.alive = false;
        this.rotation += this.spin * delta;

        // Drift toward the player once they are close, so pickups feel magnetic.
        const player = world.player;
        if (player && player.alive) {
            const dx = player.position.x - this.position.x;
            const dy = player.position.y - this.position.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < 140 * 140 && distanceSquared > 0) {
                const scale = 320 / Math.sqrt(distanceSquared);
                this.velocity.x += (dx * scale - this.velocity.x) * 0.12;
                this.velocity.y += (dy * scale - this.velocity.y) * 0.12;
            }
        }
        this.velocity.multiplySelf(MathHelper.damping(0.94, delta));
        super.update(delta, world);
        this.bounceInBounds(world, 0.6);
    }

    label() {
        switch (this.type) {
            case "rapid": return "R";
            case "triple": return "T";
            case "scatter": return "S";
            case "shield": return "O";
            default: return "+";
        }
    }

    draw(ctx) {
        // Blink out over the last two seconds of life.
        if (this.life < 2 && Math.floor(this.life * 8) % 2 === 0) ctx.globalAlpha = 0.3;
        const color = this.type === "life" ? Palette.player : Palette.pickup;
        polygonPath(ctx, this.position.x, this.position.y, this.radius, 6, this.rotation);
        neonStroke(ctx, color, 2, 14);

        ctx.fillStyle = color;
        ctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.label(), this.position.x, this.position.y + 0.5);
        ctx.globalAlpha = 1;
    }
}

//</editor-fold>

//<editor-fold desc="Enemies">

export class Enemy extends Entity {
    constructor(x, y, radius, health, score, color, sides) {
        super(x, y, radius);
        this.health = health;
        this.maxHealth = health;
        this.score = score;
        this.color = color;
        this.sides = sides;
        this.spin = MathHelper.random(-1.5, 1.5);
        this.hitFlash = 0;
        // Enemies fade in so nothing materialises on top of the player.
        this.spawnTimer = 0.55;
    }

    isSpawning() { return this.spawnTimer > 0; }

    update(delta, world) {
        if (this.spawnTimer > 0) {
            this.spawnTimer -= delta;
            return;
        }
        this.hitFlash = Math.max(0, this.hitFlash - delta * 4);
        this.rotation += this.spin * delta;
        this.behave(delta, world);
        super.update(delta, world);
    }

    behave(delta, world) {} // eslint-disable-line no-unused-vars

    damage(amount, world) {
        this.health -= amount;
        this.hitFlash = 1;
        if (this.health <= 0) {
            this.alive = false;
            this.onDeath(world);
            return true;
        }
        world.particles.burst(this.position, this.color, 5, 180, 0.3, 1.6);
        return false;
    }

    onDeath(world) {
        world.particles.burst(this.position, this.color, 26, 320, 0.7, 2.4);
        world.shake(7);
        world.playSound("pop");
    }

    /** Steering helper: accelerate toward a target, capped at maxSpeed. */
    seek(target, acceleration, maxSpeed, delta) {
        this.seekPoint(target.x, target.y, acceleration, maxSpeed, delta);
    }

    /**
     * The same steering in plain numbers. Runs for every enemy every frame, so
     * it works on the velocity in place rather than allocating the three
     * intermediate vectors the expression form would.
     */
    seekPoint(targetX, targetY, acceleration, maxSpeed, delta) {
        let dx = targetX - this.position.x;
        let dy = targetY - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            const step = (acceleration * delta) / distance;
            dx *= step;
            dy *= step;
            this.velocity.x += dx;
            this.velocity.y += dy;
        }

        const speedSquared = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
        if (speedSquared > maxSpeed * maxSpeed) {
            const scale = maxSpeed / Math.sqrt(speedSquared);
            this.velocity.x *= scale;
            this.velocity.y *= scale;
        }
    }

    draw(ctx) {
        if (this.spawnTimer > 0) {
            // Telegraph the spawn with a shrinking ring.
            const progress = 1 - this.spawnTimer / 0.55;
            polygonPath(ctx, this.position.x, this.position.y,
                this.radius * (2.6 - 1.6 * progress), this.sides, this.rotation);
            ctx.globalAlpha = progress * 0.8;
            neonStroke(ctx, this.color, 1.5, 10);
            ctx.globalAlpha = 1;
            return;
        }

        polygonPath(ctx, this.position.x, this.position.y, this.radius, this.sides, this.rotation);
        neonStroke(ctx, this.hitFlash > 0.2 ? "#ffffff" : this.color, 2, 14);

        // Inner ring doubles as a health gauge for the tougher enemies.
        if (this.maxHealth > 1) {
            const fill = this.health / this.maxHealth;
            polygonPath(ctx, this.position.x, this.position.y,
                this.radius * 0.45 * fill, this.sides, -this.rotation);
            neonStroke(ctx, this.color, 1.4, 8);
        }
    }
}

/** Charges straight at the player. */
export class Seeker extends Enemy {
    constructor(x, y, tier = 1) {
        super(x, y, 14, 1, 100, Palette.seeker, 3);
        this.maxSpeed = 150 + tier * 12;
        this.acceleration = 620 + tier * 30;
    }

    behave(delta, world) {
        const target = world.player.position;
        this.seekPoint(target.x, target.y, this.acceleration, this.maxSpeed, delta);
        this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
        this.velocity.multiplySelf(MathHelper.damping(0.98, delta));
    }

    draw(ctx) {
        if (this.isSpawning()) return super.draw(ctx);
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(-this.radius * 0.8, this.radius * 0.8);
        ctx.lineTo(-this.radius * 0.8, -this.radius * 0.8);
        ctx.closePath();
        neonStroke(ctx, this.hitFlash > 0.2 ? "#ffffff" : this.color, 2, 14);
        ctx.restore();
    }
}

/** Ricochets around the arena, ignoring the player entirely. */
export class Drifter extends Enemy {
    constructor(x, y, tier = 1) {
        super(x, y, 17, 2 + Math.floor(tier / 4), 150, Palette.drifter, 4);
        this.speed = 160 + tier * 8;
        this.velocity = Vector2.random(this.speed);
        this.spin = MathHelper.random(-2.5, 2.5);
    }

    behave(delta, world) {
        // Constant speed: the bounce should never bleed off momentum.
        const length = this.velocity.magnitude();
        if (length > 0) this.velocity.multiplySelf(this.speed / length);
        this.bounceInBounds(world, 1);
    }
}

/** Breaks into a pair of smaller seekers when destroyed. */
export class Splitter extends Enemy {
    constructor(x, y, tier = 1, generation = 0) {
        const radius = generation === 0 ? 22 : 13;
        super(x, y, radius, generation === 0 ? 4 : 1, generation === 0 ? 250 : 75,
            Palette.splitter, 6);
        this.generation = generation;
        this.tier = tier;
        this.maxSpeed = (generation === 0 ? 95 : 190) + tier * 8;
        this.acceleration = 400 + tier * 20;
        this.wobble = MathHelper.random(0, Math.PI * 2);
    }

    behave(delta, world) {
        this.wobble += delta * 2.2;
        // Sinusoidal easing gives the drift a lazy, organic sway.
        const sway = Sinusoidal.easeInOut(
            (this.wobble % (Math.PI * 2)) / (Math.PI * 2), -1, 2, 1
        );

        const target = world.player.position;
        let toPlayerX = target.x - this.position.x;
        let toPlayerY = target.y - this.position.y;
        const distance = Math.sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY) || 1;
        toPlayerX /= distance;
        toPlayerY /= distance;

        // Aim at a point ahead, pushed sideways by the sway.
        const offset = sway * 0.5;
        this.seekPoint(
            this.position.x + (toPlayerX - toPlayerY * offset) * 100,
            this.position.y + (toPlayerY + toPlayerX * offset) * 100,
            this.acceleration, this.maxSpeed, delta
        );
        this.velocity.multiplySelf(MathHelper.damping(0.985, delta));
    }

    onDeath(world) {
        super.onDeath(world);
        if (this.generation !== 0) return;
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 + MathHelper.random(0, 1);
            const spawn = this.position.add(Vector2.fromAngle(angle, this.radius));
            const child = new Splitter(spawn.x, spawn.y, this.tier, 1);
            child.velocity = Vector2.fromAngle(angle, 190);
            child.spawnTimer = 0.15;
            world.enemies.push(child);
        }
    }
}

/** Keeps its distance and fires aimed shots. */
export class Turret extends Enemy {
    constructor(x, y, tier = 1) {
        super(x, y, 16, 3, 200, Palette.turret, 5);
        this.tier = tier;
        this.maxSpeed = 90 + tier * 4;
        this.preferredRange = 260;
        this.fireTimer = MathHelper.random(0.8, 2);
        this.spin = 1.2;
    }

    behave(delta, world) {
        const target = world.player.position;
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const aimX = dx / distance;
        const aimY = dy / distance;

        // Close in when far, back off when close, strafe when comfortable.
        let steerX = aimX;
        let steerY = aimY;
        if (distance < this.preferredRange - 60) {
            steerX = -aimX;
            steerY = -aimY;
        } else if (distance <= this.preferredRange + 60) {
            steerX = -aimY;
            steerY = aimX;
        }

        const push = 380 * delta;
        this.velocity.x += steerX * push;
        this.velocity.y += steerY * push;
        const speedSquared = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
        if (speedSquared > this.maxSpeed * this.maxSpeed) {
            this.velocity.multiplySelf(this.maxSpeed / Math.sqrt(speedSquared));
        }
        this.velocity.multiplySelf(MathHelper.damping(0.97, delta));
        this.bounceInBounds(world, 0.4);

        this.fireTimer -= delta;
        if (this.fireTimer <= 0) {
            this.fireTimer = Math.max(0.65, 1.9 - this.tier * 0.06);
            const speed = 250 + this.tier * 6;
            const aim = new Vector2(aimX, aimY);
            world.bullets.push(new Bullet(
                new Vector2(
                    this.position.x + aimX * (this.radius + 3),
                    this.position.y + aimY * (this.radius + 3)
                ),
                new Vector2(aimX * speed, aimY * speed),
                Palette.enemyBullet, 1, false
            ));
            world.particles.cone(this.position, aim, Palette.enemyBullet, 4, 160, 0.4, 0.25, 1.5);
        }
    }
}

//</editor-fold>
