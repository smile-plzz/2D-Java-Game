import { AsteroidsGame, State, MODE_INFO } from "./asteroids.js";
import { bindShell, format } from "./shell.js";

const canvas = document.getElementById("game");
const game = new AsteroidsGame(canvas);

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-score": (data) => format(data.score),
        "final-wave": (data) => format(data.wave),
        "final-best": (data) => format(data.highScore),
        "gameover-lead": (data) => {
            if (data.mode === "blitz") {
                return `Scored ${format(data.score)} points. Peak combo x${format(data.combo)}.`;
            }
            return `Reached wave ${format(data.wave)} with ${format(data.score)} points. Best ${format(data.highScore)}.`;
        }
    },
    resultLabel: (data) =>
        (data.score > 0 && data.score >= data.highScore ? "New best" : "Game over"),
    touchHint: "Left side thrust · Right side fire"
});

window.game = game;
game.run();
