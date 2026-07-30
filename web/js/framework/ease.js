/**
 * Motion easing equations, ported from game.animation.ease.
 * Equations are adopted from Robert Penner's easing library provided at
 * http://www.robertpenner.com/easing/.
 *
 * Every function takes the same four arguments as the Java originals:
 *   time     elapsed time
 *   begin    starting value
 *   change   total change in value
 *   duration total time the tween runs for
 */

export const Linear = {
    easeNone(time, begin, change, duration) {
        return change * time / duration + begin;
    },
    easeIn(time, begin, change, duration) {
        return Linear.easeNone(time, begin, change, duration);
    },
    easeOut(time, begin, change, duration) {
        return Linear.easeNone(time, begin, change, duration);
    },
    easeInOut(time, begin, change, duration) {
        return Linear.easeNone(time, begin, change, duration);
    }
};

export const Quadratic = {
    easeIn(time, begin, change, duration) {
        return change * (time /= duration) * time + begin;
    },
    easeOut(time, begin, change, duration) {
        return -change * (time /= duration) * (time - 2) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if ((time /= duration / 2) < 1)
            return change / 2 * time * time + begin;
        return -change / 2 * ((--time) * (time - 2) - 1) + begin;
    }
};

export const Cubic = {
    easeIn(time, begin, change, duration) {
        return change * (time /= duration) * time * time + begin;
    },
    easeOut(time, begin, change, duration) {
        return change * ((time = time / duration - 1) * time * time + 1) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if ((time /= duration / 2) < 1)
            return change / 2 * time * time * time + begin;
        return change / 2 * ((time -= 2) * time * time + 2) + begin;
    }
};

export const Quartic = {
    easeIn(time, begin, change, duration) {
        return change * (time /= duration) * time * time * time + begin;
    },
    easeOut(time, begin, change, duration) {
        return -change * ((time = time / duration - 1) * time * time * time - 1) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if ((time /= duration / 2) < 1)
            return change / 2 * time * time * time * time + begin;
        return -change / 2 * ((time -= 2) * time * time * time - 2) + begin;
    }
};

export const Quintic = {
    easeIn(time, begin, change, duration) {
        return change * (time /= duration) * time * time * time * time + begin;
    },
    easeOut(time, begin, change, duration) {
        return change * ((time = time / duration - 1) * time * time * time * time + 1) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if ((time /= duration / 2) < 1)
            return change / 2 * time * time * time * time * time + begin;
        return change / 2 * ((time -= 2) * time * time * time * time + 2) + begin;
    }
};

export const Sinusoidal = {
    easeIn(time, begin, change, duration) {
        return -change * Math.cos(time / duration * (Math.PI / 2)) + change + begin;
    },
    easeOut(time, begin, change, duration) {
        return change * Math.sin(time / duration * (Math.PI / 2)) + begin;
    },
    easeInOut(time, begin, change, duration) {
        return -change / 2 * (Math.cos(Math.PI * time / duration) - 1) + begin;
    }
};

export const Exponential = {
    easeIn(time, begin, change, duration) {
        return time === 0 ? begin : change * Math.pow(2, 10 * (time / duration - 1)) + begin;
    },
    easeOut(time, begin, change, duration) {
        return time === duration ? begin + change : change * (-Math.pow(2, -10 * time / duration) + 1) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if (time === 0) return begin;
        if (time === duration) return begin + change;
        if ((time /= duration / 2) < 1)
            return change / 2 * Math.pow(2, 10 * (time - 1)) + begin;
        return change / 2 * (-Math.pow(2, -10 * --time) + 2) + begin;
    }
};

export const Circular = {
    easeIn(time, begin, change, duration) {
        return -change * (Math.sqrt(1 - (time /= duration) * time) - 1) + begin;
    },
    easeOut(time, begin, change, duration) {
        return change * Math.sqrt(1 - (time = time / duration - 1) * time) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if ((time /= duration / 2) < 1)
            return -change / 2 * (Math.sqrt(1 - time * time) - 1) + begin;
        return change / 2 * (Math.sqrt(1 - (time -= 2) * time) + 1) + begin;
    }
};

