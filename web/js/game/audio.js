/**
 * Tiny synthesised sound effects.
 *
 * Everything is generated with oscillators so the site ships with no audio
 * assets at all, which keeps the static deploy to a handful of kilobytes.
 */
const VOICES = {
    shoot: { type: "square", from: 620, to: 220, duration: 0.08, gain: 0.05 },
    pop: { type: "triangle", from: 320, to: 70, duration: 0.18, gain: 0.11 },
    hurt: { type: "sawtooth", from: 240, to: 55, duration: 0.42, gain: 0.16 },
    shield: { type: "sine", from: 180, to: 640, duration: 0.28, gain: 0.13 },
    pickup: { type: "sine", from: 520, to: 1180, duration: 0.22, gain: 0.12 },
    wave: { type: "triangle", from: 300, to: 780, duration: 0.4, gain: 0.11 },
    over: { type: "sawtooth", from: 400, to: 40, duration: 1.1, gain: 0.18 }
};

export class AudioBank {
    constructor() {
        this.context = null;
        this.master = null;
        this.muted = false;
        // Rapid fire would otherwise stack dozens of voices on one frame.
        this.lastPlayed = new Map();
    }

    /**
     * Browsers only allow audio to start from a user gesture, so the context is
     * created lazily on the first play and resumed if it was suspended.
     */
    ensureContext() {
        if (!this.context) {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return null;
            this.context = new Context();
            this.master = this.context.createGain();
            this.master.gain.value = 0.9;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === "suspended") this.context.resume();
        return this.context;
    }

    play(name) {
        if (this.muted) return;
        const voice = VOICES[name];
        if (!voice) return;

        const context = this.ensureContext();
        if (!context) return;

        const now = context.currentTime;
        const previous = this.lastPlayed.get(name) || 0;
        if (now - previous < 0.03) return;
        this.lastPlayed.set(name, now);

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = voice.type;
        oscillator.frequency.setValueAtTime(voice.from, now);
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(voice.to, 1), now + voice.duration
        );
        gain.gain.setValueAtTime(voice.gain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.duration);

        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start(now);
        oscillator.stop(now + voice.duration + 0.02);
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.master) this.master.gain.value = muted ? 0 : 0.9;
    }

    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }
}
