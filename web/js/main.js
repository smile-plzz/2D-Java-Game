import { Arena, MODE_INFO, State, drawEasingPreview } from "./game/arena.js";
import { bindShell, format } from "./games/shell.js";
import {
    Back, Bounce, Circular, Cubic, Elastic, Exponential, Quadratic, Sinusoidal
} from "./framework/ease.js";

const canvas = document.getElementById("game");
const arena = new Arena(canvas);

// The shared shell mirrors game state onto the DOM overlays and wires the
// buttons. The canvas owns the HUD; the DOM owns anything the player needs to
// read, click or tab to.
bindShell(arena, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-wave": (data) => format(Math.max(data.wave, 1))
    },
    resultLabel: (data) => {
        if (data.timedOut) return "Time's up";
        return data.score > 0 && data.score >= data.highScore ? "New best" : "Game over";
    },
    touchHint: "Left stick \u00b7 Right stick \u00b7 Double tap"
});

// Handy from the console, and how the smoke tests drive the game.
window.arena = arena;

arena.run();

//<editor-fold desc="Easing curve previews">

const CURVES = [
    { label: "Quadratic.easeOut", fn: Quadratic.easeOut },
    { label: "Cubic.easeInOut", fn: Cubic.easeInOut },
    { label: "Sinusoidal.easeInOut", fn: Sinusoidal.easeInOut },
    { label: "Exponential.easeOut", fn: Exponential.easeOut },
    { label: "Circular.easeInOut", fn: Circular.easeInOut },
    { label: "Back.easeOut", fn: Back.easeOut },
    { label: "Elastic.easeOut", fn: Elastic.easeOut },
    { label: "Bounce.easeOut", fn: Bounce.easeOut }
];

const curveContainer = document.getElementById("curves");
const previews = [];

if (curveContainer) {
    for (const curve of CURVES) {
        const figure = document.createElement("figure");
        figure.className = "curve";

        const preview = document.createElement("canvas");
        const caption = document.createElement("figcaption");
        caption.textContent = curve.label;

        figure.append(preview, caption);
        curveContainer.append(figure);
        previews.push({ canvas: preview, fn: curve.fn });
    }

    const renderCurves = () => {
        for (const preview of previews) drawEasingPreview(preview.canvas, preview.fn);
    };

    // The curves are static, so redraw only when their size can have changed.
    renderCurves();
    window.addEventListener("resize", debounce(renderCurves, 150));
}

function debounce(fn, wait) {
    let handle = 0;
    return (...args) => {
        clearTimeout(handle);
        handle = setTimeout(() => fn(...args), wait);
    };
}

//</editor-fold>
