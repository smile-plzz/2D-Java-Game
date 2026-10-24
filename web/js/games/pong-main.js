import { PongGame, State, MODE_INFO } from "./pong.js";
import { bindShell, format } from "./shell.js";
import { MultiplayerSession } from "../net/session.js";
import { LobbyUI } from "../net/lobby.js";
import { InGameChat } from "../net/chat.js";

const canvas = document.getElementById("game");
const stageFrame = document.querySelector(".stage__frame");
const game = new PongGame(canvas);
const session = new MultiplayerSession("pong");

const lobby = new LobbyUI({
    stageFrame,
    session,
    gameId: "pong",
    onStartMatch: () => {
        game.startOnlineMatch(session);
    },
    onLeaveMatch: () => {
        game.leaveOnline();
    }
});

const chat = new InGameChat({
    stageFrame,
    session,
    audio: game.audio
});

session.onError(({ error }) => {
    if (game.isOnline) {
        lobby.showDisconnect(error);
        game.finishOnline("disconnected");
    }
});

bindShell(game, {
    states: State,
    modes: MODE_INFO,
    fields: {
        "final-score-2": (data) => format(data.score),
        "final-opponent": (data) => format(data.opponentScore),
        "final-target": (data) => format(data.target),
        "gameover-lead": (data) => {
            if (data.isOnline) {
                return `Final score ${format(data.score)} - ${format(data.opponentScore)}. 2-Player Online Match.`;
            }
            return `Final score ${format(data.score)} - ${format(data.opponentScore)}. Best ${format(data.highScore)}.`;
        }
    },
    resultLabel: (data) => {
        if (data.isOnline) {
            if (data.winner === "disconnected") return "Opponent left";
            const iWon = (data.winner === "host" && data.myRole === "host") || (data.winner === "guest" && data.myRole === "guest");
            return iWon ? "You win!" : "Opponent wins!";
        }
        return data.winner === "player" ? "You win" : "AI wins";
    },
    actions: {
        online: () => {
            lobby.show();
        },
        restart: () => {
            if (game.isOnline) {
                game.requestRematch();
            } else {
                game.startGame();
            }
        },
        "leave-online": () => {
            game.leaveOnline();
            lobby.hide();
        }
    },
    touchHint: "Drag to move the paddle"
});

game.onStateChange((state, data) => {
    const leaveBtn = document.querySelector('[data-field="leave-online-btn"]');
    if (leaveBtn) {
        leaveBtn.hidden = !data.isOnline;
    }
});

window.game = game;
window.lobby = lobby;
window.session = session;
window.chat = chat;
game.run();
