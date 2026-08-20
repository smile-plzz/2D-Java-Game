import { MathHelper } from "../framework/mathhelper.js";
import { Quality } from "../framework/quality.js";

/**
 * A pooled particle system. Particles are drawn as short motion streaks, which
 * reads well against the vector art style and costs one line per particle.
 *
 * The pool is stored as parallel typed arrays rather than an array of objects:
 * a thousand live particles are then a handful of flat buffers the engine can
 * keep in cache, with no per particle object for the collector to trace. Live
 * particles are tracked by a dense index list, so update() and draw() walk only
 * what is actually alive and obtaining a free slot is a stack pop rather than a
 * scan over the whole pool.
 */

// Streaks are batched by colour, and within a colour by quantised alpha and
// line width, because those three are the only canvas state a streak needs and
// none of them can vary inside a single path. Six alpha steps and eight width
// steps are fine enough that the banding is invisible against the glow, and
// coarse enough that a full pool collapses into a few dozen draw calls.
const ALPHA_STEPS = 6;
const WIDTH_STEPS = 8;
const WIDTH_LIMIT = 4;
const BUCKETS_PER_COLOR = ALPHA_STEPS * WIDTH_STEPS;

export class ParticleSystem {
    constructor(capacity = 900) {
        this.capacity = capacity;

        this.positionX = new Float32Array(capacity);
        this.positionY = new Float32Array(capacity);
        this.velocityX = new Float32Array(capacity);
        this.velocityY = new Float32Array(capacity);
        this.life = new Float32Array(capacity);
        this.maxLife = new Float32Array(capacity);
        this.size = new Float32Array(capacity);
        this.drag = new Float32Array(capacity);
        this.colorIndex = new Int32Array(capacity);

        // Dense list of the slots currently alive, and a stack of the ones that
        // are not. Every slot is in exactly one of the two.
        this.active = new Int32Array(capacity);
        this.activeCount = 0;
        this.free = new Int32Array(capacity);
        for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
        this.freeCount = capacity;
        this.recycleCursor = 0;

        // Colours are interned so a particle carries an integer, not a string.
        this.colors = [];
        this.colorIds = new Map();

        this.buckets = [];
        this.usedBuckets = [];
    }

    //<editor-fold desc="Pool">
    colorId(color) {
        let id = this.colorIds.get(color);
        if (id === undefined) {
            id = this.colors.length;
            this.colors.push(color);
            this.colorIds.set(color, id);
        }
        return id;
    }

    /**
     * Grabs the next free slot, recycling a live one when the pool is full.
     */
    obtain() {
        if (this.freeCount > 0) {
            const slot = this.free[--this.freeCount];
            this.active[this.activeCount++] = slot;
            return slot;
        }
        // Full pool: steal from the live set, walking the cursor so the same
        // particle is not overwritten every time.
        if (this.activeCount === 0) return -1;
        this.recycleCursor = (this.recycleCursor + 1) % this.activeCount;
        return this.active[this.recycleCursor];
    }

    /**
     * Emits one particle. Kept on the original Vector2 signature; the numeric
     * variant below is what the hot paths use.
     */
    emit(position, velocity, color, life, size = 2, drag = 0.9) {
        return this.emitAt(position.x, position.y, velocity.x, velocity.y, color, life, size, drag);
    }

    emitAt(x, y, velocityX, velocityY, color, life, size = 2, drag = 0.9) {
        const slot = this.obtain();
        if (slot < 0) return slot;
        this.positionX[slot] = x;
        this.positionY[slot] = y;
        this.velocityX[slot] = velocityX;
        this.velocityY[slot] = velocityY;
        this.colorIndex[slot] = this.colorId(color);
        this.life[slot] = life;
        this.maxLife[slot] = life;
        this.size[slot] = size;
        this.drag[slot] = drag;
        return slot;
    }
    //</editor-fold>

    //<editor-fold desc="Emitters">
    /**
     * Ring of particles thrown outward from a point. The count is scaled by the
     * current quality level, so a struggling device thins the spray out rather
     * than dropping frames for it.
     */
    burst(position, color, count, speed, life = 0.6, size = 2) {
        const total = Quality.particles(count);
        for (let i = 0; i < total; i++) {
            const angle = Math.random() * Math.PI * 2;
            const magnitude = speed * MathHelper.random(0.35, 1);
            this.emitAt(
                position.x, position.y,
                Math.cos(angle) * magnitude, Math.sin(angle) * magnitude,
                color, life * MathHelper.random(0.6, 1.2), size, 0.86
            );
        }
    }

