import { Vector2 } from "./vector2.js";

/**
 * Keyboard and mouse polling, ported from game.input.
 *
 * The Java framework installs listeners on the JFrame and exposes static
 * keyDown / keyDownOnce style queries. The same idea applies here: events
 * update a state table, and game code polls that table during update().
 */

/** Key identifiers, matching KeyboardEvent.code values. */
export const Keys = {
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    W: "KeyW",
    A: "KeyA",
    S: "KeyS",
    D: "KeyD",
    P: "KeyP",
    R: "KeyR",
    M: "KeyM",
    H: "KeyH",
    SPACE: "Space",
    ESCAPE: "Escape",
    ENTER: "Enter",
    SHIFT: "ShiftLeft",
    SHIFT_RIGHT: "ShiftRight"
};

/** Mouse button identifiers, matching MouseEvent.button values. */
export const MouseKeys = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2
};

class KeyboardInput {
    constructor() {
        this.down = new Set();
        // Keys pressed since the last frame. A tap that starts and ends between
        // two frames would be invisible to a plain "is it held" check, so the
        // press is buffered until update() has had a chance to poll it.
        this.justPressed = new Set();
        this.enabled = false;
    }

    attach(target = window) {
        if (this.enabled) return;
        this.enabled = true;

        target.addEventListener("keydown", (event) => {
            // Keep the page from scrolling out from under the canvas.
            if (PREVENT_DEFAULT_KEYS.has(event.code)) event.preventDefault();
            // The guard keeps auto-repeat from counting as a fresh press.
            if (!this.down.has(event.code)) this.justPressed.add(event.code);
            this.down.add(event.code);
        });

        target.addEventListener("keyup", (event) => {
            this.down.delete(event.code);
        });

        // A lost window means lost keyup events, so drop everything.
        target.addEventListener("blur", () => this.clear());
    }

    /** True for as long as the key is held. */
    keyDown(key) {
        return this.down.has(key);
    }

    /** True exactly once per press, no matter how long the key is held. */
    keyDownOnce(key) {
        if (!this.justPressed.has(key)) return false;
        this.justPressed.delete(key);
        return true;
    }

    /** True when any of the given keys is held. */
    anyDown(...keys) {
        return keys.some((key) => this.down.has(key));
    }

    /**
     * Drops presses nothing polled this frame. Game calls this once per frame,
     * after update(), so a buffered press never fires a frame late.
     */
    endFrame() {
        this.justPressed.clear();
    }

    clear() {
        this.down.clear();
        this.justPressed.clear();
    }
}

const PREVENT_DEFAULT_KEYS = new Set([
    Keys.UP, Keys.DOWN, Keys.LEFT, Keys.RIGHT, Keys.SPACE
]);

class MouseInput {
    constructor() {
        this.position = new Vector2(0, 0);
        this.down = new Set();
        this.justPressed = new Set();
        this.inside = false;
        this.enabled = false;
        // Maps the canvas CSS box onto the game's logical coordinate space.
        // Game keeps this in sync on every resize; the identity default is
        // correct whenever the two spaces are the same size.
        this.transform = { originX: 0, originY: 0, scale: 1 };
    }

    /**
     * @param element the canvas mouse coordinates are reported relative to
     */
    attach(element) {
        if (this.enabled) return;
        this.enabled = true;
        this.element = element;

        element.addEventListener("mousemove", (event) => this.updatePosition(event));

        element.addEventListener("mousedown", (event) => {
            event.preventDefault();
            this.updatePosition(event);
            if (!this.down.has(event.button)) this.justPressed.add(event.button);
            this.down.add(event.button);
        });

        window.addEventListener("mouseup", (event) => {
            this.down.delete(event.button);
        });

        element.addEventListener("mouseenter", () => { this.inside = true; });
        element.addEventListener("mouseleave", () => { this.inside = false; });
        element.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    updatePosition(event) {
        const bounds = this.element.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        const { originX, originY, scale } = this.transform;
        this.position.set(
            (event.clientX - bounds.left - originX) / scale,
            (event.clientY - bounds.top - originY) / scale
        );
        this.inside = true;
    }

    getPosition() {
        return this.position;
    }

    buttonDown(button = MouseKeys.LEFT) {
        return this.down.has(button);
    }

    buttonDownOnce(button = MouseKeys.LEFT) {
        if (!this.justPressed.has(button)) return false;
        this.justPressed.delete(button);
        return true;
    }

    endFrame() {
        this.justPressed.clear();
    }

    clear() {
        this.down.clear();
        this.justPressed.clear();
    }
}

export const Keyboard = new KeyboardInput();
export const Mouse = new MouseInput();
