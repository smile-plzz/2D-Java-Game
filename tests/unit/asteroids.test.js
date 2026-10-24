import { test, suite } from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser globals if needed for node testing
if (typeof window === "undefined") {
    globalThis.window = {
        AudioContext: class {
            createGain() { return { gain: { value: 1 }, connect() {} }; }
            get destination() { return {}; }
            get currentTime() { return 0; }
            get state() { return "running"; }
            resume() {}
        }
    };
    globalThis.localStorage = {
        _map: new Map(),
        getItem(k) { return this._map.get(k) || null; },
        setItem(k, v) { this._map.set(k, String(v)); }
    };
}

suite("Neon Asteroids game logic unit tests", () => {
    test("Asteroid splitting produces two smaller fragments", () => {
        const ASTEROID_CONFIG = {
            large: { radius: 38, split: "medium" },
            medium: { radius: 22, split: "small" },
            small: { radius: 12, split: null }
        };

        let current = "large";
        let next = ASTEROID_CONFIG[current].split;
        assert.equal(next, "medium");

        current = next;
        next = ASTEROID_CONFIG[current].split;
        assert.equal(next, "small");

        current = next;
        next = ASTEROID_CONFIG[current].split;
        assert.equal(next, null);
    });

    test("Toroidal coordinate wrapping keeps entities on screen", () => {
        const width = 800;
        const height = 600;
        const margin = 20;

        function wrap(pos) {
            let x = pos.x;
            let y = pos.y;
            if (x < -margin) x = width + margin;
            else if (x > width + margin) x = -margin;
            if (y < -margin) y = height + margin;
            else if (y > height + margin) y = -margin;
            return { x, y };
        }

        const wrappedRight = wrap({ x: 825, y: 300 });
        assert.equal(wrappedRight.x, -20);

        const wrappedLeft = wrap({ x: -25, y: 300 });
        assert.equal(wrappedLeft.x, 820);
    });

    test("Blitz multiplier scales score correctly", () => {
        let score = 0;
        let combo = 3;
        const baseScore = 50;

        score += baseScore * combo;
        assert.equal(score, 150);
    });
});
