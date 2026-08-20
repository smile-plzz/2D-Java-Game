import { ConnectFourGame, State, MODE_INFO } from "./connectfour.js";
import { bindShell } from "./shell.js";

const canvas = document.getElementById("game");
const game = new ConnectFourGame(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    resultLabel: (data) => {
        if (data.winner === "player") return "You win";
        return data.winner === "ai" ? "AI wins" : "Draw";
    },
    touchHint: "Tap a column"
});

window.game = game;
game.run();