    /**
     * Particles thrown into a cone, used for thruster exhaust and impacts.
     */
    cone(position, direction, color, count, speed, spread = 0.6, life = 0.35, size = 2) {
        const base = Math.atan2(direction.y, direction.x);
        const total = Quality.particles(count);
        for (let i = 0; i < total; i++) {
            const angle = base + MathHelper.random(-spread, spread);
            const magnitude = speed * MathHelper.random(0.4, 1);
            this.emitAt(
                position.x, position.y,
                Math.cos(angle) * magnitude, Math.sin(angle) * magnitude,
                color, life * MathHelper.random(0.7, 1.3), size, 0.9
            );
        }
    }
    //</editor-fold>

    //<editor-fold desc="Simulation">
    update(delta) {
        const { active, life, positionX, positionY, velocityX, velocityY, drag } = this;

        for (let i = 0; i < this.activeCount; i++) {
            const slot = active[i];
            const remaining = life[slot] - delta;
            if (remaining <= 0) {
                // Swap the last live slot into this hole and shrink the list,
                // then re-test the index we just refilled.
                life[slot] = 0;
                active[i] = active[--this.activeCount];
                this.free[this.freeCount++] = slot;
                i -= 1;
                continue;
            }
            life[slot] = remaining;
            positionX[slot] += velocityX[slot] * delta;
            positionY[slot] += velocityY[slot] * delta;
            // Exponential drag so the streaks settle rather than fly forever.
            // MathHelper memoises this per frame, so the handful of distinct
            // drag coefficients cost a handful of pow calls between them.
            const damping = MathHelper.damping(drag[slot], delta);
            velocityX[slot] *= damping;
            velocityY[slot] *= damping;
        }

        if (this.activeCount > 0) this.recycleCursor %= this.activeCount;
    }
    //</editor-fold>

    //<editor-fold desc="Draw">
    bucket(key) {
        let bucket = this.buckets[key];
        if (bucket === undefined) {
            bucket = [];
            this.buckets[key] = bucket;
        }
        if (bucket.length === 0) this.usedBuckets.push(key);
        return bucket;
    }

    draw(ctx) {
        if (this.activeCount === 0) return;
        const { active, life, maxLife, size, colorIndex } = this;

        // Pass one: sort the live particles into buckets that share every piece
        // of canvas state a streak needs.
        for (let i = 0; i < this.activeCount; i++) {
            const slot = active[i];
            const fade = life[slot] / maxLife[slot];
            const alphaStep = Math.min(ALPHA_STEPS - 1, (fade * ALPHA_STEPS) | 0);
            const width = size[slot] * fade;
            const widthStep = Math.min(WIDTH_STEPS - 1, ((width / WIDTH_LIMIT) * WIDTH_STEPS) | 0);
            const key = colorIndex[slot] * BUCKETS_PER_COLOR + alphaStep * WIDTH_STEPS + widthStep;
            this.bucket(key).push(slot);
        }

        // Pass two: one state change and one path per bucket.
        ctx.lineCap = "round";
        const { positionX, positionY, velocityX, velocityY } = this;
        for (let b = 0; b < this.usedBuckets.length; b++) {
            const key = this.usedBuckets[b];
            const bucket = this.buckets[key];
            const local = key % BUCKETS_PER_COLOR;

            ctx.globalAlpha = ((local / WIDTH_STEPS | 0) + 1) / ALPHA_STEPS;
            ctx.strokeStyle = this.colors[(key / BUCKETS_PER_COLOR) | 0];
            ctx.lineWidth = ((local % WIDTH_STEPS) + 0.5) * (WIDTH_LIMIT / WIDTH_STEPS);

            ctx.beginPath();
            for (let i = 0; i < bucket.length; i++) {
                const slot = bucket[i];
                const x = positionX[slot];
                const y = positionY[slot];
                // Draw each particle as a streak along its own velocity.
                ctx.moveTo(x - velocityX[slot] * 0.02, y - velocityY[slot] * 0.02);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            bucket.length = 0;
        }

        this.usedBuckets.length = 0;
        ctx.globalAlpha = 1;
    }
    //</editor-fold>

    clear() {
        for (let i = 0; i < this.capacity; i++) this.free[i] = this.capacity - 1 - i;
        this.freeCount = this.capacity;
        this.activeCount = 0;
        this.recycleCursor = 0;
    }

    /** Number of particles currently alive; handy from the console. */
    get count() {
        return this.activeCount;
    }
}
