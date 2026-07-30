/**
 * Tracks the time elapsed between frames and since the game started.
 * JavaScript port of game.framework.GameTime.
 *
 * The Java version reads System.nanoTime(); here the browser supplies the
 * timestamp through tick(), which the game loop passes on from
 * requestAnimationFrame.
 */
export class GameTime {
    constructor() {
        this.deltaTime = 0;      // milliseconds between the last two ticks
        this.baseTime = 0;
        this.pausedTime = 0;
        this.stopTime = 0;
        this.prevTime = 0;
        this.currTime = 0;
        this.stopped = false;
    }

    /**
     * Total time the game has been running, in seconds, excluding any time
     * spent stopped.
     */
    getGameTime() {
        const now = this.stopped ? this.stopTime : this.currTime;
        return (now - this.pausedTime - this.baseTime) / 1000;
    }

    /**
     * Time between the last two frames in milliseconds.
     */
    getDeltaTime() {
        return this.deltaTime;
    }

    /**
     * Time between the last two frames in seconds. This is what game logic
     * should multiply by to stay frame rate independent.
     */
    getDeltaTimeSeconds() {
        return this.deltaTime / 1000;
    }

    /**
     * Frames per second implied by the current delta.
     */
    getFramesPerSecond() {
        return this.deltaTime > 0 ? 1000 / this.deltaTime : 0;
    }

    reset(timestamp = performance.now()) {
        this.baseTime = timestamp;
        this.prevTime = timestamp;
        this.currTime = timestamp;
        this.stopTime = 0;
        this.pausedTime = 0;
        this.deltaTime = 0;
        this.stopped = false;
    }

    /**
     * Resumes after a stop, folding the time spent stopped into pausedTime so
     * it does not show up as one enormous delta.
     */
    start(timestamp = performance.now()) {
        if (!this.stopped) return;
        this.pausedTime += timestamp - this.stopTime;
        this.prevTime = timestamp;
        this.currTime = timestamp;
        this.stopTime = 0;
        this.deltaTime = 0;
        this.stopped = false;
    }

    stop(timestamp = performance.now()) {
        if (this.stopped) return;
        this.stopTime = timestamp;
        this.stopped = true;
    }

    isStopped() {
        return this.stopped;
    }

    /**
     * Advances the clock by one frame.
     */
    tick(timestamp = performance.now()) {
        if (this.stopped) {
            this.deltaTime = 0;
            return;
        }
        this.currTime = timestamp;
        this.deltaTime = Math.max(0, this.currTime - this.prevTime);
        this.prevTime = this.currTime;
    }
}
