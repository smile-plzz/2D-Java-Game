import { Quality } from "../framework/quality.js";

/**
 * The chrome around a game: overlays, score readouts, the mode pills and the
 * sound, fullscreen and quality buttons.
 *
 * Every game in the arcade wants the same wiring, so it lives here once and
 * each page passes in only what is particular to it. The canvas owns the HUD;
 * the DOM owns anything the player needs to read, click or tab to.
 */

/** Field bindings every game shares. Keys are data-field attribute values. */
const COMMON_FIELDS = {
    "highscore": (data) => format(data.highScore),
    "pause-score": (data) => format(data.score),
    "final-score": (data) => format(data.score),
    "final-best": (data) => format(data.highScore)
};

const QUALITY_CYCLE = ["auto", "high", "medium", "low"];
const QUALITY_LABELS = {
    auto: "Quality auto",
    high: "Quality high",
    medium: "Quality medium",
    low: "Quality low"
};

function format(value) {
    return Number(value || 0).toLocaleString();
}

/**
 * @param game a Game exposing onStateChange, startGame, snapshot and audio
 * @param options.fields extra data-field bindings, name to (data) => string
 * @param options.modes mode metadata keyed by mode id, each with a label and
 *        a tagline; enables the mode pills when present
 * @param options.resultLabel produces the game over eyebrow from a snapshot
 * @param options.states the game's State enum, for the tap-to-start overlays
 */
export function bindShell(game, options = {}) {
    const overlays = new Map();
    for (const element of document.querySelectorAll("[data-overlay]")) {
        overlays.set(element.dataset.overlay, element);
    }

    const fields = {};
    for (const element of document.querySelectorAll("[data-field]")) {
        fields[element.dataset.field] = element;
    }

    const bindings = { ...COMMON_FIELDS, ...(options.fields || {}) };
    const modes = options.modes || null;
    const states = options.states || {};

    //<editor-fold desc="State mirroring">
    game.onStateChange((state, data) => {
        for (const [name, element] of overlays) {
            element.hidden = name !== state;
        }

        for (const [name, read] of Object.entries(bindings)) {
            const element = fields[name];
            if (element) element.textContent = read(data);
        }

        if (state === states.GAME_OVER && fields["result-label"] && options.resultLabel) {
            fields["result-label"].textContent = options.resultLabel(data);
        }

        if (modes) {
            const info = modes[data.mode];
            if (info) {
                if (fields["mode-eyebrow"]) fields["mode-eyebrow"].textContent = info.label;
                if (fields["mode-tagline"]) fields["mode-tagline"].textContent = info.tagline;
            }
            for (const pill of document.querySelectorAll(".mode-pill")) {
                pill.setAttribute("aria-pressed", String(pill.dataset.mode === data.mode));
            }
        }

        const muteButton = document.querySelector('[data-action="mute"]');
        if (muteButton) {
            muteButton.setAttribute("aria-pressed", String(data.muted));
            if (fields["mute-label"]) {
                fields["mute-label"].textContent = data.muted ? "Sound off" : "Sound on";
            }
        }
    });
    //</editor-fold>

    //<editor-fold desc="Buttons">
    const showQuality = () => {
        if (!fields["quality-label"]) return;
        const setting = Quality.auto ? "auto" : Quality.level;
        fields["quality-label"].textContent = Quality.auto
            ? `Quality auto · ${Quality.level}`
            : QUALITY_LABELS[setting];
    };
    // The automatic ladder changes the level on its own, so the label has to
    // follow it rather than only updating when the button is pressed.
    Quality.onChange(showQuality);
    showQuality();

    const actions = {
        start: () => game.startGame(),
        restart: () => game.startGame(),
        resume: () => game.resume(),
        mute: () => {
            game.audio.ensureContext();
            game.audio.toggleMute();
            game.emit();
        },
        quality: () => {
            const current = Quality.auto ? "auto" : Quality.level;
            const next = QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(current) + 1) % QUALITY_CYCLE.length];
            Quality.prefer(next);
            showQuality();
        },
        fullscreen: () => {
            const frame = document.querySelector(".stage__frame");
            if (document.fullscreenElement) document.exitFullscreen();
            else if (frame && frame.requestFullscreen) frame.requestFullscreen();
        },
        ...(options.actions || {})
    };

    document.addEventListener("click", (event) => {
        const pill = event.target.closest(".mode-pill");
        if (pill && modes) {
            game.setMode(pill.dataset.mode);
            pill.blur();
            return;
        }

        const trigger = event.target.closest("[data-action]");
        if (!trigger) return;
        const action = actions[trigger.dataset.action];
        if (!action) return;
        action();
        // Keep focus off the button so the next keypress goes to the game.
        trigger.blur();
    });
    //</editor-fold>

    // Tapping anywhere on the menu or game over screen starts a run, which is
    // what touch players reach for before they find the button.
    for (const name of [states.MENU, states.GAME_OVER]) {
        const overlay = overlays.get(name);
        if (!overlay) continue;
        overlay.addEventListener("pointerdown", (event) => {
            if (event.target.closest("[data-action], .mode-pill")) return;
            game.startGame();
        });
    }

    // Touch players never see a keyboard, so label the menu with their controls.
    if (options.touchHint && window.matchMedia("(pointer: coarse)").matches) {
        const hint = document.querySelector(".panel__hint");
        if (hint) hint.textContent = options.touchHint;
    }

    return { overlays, fields, actions };
}

export { format };
