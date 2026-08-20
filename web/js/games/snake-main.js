import { SnakeGame, State, MODE_INFO } from "./snake.js";
import { bindShell, format } from "./shell.js";

const canvas = document.getElementById("game");
const game = new SnakeGame(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-length": (data) => format(Math.max(data.length, 1))
    },
    resultLabel: (data) =>
        (data.score > 0 && data.score >= data.highScore ? "New best" : "Game over"),
    touchHint: "Swipe to steer"
});

window.game = game;
game.run();
