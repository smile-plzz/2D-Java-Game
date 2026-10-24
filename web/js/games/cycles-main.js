import { CyclesGame, State, MODE_INFO } from "./cycles.js";
import { bindShell, format } from "./shell.js";
import { MultiplayerSession } from "../net/session.js";
import { LobbyUI } from "../net/lobby.js";
import { InGameChat } from "../net/chat.js";

const canvas = document.getElementById("game");
const stageFrame = document.querySelector(".stage__frame");
const game = new CyclesGame(canvas);
const session = new MultiplayerSession("cycles");

const lobby = new LobbyUI({
    stageFrame,
    session,
    gameId: "cycles",
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
        game.finishMatch("disconnected");
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
                return `Rounds ${format(data.score)} - ${format(data.opponentScore)}. 2-Player Online Battle.`;
            }
            return `Rounds ${format(data.score)} - ${format(data.opponentScore)}. Best streak ${format(data.highScore)}.`;
        }
    },
    resultLabel: (data) => {
        if (data.isOnline) {
            if (data.winner === "disconnected") return "Opponent left";
            const iWon = (data.winner === "host" && data.myRole === "host") || (data.winner === "guest" && data.myRole === "guest");
            return iWon ? "Victory!" : "Defeat!";
        }
        return data.winner === "player" ? "Victory!" : "AI Wins";
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
    touchHint: "Swipe to steer your light cycle"
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
