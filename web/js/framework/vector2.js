import { MathHelper } from "./mathhelper.js";

/**
 * A two dimensional vector.
 * JavaScript port of game.framework.Vector2.
 *
 * Instance methods return new vectors and never mutate the receiver, matching
 * the immutable style of the Java class. Methods suffixed with "Self" mutate in
 * place and exist so the hot paths of the game loop can avoid allocating.
 */
export class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    //<editor-fold desc="Factories">
    static zero() { return new Vector2(0, 0); }
    static one() { return new Vector2(1, 1); }
    static unitX() { return new Vector2(1, 0); }
    static unitY() { return new Vector2(0, 1); }

    /**
     * Unit vector pointing along the given angle in radians.
     */
    static fromAngle(radians, length = 1) {
        return new Vector2(Math.cos(radians) * length, Math.sin(radians) * length);
    }

    /**
     * Unit vector pointing in a uniformly random direction.
     */
    static random(length = 1) {
        return Vector2.fromAngle(Math.random() * Math.PI * 2, length);
    }
    //</editor-fold>

    //<editor-fold desc="Arithmetic">
    add(that) { return new Vector2(this.x + that.x, this.y + that.y); }
    subtract(that) { return new Vector2(this.x - that.x, this.y - that.y); }

    /**
     * Multiplies by a scalar or, when given a vector, component wise.
     */
    multiply(value) {
        return typeof value === "number"
            ? new Vector2(this.x * value, this.y * value)
            : new Vector2(this.x * value.x, this.y * value.y);
    }

    divide(value) {
        return typeof value === "number"
            ? new Vector2(this.x / value, this.y / value)
            : new Vector2(this.x / value.x, this.y / value.y);
    }

    negate() { return new Vector2(-this.x, -this.y); }

    addSelf(that) { this.x += that.x; this.y += that.y; return this; }
    subtractSelf(that) { this.x -= that.x; this.y -= that.y; return this; }
    multiplySelf(scalar) { this.x *= scalar; this.y *= scalar; return this; }
    //</editor-fold>

    //<editor-fold desc="Products and lengths">
    dotProduct(that) { return this.x * that.x + this.y * that.y; }

    /**
     * Z component of the 3d cross product; positive when that is counter
     * clockwise from this vector.
     */
    crossProduct(that) { return this.x * that.y - this.y * that.x; }

    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    magnitudeSquared() { return this.x * this.x + this.y * this.y; }

    distance(that) { return Math.sqrt(this.distanceSquared(that)); }

    distanceSquared(that) {
        const dx = this.x - that.x;
        const dy = this.y - that.y;
        return dx * dx + dy * dy;
    }

    /**
     * Returns a unit length copy. A zero vector is returned unchanged rather
     * than producing NaN.
     */
    normalize() {
        const length = this.magnitude();
        return length === 0 ? new Vector2(0, 0) : new Vector2(this.x / length, this.y / length);
    }

    /**
     * Returns a copy whose magnitude is at most max.
     */
    truncate(max) {
        const lengthSquared = this.magnitudeSquared();
        if (lengthSquared <= max * max) return this.copy();
        return this.normalize().multiply(max);
    }
    //</editor-fold>

    //<editor-fold desc="Angles and interpolation">
    /**
     * Angle of this vector in radians, measured from the positive x axis.
     */
    angle() { return Math.atan2(this.y, this.x); }

    /**
     * Angle in radians from this vector toward that one.
     */
    angleTo(that) { return Math.atan2(that.y - this.y, that.x - this.x); }

    rotate(radians) {
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }

    /**
     * Vector rotated a quarter turn counter clockwise.
     */
    perpendicular() { return new Vector2(-this.y, this.x); }

    lerp(that, amount) {
        return new Vector2(
            MathHelper.lerp(this.x, that.x, amount),
            MathHelper.lerp(this.y, that.y, amount)
        );
    }

    /**
     * Reflects this vector about a surface with the given unit normal.
     */
    reflect(normal) {
        const scale = 2 * this.dotProduct(normal);
        return new Vector2(this.x - normal.x * scale, this.y - normal.y * scale);
    }
    //</editor-fold>

    //<editor-fold desc="Utility">
    copy() { return new Vector2(this.x, this.y); }

    set(x, y) { this.x = x; this.y = y; return this; }

    equals(that) { return that instanceof Vector2 && this.x === that.x && this.y === that.y; }

    toString() { return `Vector2: (${this.x}, ${this.y})`; }
    //</editor-fold>
}
