import { Vector2 } from "../framework/vector2.js";
import { Mouse } from "../framework/input.js";

const DEAD_ZONE = 8;
const MAX_RADIUS = 62;
const DOUBLE_TAP_WINDOW = 0.28;

/**
 * Two on-screen thumb sticks for touch devices: the left half of the canvas
 * moves the ship, the right half aims and fires. Double tapping the left half
 * dashes.
 *
 * Sticks are floating — they appear wherever the thumb lands rather than at a
 * fixed spot, which works across the wide range of phone sizes.
 */
export class TouchControls {
    constructor(canvas) {
        this.canvas = canvas;
        this.move = new Vector2();
        this.aim = new Vector2();
        this.firing = false;
        this.dashRequested = false;
        this.active = false;

        this.left = null;
        this.right = null;
        this.lastLeftTap = -1;

        canvas.addEventListener("touchstart", (event) => this.onStart(event), { passive: false });
        canvas.addEventListener("touchmove", (event) => this.onMove(event), { passive: false });
        canvas.addEventListener("touchend", (event) => this.onEnd(event), { passive: false });
        canvas.addEventListener("touchcancel", (event) => this.onEnd(event), { passive: false });
    }

    /** Maps a touch into the game's coordinate space. */
    toGame(touch) {
        const bounds = this.canvas.getBoundingClientRect();
        const { originX, originY, scale } = Mouse.transform;
        return new Vector2(
            (touch.clientX - bounds.left - originX) / scale,
            (touch.clientY - bounds.top - originY) / scale
        );
    }

    onStart(event) {
        event.preventDefault();
        this.active = true;
        const midpoint = this.canvas.getBoundingClientRect().width / 2;

        for (const touch of event.changedTouches) {
            const position = this.toGame(touch);
            const onLeft = touch.clientX - this.canvas.getBoundingClientRect().left < midpoint;

            if (onLeft && !this.left) {
                this.left = { id: touch.identifier, origin: position, current: position.copy() };
                const now = performance.now() / 1000;
                if (now - this.lastLeftTap < DOUBLE_TAP_WINDOW) this.dashRequested = true;
                this.lastLeftTap = now;
            } else if (!onLeft && !this.right) {
                this.right = { id: touch.identifier, origin: position, current: position.copy() };
            }
        }
    }

    onMove(event) {
        event.preventDefault();
        for (const touch of event.changedTouches) {
            const position = this.toGame(touch);
            if (this.left && touch.identifier === this.left.id) this.left.current = position;
            if (this.right && touch.identifier === this.right.id) this.right.current = position;
        }
    }

    onEnd(event) {
        event.preventDefault();
        for (const touch of event.changedTouches) {
            if (this.left && touch.identifier === this.left.id) this.left = null;
            if (this.right && touch.identifier === this.right.id) this.right = null;
        }
    }

    /** Recomputes the stick vectors; call once per frame before reading them. */
    update() {
        this.move = TouchControls.stickVector(this.left);
        this.aim = TouchControls.stickVector(this.right);
        this.firing = this.right !== null;
    }

    static stickVector(stick) {
        if (!stick) return new Vector2();
        const offset = stick.current.subtract(stick.origin);
        const distance = offset.magnitude();
        if (distance < DEAD_ZONE) return new Vector2();
        return offset.normalize().multiply(Math.min(distance, MAX_RADIUS) / MAX_RADIUS);
    }

    /** Reads and clears the pending dash, so one double tap dashes once. */
    consumeDash() {
        const requested = this.dashRequested;
        this.dashRequested = false;
        return requested;
    }

    reset() {
        this.left = null;
        this.right = null;
        this.dashRequested = false;
    }

    draw(ctx) {
        if (!this.active) return;
        for (const stick of [this.left, this.right]) {
            if (!stick) continue;
            const offset = stick.current.subtract(stick.origin);
            const knob = offset.magnitude() > MAX_RADIUS
                ? stick.origin.add(offset.normalize().multiply(MAX_RADIUS))
                : stick.current;

            ctx.globalAlpha = 0.28;
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(stick.origin.x, stick.origin.y, MAX_RADIUS, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(knob.x, knob.y, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
}
