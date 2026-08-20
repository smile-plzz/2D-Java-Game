/**
 * Adaptive render quality.
 *
 * The Java framework never had to worry about this: a desktop JVM window is a
 * desktop JVM window. On the web the same canvas has to run on a 240Hz gaming
 * monitor and on a phone that is already throttling, so the expensive parts of
 * the look — the shadow blur behind every neon stroke, the particle counts, the
 * device pixel ratio the backing store is allocated at — are scaled by a level
 * that the game loop keeps adjusting while it runs.
 *
 * Games read this through the singleton at the bottom of the file, the same way
 * they read Keyboard and Mouse.
 */

export const QualityLevel = {
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low"
};

/** Ordered worst to best so a level can be stepped up and down by index. */
const ORDER = [QualityLevel.LOW, QualityLevel.MEDIUM, QualityLevel.HIGH];

const PROFILES = {
    [QualityLevel.HIGH]: { glow: 1, particles: 1, pixelRatio: 2, trails: true },
    [QualityLevel.MEDIUM]: { glow: 0.55, particles: 0.6, pixelRatio: 1.5, trails: true },
    [QualityLevel.LOW]: { glow: 0, particles: 0.35, pixelRatio: 1, trails: false }
};

const STORAGE_KEY = "arcade.quality";

// A frame slower than this counts as struggling; faster than the other counts
// as headroom. The gap between them stops the level oscillating on the boundary.
const SLOW_FRAME_MS = 21;   // under ~48fps
const FAST_FRAME_MS = 13.5; // over ~74fps
const DROP_AFTER_SECONDS = 1.1;
const RAISE_AFTER_SECONDS = 4;

class QualityManager {
    constructor() {
        this.auto = true;
        this.level = QualityLevel.HIGH;
        this.profile = PROFILES[this.level];
        this.smoothedFrameMs = 16.7;
        this.slowFor = 0;
        this.fastFor = 0;
        this.listeners = new Set();
        this.applyPreferences();
    }

    //<editor-fold desc="Preferences">
    /**
     * Reads the explicit choice, if any: a ?quality= query parameter wins over
     * the stored setting, which wins over the automatic ladder. A reduced
     * motion preference starts low rather than climbing up to the full glow.
     */
    applyPreferences() {
        let requested = null;
        try {
            requested = new URLSearchParams(window.location.search).get("quality")
                || window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            // Query parsing and storage both fail in locked down contexts.
        }

        if (requested && requested !== "auto" && PROFILES[requested]) {
            this.auto = false;
            this.setLevel(requested);
            return;
        }

        this.auto = true;
        const reduced = typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.setLevel(reduced ? QualityLevel.LOW : QualityLevel.HIGH);
    }

    /**
     * Pins the level, or hands control back to the automatic ladder with
     * "auto". The choice is remembered for the next visit.
     */
    prefer(level) {
        this.auto = level === "auto";
        try {
            window.localStorage.setItem(STORAGE_KEY, level);
        } catch (error) {
            // Not being able to remember the setting is not worth failing over.
        }
        if (!this.auto) this.setLevel(level);
        this.slowFor = 0;
        this.fastFor = 0;
    }
    //</editor-fold>

    //<editor-fold desc="Level">
    setLevel(level) {
        if (!PROFILES[level] || level === this.level) return;
        this.level = level;
        this.profile = PROFILES[level];
        for (const listener of this.listeners) listener(level, this.profile);
    }

    /** Registers a listener called whenever the level changes. */
    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    step(direction) {
        const index = ORDER.indexOf(this.level) + direction;
        if (index < 0 || index >= ORDER.length) return;
        this.setLevel(ORDER[index]);
        this.slowFor = 0;
        this.fastFor = 0;
    }
    //</editor-fold>

    //<editor-fold desc="Sampling">
    /**
     * Feeds one frame's cost in to the ladder. Game calls this every tick.
     *
     * Sustained slow frames drop a level quickly, because the player is feeling
     * every one of them; headroom raises it back only after a long clean run,
     * so a single quiet moment does not undo the drop.
     */
    sample(frameMs) {
        if (!(frameMs > 0) || frameMs > 200) return; // a tab switch, not a slow frame
        // Exponential moving average: one bad frame should not move the level.
        this.smoothedFrameMs += (frameMs - this.smoothedFrameMs) * 0.08;
        if (!this.auto) return;

        const seconds = frameMs / 1000;
        if (this.smoothedFrameMs > SLOW_FRAME_MS) {
            this.slowFor += seconds;
            this.fastFor = 0;
            if (this.slowFor > DROP_AFTER_SECONDS) this.step(-1);
        } else if (this.smoothedFrameMs < FAST_FRAME_MS) {
            this.fastFor += seconds;
            this.slowFor = 0;
            if (this.fastFor > RAISE_AFTER_SECONDS) this.step(1);
        } else {
            this.slowFor = 0;
            this.fastFor = 0;
        }
    }

    /** Frames per second implied by the smoothed frame time. */
    getFramesPerSecond() {
        return this.smoothedFrameMs > 0 ? 1000 / this.smoothedFrameMs : 0;
    }
    //</editor-fold>

    //<editor-fold desc="Scaling">
    /**
     * Shadow blur radius to use for a glow that would be `base` pixels at full
     * quality. Zero switches the glow off, which is by far the cheapest win
     * canvas has to offer.
     */
    glow(base) {
        return base * this.profile.glow;
    }

    /** Scales a particle count, never down to nothing. */
    particles(count) {
        if (count <= 0) return 0;
        return Math.max(1, Math.round(count * this.profile.particles));
    }

    /** Upper bound on the device pixel ratio the backing store is sized at. */
    get maxPixelRatio() {
        return this.profile.pixelRatio;
    }

    /** False when decorative trails and streaks should be skipped entirely. */
    get trails() {
        return this.profile.trails;
    }
    //</editor-fold>
}

export const Quality = new QualityManager();
