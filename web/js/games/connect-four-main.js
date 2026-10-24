import { ConnectFourGame, State, MODE_INFO } from "./connectfour.js";
import { bindShell } from "./shell.js";
import { MultiplayerSession } from "../net/session.js";
import { LobbyUI } from "../net/lobby.js";
import { InGameChat } from "../net/chat.js";

const canvas = document.getElementById("game");
const stageFrame = document.querySelector(".stage__frame");
const game = new ConnectFourGame(canvas);
const session = new MultiplayerSession("c4");

const lobby = new LobbyUI({
    stageFrame,
    session,
    gameId: "c4",
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
        "gameover-lead": (data) => {
            if (data.isOnline) {
                return "2-Player Online Match";
            }
            return `Win streak. Best ${data.highScore}.`;
        }
    },
    resultLabel: (data) => {
        if (data.isOnline) {
            if (data.winner === "draw") return "Draw";
            if (data.winner === "disconnected") return "Opponent left";
            const iWon = (data.winner === "host" && data.myRole === 1) || (data.winner === "guest" && data.myRole === 2);
            return iWon ? "You win!" : "Opponent wins!";
        }
        if (data.winner === "player") return "You win";
        return data.winner === "ai" ? "AI wins" : "Draw";
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
    touchHint: "Tap a column"
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