export const Back = {
    easeIn(time, begin, change, duration, overshoot = 1.70158) {
        return change * (time /= duration) * time * ((overshoot + 1) * time - overshoot) + begin;
    },
    easeOut(time, begin, change, duration, overshoot = 1.70158) {
        return change * ((time = time / duration - 1) * time * ((overshoot + 1) * time + overshoot) + 1) + begin;
    },
    easeInOut(time, begin, change, duration, overshoot = 1.70158) {
        if ((time /= duration / 2) < 1)
            return change / 2 * (time * time * (((overshoot *= 1.525) + 1) * time - overshoot)) + begin;
        return change / 2 * ((time -= 2) * time * (((overshoot *= 1.525) + 1) * time + overshoot) + 2) + begin;
    }
};

export const Elastic = {
    easeIn(time, begin, change, duration, amplitude = null, period = null) {
        let s;
        if (time === 0) return begin;
        if ((time /= duration) === 1) return begin + change;
        if (period === null) period = duration * 0.3;
        if (amplitude === null || amplitude < Math.abs(change)) {
            amplitude = change;
            s = period / 4;
        } else {
            s = period / (2 * Math.PI) * Math.asin(change / amplitude);
        }
        return -(amplitude * Math.pow(2, 10 * (time -= 1))
            * Math.sin((time * duration - s) * (2 * Math.PI) / period)) + begin;
    },
    easeOut(time, begin, change, duration, amplitude = null, period = null) {
        let s;
        if (time === 0) return begin;
        if ((time /= duration) === 1) return begin + change;
        if (period === null) period = duration * 0.3;
        if (amplitude === null || amplitude < Math.abs(change)) {
            amplitude = change;
            s = period / 4;
        } else {
            s = period / (2 * Math.PI) * Math.asin(change / amplitude);
        }
        return amplitude * Math.pow(2, -10 * time)
            * Math.sin((time * duration - s) * (2 * Math.PI) / period) + change + begin;
    },
    easeInOut(time, begin, change, duration, amplitude = null, period = null) {
        let s;
        if (time === 0) return begin;
        if ((time /= duration / 2) === 2) return begin + change;
        if (period === null) period = duration * (0.3 * 1.5);
        if (amplitude === null || amplitude < Math.abs(change)) {
            amplitude = change;
            s = period / 4;
        } else {
            s = period / (2 * Math.PI) * Math.asin(change / amplitude);
        }
        if (time < 1) {
            return -0.5 * (amplitude * Math.pow(2, 10 * (time -= 1))
                * Math.sin((time * duration - s) * (2 * Math.PI) / period)) + begin;
        }
        return amplitude * Math.pow(2, -10 * (time -= 1))
            * Math.sin((time * duration - s) * (2 * Math.PI) / period) * 0.5 + change + begin;
    }
};

export const Bounce = {
    easeIn(time, begin, change, duration) {
        return change - Bounce.easeOut(duration - time, 0, change, duration) + begin;
    },
    easeOut(time, begin, change, duration) {
        if ((time /= duration) < (1 / 2.75)) {
            return change * (7.5625 * time * time) + begin;
        } else if (time < (2 / 2.75)) {
            return change * (7.5625 * (time -= (1.5 / 2.75)) * time + 0.75) + begin;
        } else if (time < (2.5 / 2.75)) {
            return change * (7.5625 * (time -= (2.25 / 2.75)) * time + 0.9375) + begin;
        }
        return change * (7.5625 * (time -= (2.625 / 2.75)) * time + 0.984375) + begin;
    },
    easeInOut(time, begin, change, duration) {
        if (time < duration / 2)
            return Bounce.easeIn(time * 2, 0, change, duration) * 0.5 + begin;
        return Bounce.easeOut(time * 2 - duration, 0, change, duration) * 0.5 + change * 0.5 + begin;
    }
};

/**
 * Tweens a single value over time, mirroring game.animation.tween.MotionTween.
 */
export class MotionTween {
    constructor(easing, begin, change, duration) {
        this.easing = easing;
        this.begin = begin;
        this.change = change;
        this.duration = duration;
        this.time = 0;
        this.value = begin;
    }

    update(delta) {
        this.time = Math.min(this.time + delta, this.duration);
        this.value = this.easing(this.time, this.begin, this.change, this.duration);
        return this.value;
    }

    isFinished() { return this.time >= this.duration; }

    reset(begin = this.begin, change = this.change) {
        this.begin = begin;
        this.change = change;
        this.time = 0;
        this.value = begin;
        return this;
    }
}
