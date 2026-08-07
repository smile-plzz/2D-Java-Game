import { PongGame, State } from "./pong.js";

const canvas = document.getElementById("game");
const game = new PongGame(canvas);

const overlays = new Map();
for (const element of document.querySelectorAll("[data-overlay]")) {
    overlays.set(element.dataset.overlay, element);
}

const fields = {};
for (const element of document.querySelectorAll("[data-field]")) {
    fields[element.dataset.field] = element;
}

const format = (value) => value.toLocaleString();

game.onStateChange((state, data) => {
    for (const [name, element] of overlays) {
        element.hidden = name !== state;
    }

    if (fields.highscore) fields.highscore.textContent = format(data.highScore);
    if (fields["pause-score"]) fields["pause-score"].textContent = format(data.score);
    if (fields["final-score"]) fields["final-score"].textContent = format(data.score);
    if (fields["final-score-2"]) fields["final-score-2"].textContent = format(data.score);
    if (fields["final-opponent"]) fields["final-opponent"].textContent = format(data.opponentScore);
    if (fields["final-best"]) fields["final-best"].textContent = format(data.highScore);

    if (state === State.GAME_OVER && fields["result-label"]) {
        fields["result-label"].textContent = data.winner === "player" ? "You win" : "AI wins";
    }

    const muteButton = document.querySelector('[data-action="mute"]');
    if (muteButton) {
        muteButton.setAttribute("aria-pressed", String(data.muted));
        if (fields["mute-label"]) fields["mute-label"].textContent = data.muted ? "Sound off" : "Sound on";
    }
});

const actions = {
    start: () => game.startGame(),
    restart: () => game.startGame(),
    resume: () => game.resume(),
    mute: () => {
        game.audio.ensureContext();
        game.audio.toggleMute();
        game.emit();
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
    trigger.blur();
});

if (window.matchMedia("(pointer: coarse)").matches) {
    const hint = document.querySelector(".panel__hint");
    if (hint) hint.textContent = "Drag to move your paddle";
}

window.game = game;
game.run();
