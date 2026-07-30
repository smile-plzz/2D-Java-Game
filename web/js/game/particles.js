import { Vector2 } from "../framework/vector2.js";
import { MathHelper } from "../framework/mathhelper.js";

/**
 * A pooled particle system. Particles are drawn as short motion streaks, which
 * reads well against the vector art style and costs one line per particle.
 */
export class ParticleSystem {
    constructor(capacity = 900) {
        this.capacity = capacity;
        this.particles = [];
        for (let i = 0; i < capacity; i++) {
            this.particles.push({
                position: new Vector2(),
                velocity: new Vector2(),
                life: 0,
                maxLife: 1,
                size: 1,
                drag: 0.9,
                color: "#ffffff",
                active: false
            });
        }
        this.cursor = 0;
    }

    /**
     * Grabs the next free particle, recycling the oldest when the pool is full.
     */
    obtain() {
        for (let i = 0; i < this.capacity; i++) {
            const particle = this.particles[this.cursor];
            this.cursor = (this.cursor + 1) % this.capacity;
            if (!particle.active) return particle;
        }
        const fallback = this.particles[this.cursor];
        this.cursor = (this.cursor + 1) % this.capacity;
        return fallback;
    }

    emit(position, velocity, color, life, size = 2, drag = 0.9) {
        const particle = this.obtain();
        particle.position.set(position.x, position.y);
        particle.velocity.set(velocity.x, velocity.y);
        particle.color = color;
        particle.life = life;
        particle.maxLife = life;
        particle.size = size;
        particle.drag = drag;
        particle.active = true;
        return particle;
    }

    /**
     * Ring of particles thrown outward from a point.
     */
    burst(position, color, count, speed, life = 0.6, size = 2) {
        for (let i = 0; i < count; i++) {
            const direction = Vector2.random();
            const magnitude = speed * MathHelper.random(0.35, 1);
            this.emit(
                position,
                direction.multiply(magnitude),
                color,
                life * MathHelper.random(0.6, 1.2),
                size,
                0.86
            );
        }
    }

    /**
     * Particles thrown into a cone, used for thruster exhaust and impacts.
     */
    cone(position, direction, color, count, speed, spread = 0.6, life = 0.35, size = 2) {
        const base = direction.angle();
        for (let i = 0; i < count; i++) {
            const angle = base + MathHelper.random(-spread, spread);
            const magnitude = speed * MathHelper.random(0.4, 1);
            this.emit(
                position,
                Vector2.fromAngle(angle, magnitude),
                color,
                life * MathHelper.random(0.7, 1.3),
                size,
                0.9
            );
        }
    }

    update(delta) {
        for (const particle of this.particles) {
            if (!particle.active) continue;
            particle.life -= delta;
            if (particle.life <= 0) {
                particle.active = false;
                continue;
            }
            particle.position.x += particle.velocity.x * delta;
            particle.position.y += particle.velocity.y * delta;
            // Exponential drag so the streaks settle rather than fly forever.
            const damping = Math.pow(particle.drag, delta * 60);
            particle.velocity.x *= damping;
            particle.velocity.y *= damping;
        }
    }

    draw(ctx) {
        ctx.lineCap = "round";
        for (const particle of this.particles) {
            if (!particle.active) continue;
            const fade = particle.life / particle.maxLife;
            // Draw each particle as a streak along its own velocity.
            const tailX = particle.position.x - particle.velocity.x * 0.02;
            const tailY = particle.position.y - particle.velocity.y * 0.02;
            ctx.globalAlpha = fade;
            ctx.strokeStyle = particle.color;
            ctx.lineWidth = particle.size * fade;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(particle.position.x, particle.position.y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    clear() {
        for (const particle of this.particles) particle.active = false;
    }
}
