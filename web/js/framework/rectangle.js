import { Vector2 } from "./vector2.js";

/**
 * An axis aligned rectangle.
 * JavaScript port of game.framework.Rectangle.
 */
export class Rectangle {
    constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * Builds a rectangle of the given size centered on a point.
     */
    static fromCenter(center, width, height) {
        return new Rectangle(center.x - width / 2, center.y - height / 2, width, height);
    }

    get left() { return this.x; }
    get right() { return this.x + this.width; }
    get top() { return this.y; }
    get bottom() { return this.y + this.height; }

    center() { return new Vector2(this.x + this.width / 2, this.y + this.height / 2); }

    /**
     * True when the point falls inside this rectangle.
     */
    contains(point) {
        return point.x >= this.left && point.x <= this.right
            && point.y >= this.top && point.y <= this.bottom;
    }

    /**
     * True when this rectangle overlaps another.
     */
    intersects(that) {
        return this.left < that.right && this.right > that.left
            && this.top < that.bottom && this.bottom > that.top;
    }

    /**
     * Grows the rectangle by the given amount on every side. Negative values
     * shrink it. Returns a new rectangle.
     */
    inflate(horizontal, vertical = horizontal) {
        return new Rectangle(
            this.x - horizontal,
            this.y - vertical,
            this.width + horizontal * 2,
            this.height + vertical * 2
        );
    }

    copy() { return new Rectangle(this.x, this.y, this.width, this.height); }

    toString() {
        return `Rectangle: (${this.x}, ${this.y}, ${this.width}, ${this.height})`;
    }
}
