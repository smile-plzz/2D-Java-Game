import { BreakerGame, State, MODE_INFO } from "./breaker.js";
import { bindShell, format } from "./shell.js";

const canvas = document.getElementById("game");
const game = new BreakerGame(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-level": (data) => format(data.level)
    },
    resultLabel: (data) =>
        (data.score > 0 && data.score >= data.highScore ? "New best" : "Game over"),
    touchHint: "Drag to move · tap to launch"
});

window.game = game;
game.run();
