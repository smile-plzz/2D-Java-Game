import { PongGame, State, MODE_INFO } from "./pong.js";
import { bindShell, format } from "./shell.js";

const canvas = document.getElementById("game");
const game = new PongGame(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-score-2": (data) => format(data.score),
        "final-opponent": (data) => format(data.opponentScore),
        "final-target": (data) => format(data.target)
    },
    resultLabel: (data) => (data.winner === "player" ? "You win" : "AI wins"),
    touchHint: "Drag to move the paddle"
});

window.game = game;
game.run();
