import { GameTime } from "./gametime.js";
import { Keyboard, Mouse } from "./input.js";
import { Quality } from "./quality.js";

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
        this.quality = Quality;
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
        // Resize events arrive in bursts while a window is dragged, and each
        // one reallocates the backing store. Coalescing them onto the next
        // frame means one reallocation per burst instead of dozens.
        this.requestResize = this.requestResize.bind(this);
        this.resizeHandle = 0;

        window.addEventListener("resize", this.requestResize, { passive: true });
        window.addEventListener("orientationchange", this.requestResize, { passive: true });
        // A change of quality level changes the pixel ratio the backing store
        // is allocated at, so the canvas has to be sized again.
        this.releaseQuality = Quality.onChange(this.requestResize);
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
        if (this.resizeHandle) cancelAnimationFrame(this.resizeHandle);
        if (this.releaseQuality) this.releaseQuality();
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
        // The raw delta is what the frame actually cost, so it is what the
        // quality ladder judges; the clamped one is what the physics sees.
        Quality.sample(this.gameTime.getDeltaTime());
        // Clamping here rather than inside GameTime keeps the clock honest
        // while still protecting the physics from a huge catch-up frame.
        if (this.gameTime.getDeltaTimeSeconds() > this.maxDeltaSeconds)
            this.gameTime.deltaTime = this.maxDeltaSeconds * 1000;

        this.update(this.gameTime);
        // Buffered presses have now been polled; retire them.
        Keyboard.endFrame();
        Mouse.endFrame();

        // setTransform resets the matrix outright, so the frame needs no
        // save/restore pair of its own to undo the previous one.
        const ctx = this.ctx;
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, this.offsetX, this.offsetY);
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);
        this.draw(ctx);
    }
    //</editor-fold>

    //<editor-fold desc="Presentation">
    /** Coalesces a burst of resize events into one resize on the next frame. */
    requestResize() {
        if (this.resizeHandle) return;
        this.resizeHandle = requestAnimationFrame(() => {
            this.resizeHandle = 0;
            this.handleResize();
        });
    }

    /**
     * Resizes the backing store to match the element and the display density.
     */
    handleResize() {
        // A phone reporting a ratio of 3 would have the game shading nine
        // pixels for every one the player can tell apart. Capping it by quality
        // level is the single biggest lever on fill rate there is.
        const ratio = Math.min(window.devicePixelRatio || 1, Quality.maxPixelRatio);
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

        // Assigning to width or height clears the canvas and reallocates its
        // backing store even when the value is unchanged, so only do it when
        // the size really moved.
        const backingWidth = Math.round(boxWidth * ratio);
        const backingHeight = Math.round(boxHeight * ratio);
        if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
        if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;

        // Mouse events arrive in the element's CSS box; hand over the same
        // mapping the renderer uses so clicks land where they look like they do.
        Mouse.transform = { originX, originY, scale };
        Mouse.invalidateBounds();

        this.onResize(this.width, this.height);
    }

    /** Subclasses override to react to a change in logical size. */
    onResize(width, height) {} // eslint-disable-line no-unused-vars

    setBackgroundColor(color) { this.backgroundColor = color; }
    getBackgroundColor() { return this.backgroundColor; }
    //</editor-fold>
}
