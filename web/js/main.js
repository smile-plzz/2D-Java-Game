import { Arena, State, drawEasingPreview } from "./game/arena.js";
import {
    Back, Bounce, Circular, Cubic, Elastic, Exponential, Quadratic, Sinusoidal
} from "./framework/ease.js";

const canvas = document.getElementById("game");
const arena = new Arena(canvas);

const overlays = new Map();
for (const element of document.querySelectorAll("[data-overlay]")) {
    overlays.set(element.dataset.overlay, element);
}

const fields = {};
for (const element of document.querySelectorAll("[data-field]")) {
    fields[element.dataset.field] = element;
}

const format = (value) => value.toLocaleString();

/**
 * Mirrors the game's state onto the DOM overlays. The canvas owns the HUD; the
 * DOM owns anything the player needs to read, click or tab to.
 */
arena.onStateChange((state, data) => {
    for (const [name, element] of overlays) {
        element.hidden = name !== state;
    }

    if (fields.highscore) fields.highscore.textContent = format(data.highScore);
    if (fields["pause-score"]) fields["pause-score"].textContent = format(data.score);
    if (fields["final-score"]) fields["final-score"].textContent = format(data.score);
    if (fields["final-wave"]) fields["final-wave"].textContent = format(Math.max(data.wave, 1));
    if (fields["final-best"]) fields["final-best"].textContent = format(data.highScore);

    if (state === State.GAME_OVER && fields["result-label"]) {
        const isRecord = data.score > 0 && data.score >= data.highScore;
        fields["result-label"].textContent = isRecord ? "New best" : "Game over";
    }

    const muteButton = document.querySelector('[data-action="mute"]');
    if (muteButton) {
        muteButton.setAttribute("aria-pressed", String(data.muted));
        if (fields["mute-label"]) {
            fields["mute-label"].textContent = data.muted ? "Sound off" : "Sound on";
        }
    }
});

const actions = {
    start: () => arena.startGame(),
    restart: () => arena.startGame(),
    resume: () => arena.resume(),
    mute: () => {
        arena.audio.ensureContext();
        arena.audio.toggleMute();
        arena.emit();
    },
    fullscreen: () => {
        const frame = document.querySelector(".stage__frame");
        if (document.fullscreenElement) document.exitFullscreen();
        else if (frame.requestFullscreen) frame.requestFullscreen();
    }
};

document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = actions[trigger.dataset.action];
    if (!action) return;
    action();
    // Keep focus off the button so the next keypress goes to the game.
    trigger.blur();
});

// Tapping anywhere on the menu or game over screen starts a run, which is what
// touch players reach for before they find the button.
for (const name of [State.MENU, State.GAME_OVER]) {
    const overlay = overlays.get(name);
    if (!overlay) continue;
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-action]")) return;
        arena.startGame();
    });
}

// Handy from the console, and how the smoke tests drive the game.
window.arena = arena;

// Touch players never see a keyboard, so label the menu with their controls.
if (window.matchMedia("(pointer: coarse)").matches) {
    const hint = document.querySelector(".panel__hint");
    if (hint) hint.textContent = "Left stick \u00b7 Right stick \u00b7 Double tap";
}

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
