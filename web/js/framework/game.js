import { GameTime } from "./gametime.js";
import { Keyboard, Mouse } from "./input.js";

/**
 * Base class for a game.
 * JavaScript port of game.framework.Game.
 *
 * Subclasses implement initialize(), loadContent(), update(gameTime) and
 * draw(ctx) exactly as they would against the Java framework. The Java version
 * drives a while loop over a BufferStrategy; here requestAnimationFrame drives
 * the same sequence of calls against a 2d canvas context.
 */
export class Game {
    /**
     * @param canvas the canvas to render into
     * @param options width and height fix the logical resolution; leaving them
     *        out makes the game fill and follow the canvas's CSS box
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: false });
        this.gameTime = new GameTime();
        this.backgroundColor = options.backgroundColor || "#0b0f1a";
        this.running = false;
        this.frameHandle = 0;

        // A fixed resolution means letterboxing; otherwise the logical size
        // tracks the element and the layout decides the aspect ratio.
        this.fixedWidth = options.width || 0;
        this.fixedHeight = options.height || 0;
        this.width = this.fixedWidth || canvas.clientWidth || 800;
        this.height = this.fixedHeight || canvas.clientHeight || 600;

        // Very large delta values, which happen whenever the tab is backgrounded,
        // would let objects tunnel through each other. Clamp to ~4 frames.
        this.maxDeltaSeconds = options.maxDeltaSeconds || 1 / 15;

        Keyboard.attach(window);
        Mouse.attach(canvas);

        this.handleResize = this.handleResize.bind(this);
        this.tick = this.tick.bind(this);
        window.addEventListener("resize", this.handleResize);
        window.addEventListener("orientationchange", this.handleResize);
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.onWindowBlur();
        });
        window.addEventListener("blur", () => this.onWindowBlur());
    }

    //<editor-fold desc="Lifecycle">
    /**
     * Starts the game: initialize, load content, then run the loop.
     */
    run() {
        if (this.running) return;
        this.handleResize();
        this.initialize();
        this.loadContent();
        this.running = true;
        this.gameTime.reset();
        this.frameHandle = requestAnimationFrame(this.tick);
    }

    /**
     * Stops the loop and releases content. The Java framework calls
     * System.exit here; on the web all we can do is halt.
     */
    exitGame() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameHandle);
        this.unloadContent();
    }

    /** Subclasses override to set up objects and variables. */
    initialize() {}

    /** Subclasses override to load images, audio and other resources. */
    loadContent() {}

    /** Subclasses override to release anything loadContent acquired. */
    unloadContent() {}

    /** Subclasses override to advance game logic. */
    update(gameTime) {} // eslint-disable-line no-unused-vars

    /** Subclasses override to render. The context is already cleared. */
    draw(ctx) {} // eslint-disable-line no-unused-vars

    /** Called when the tab or window loses focus. */
    onWindowBlur() {
        Keyboard.clear();
        Mouse.clear();
    }
    //</editor-fold>

    //<editor-fold desc="Game loop">
    tick(timestamp) {
        if (!this.running) return;
        this.frameHandle = requestAnimationFrame(this.tick);

        this.gameTime.tick(timestamp);
        // Clamping here rather than inside GameTime keeps the clock honest
        // while still protecting the physics from a huge catch-up frame.
        if (this.gameTime.getDeltaTimeSeconds() > this.maxDeltaSeconds)
            this.gameTime.deltaTime = this.maxDeltaSeconds * 1000;

        this.update(this.gameTime);
        // Buffered presses have now been polled; retire them.
        Keyboard.endFrame();
        Mouse.endFrame();

        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, this.offsetX, this.offsetY);
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);
        this.draw(ctx);
        ctx.restore();
    }
    //</editor-fold>

    //<editor-fold desc="Presentation">
    /**
     * Resizes the backing store to match the element and the display density.
     */
    handleResize() {
        const ratio = window.devicePixelRatio || 1;
        const boxWidth = this.canvas.clientWidth || this.width;
        const boxHeight = this.canvas.clientHeight || this.height;

        let scale = 1;
        let originX = 0;
        let originY = 0;

        if (this.fixedWidth && this.fixedHeight) {
            // Letterbox the fixed resolution inside the element.
            scale = Math.min(boxWidth / this.fixedWidth, boxHeight / this.fixedHeight);
            originX = (boxWidth - this.fixedWidth * scale) / 2;
            originY = (boxHeight - this.fixedHeight * scale) / 2;
        } else {
            this.width = boxWidth;
            this.height = boxHeight;
        }

        this.pixelRatio = scale * ratio;
        this.offsetX = originX * ratio;
        this.offsetY = originY * ratio;

        this.canvas.width = Math.round(boxWidth * ratio);
        this.canvas.height = Math.round(boxHeight * ratio);

        // Mouse events arrive in the element's CSS box; hand over the same
        // mapping the renderer uses so clicks land where they look like they do.
        Mouse.transform = { originX, originY, scale };

        this.onResize(this.width, this.height);
    }

    /** Subclasses override to react to a change in logical size. */
    onResize(width, height) {} // eslint-disable-line no-unused-vars

    setBackgroundColor(color) { this.backgroundColor = color; }
    getBackgroundColor() { return this.backgroundColor; }
    //</editor-fold>
}
