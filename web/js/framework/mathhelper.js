/**
 * Collection of common math operations used throughout the framework.
 * JavaScript port of game.framework.MathHelper.
 */
export const MathHelper = {
    /**
     * Clamps a value between a minimum and maximum.
     */
    clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    },

    /**
     * Dot product of two equal length arrays.
     */
    dotProduct(a, b) {
        if (a.length !== b.length)
            throw new Error("Arrays must be of the same length.");
        let result = 0;
        for (let i = 0; i < a.length; i++)
            result += a[i] * b[i];
        return result;
    },

    /**
     * Linear interpolation between start and end.
     * @param amount value between 0.0 and 1.0
     */
    lerp(start, end, amount) {
        return start + (end - start) * MathHelper.clamp(amount, 0, 1);
    },

    /**
     * Interpolation that eases in and out of the endpoints.
     */
    smoothStep(start, end, amount) {
        const t = MathHelper.clamp(amount, 0, 1);
        return MathHelper.lerp(start, end, t * t * (3 - 2 * t));
    },

    min(value, min) {
        return value < min ? value : min;
    },

    max(value, max) {
        return value > max ? value : max;
    },

    /**
     * Random number in the range [min, max).
     * With a single argument the range is [0, min).
     */
    random(min, max) {
        if (max === undefined) {
            max = min === undefined ? 1 : min;
            min = 0;
        }
        return Math.random() * (max - min) + min;
    },

    /**
     * Random integer in the range [min, max].
     */
    randomInt(min, max) {
        if (max === undefined) {
            max = min;
            min = 0;
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Converts degrees to radians.
     */
    toRadians(degrees) {
        return degrees * Math.PI / 180;
    },

    /**
     * Converts radians to degrees.
     */
    toDegrees(radians) {
        return radians * 180 / Math.PI;
    },

    /**
     * Wraps a value into the range [min, max), useful for screen wrapping.
     */
    wrap(value, min, max) {
        const range = max - min;
        if (range <= 0) return min;
        let result = (value - min) % range;
        if (result < 0) result += range;
        return result + min;
    },

    /**
     * Frame rate independent approach of current toward target.
     * @param smoothing portion of the remaining distance left after one second
     */
    damp(current, target, smoothing, delta) {
        return MathHelper.lerp(target, current, Math.pow(smoothing, delta));
    },

    /**
     * Per frame damping factor for a coefficient quoted per 1/60th of a second,
     * which is how the games express their friction.
     *
     * Only a handful of distinct coefficients exist across a game, and every
     * entity asking for one within a frame shares the same delta, so the
     * answers are memoised for the duration of that frame: hundreds of calls
     * into pow collapse into a handful.
     */
    damping(factor, delta) {
        if (delta !== dampingDelta) {
            dampingDelta = delta;
            dampingCache.clear();
        }
        let value = dampingCache.get(factor);
        if (value === undefined) {
            value = Math.pow(factor, delta * 60);
            dampingCache.set(factor, value);
        }
        return value;
    }
};

const dampingCache = new Map();
let dampingDelta = NaN;
