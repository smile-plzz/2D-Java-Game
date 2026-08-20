import { Game2048, State, MODE_INFO } from "./game2048.js";
import { bindShell, format } from "./shell.js";

const canvas = document.getElementById("game");
const game = new Game2048(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-tile": (data) => format(data.reached)
    },
    resultLabel: (data) => {
        if (data.reached >= data.target) return `${data.target} reached`;
        return data.score > 0 && data.score >= data.highScore ? "New best" : "No moves left";
    },
    touchHint: "Swipe to slide the tiles"
});

window.game = game;
game.run();
