import { SessionState, Role, sanitizeRoomCode } from "./session.js";

/**
 * Lobby UI controller for hosting and joining multiplayer matches.
 * Renders into the stage frame overlay system with matching neon styles.
 */
export class LobbyUI {
    /**
     * @param {object} options
     * @param {HTMLElement} options.stageFrame The .stage__frame container
     * @param {import('./session.js').MultiplayerSession} options.session
     * @param {string} options.gameId 'c4' or 'pong'
     * @param {() => void} [options.onStartMatch] Called when match successfully connects and starts
     * @param {() => void} [options.onLeaveMatch] Called when match ends or is cancelled
     */
    constructor(options) {
        this.frame = options.stageFrame;
        this.session = options.session;
        this.gameId = options.gameId;
        this.onStartMatch = options.onStartMatch || (() => {});
        this.onLeaveMatch = options.onLeaveMatch || (() => {});

        this.view = "choice"; // 'choice' | 'create' | 'join'
        this.errorMessage = "";
        this.statusMessage = "";

        this.overlay = null;
        this.hudBadge = null;

        this.initDOM();
        this.bindEvents();
        this.checkUrlRoomCode();
    }

    initDOM() {
        // Create Lobby overlay element
        const overlay = document.createElement("div");
        overlay.className = "overlay overlay--lobby";
        overlay.dataset.overlay = "lobby";
        overlay.hidden = true;
        this.overlay = overlay;

        // In-game HUD pill for latency and connection status
        const hudBadge = document.createElement("div");
        hudBadge.className = "net-hud-badge";
        hudBadge.hidden = true;
        hudBadge.innerHTML = `
            <span class="net-hud-badge__dot"></span>
            <span class="net-hud-badge__text">Online</span>
        `;
        this.hudBadge = hudBadge;

        this.frame.appendChild(overlay);
        this.frame.appendChild(hudBadge);

        this.render();
    }

    bindEvents() {
        this.session.onStateChange((state, snapshot) => {
            if (state === SessionState.CONNECTED || state === SessionState.PLAYING) {
                this.overlay.hidden = true;
                this.hudBadge.hidden = false;
                this.updateHudBadge(snapshot.pingMs);
                this.onStartMatch();
            } else if (state === SessionState.DISCONNECTED) {
                this.hudBadge.hidden = true;
            } else if (state === SessionState.WAITING && this.view === "create") {
                this.render();
            }
        });

        this.session.onError(({ error }) => {
            this.errorMessage = error || "Connection error occurred.";
            this.render();
        });

        // Re-render HUD badge on ping updates
        this.session.onStateChange((state, snapshot) => {
            if (this.hudBadge && !this.hudBadge.hidden) {
                this.updateHudBadge(snapshot.pingMs);
            }
        });
    }

    updateHudBadge(pingMs) {
        if (!this.hudBadge) return;
        const text = this.hudBadge.querySelector(".net-hud-badge__text");
        if (text) {
            text.textContent = pingMs > 0 ? `Online · ${pingMs}ms` : "Online";
        }
    }

    checkUrlRoomCode() {
        if (typeof window === "undefined" || !window.location) return;
        try {
            const params = new URLSearchParams(window.location.search);
            const room = params.get("room");
            if (room) {
                const clean = sanitizeRoomCode(room);
                if (clean.length === 6) {
                    this.show();
                    this.view = "join";
                    this.render();
                    const input = this.overlay.querySelector("#lobby-room-code-input");
                    if (input) input.value = clean;
                }
            }
        } catch (e) {
            // Ignore URL search param errors
        }
    }

    show() {
        this.errorMessage = "";
        this.statusMessage = "";
        this.view = "choice";
        this.overlay.hidden = false;
        this.render();
    }

    hide() {
        this.overlay.hidden = true;
    }

    render() {
        if (!this.overlay) return;

        let content = "";
        if (this.view === "choice") {
            content = this.renderChoiceView();
        } else if (this.view === "create") {
            content = this.renderCreateView();
        } else if (this.view === "join") {
            content = this.renderJoinView();
        } else if (this.view === "disconnect") {
            content = this.renderDisconnectView();
        }

        this.overlay.innerHTML = `
            <div class="panel panel--lobby">
                ${content}
            </div>
        `;

        this.attachViewHandlers();
    }

    renderChoiceView() {
        return `
            <p class="panel__eyebrow">Multiplayer</p>
            <h2>Play Online</h2>
            <p class="panel__lead">
                Play head-to-head with a friend on another device across any network.
            </p>
            <div class="panel__actions panel__actions--vertical">
                <button class="button button--primary" data-lobby-action="go-create">Create Room</button>
                <button class="button" data-lobby-action="go-join">Join Room</button>
                <button class="button button--ghost" data-lobby-action="close">Back to Menu</button>
            </div>
        `;
    }

    renderCreateView() {
        const code = this.session.roomCode || "......";
        const isWaiting = this.session.state === SessionState.WAITING;

        return `
            <p class="panel__eyebrow">Room Code</p>
            <h2 class="lobby-code-display" data-field="room-code">${code}</h2>
            <p class="panel__lead">
                ${isWaiting ? "Waiting for opponent to connect..." : "Contacting matchmaking broker..."}
            </p>
            ${this.errorMessage ? `<div class="lobby-error">${this.errorMessage}</div>` : ""}
            <div class="panel__actions lobby-code-actions">
                <button class="button button--secondary" data-lobby-action="copy-code" ${!isWaiting ? "disabled" : ""}>
                    Copy Code
                </button>
                <button class="button button--secondary" data-lobby-action="copy-link" ${!isWaiting ? "disabled" : ""}>
                    Copy Link
                </button>
            </div>
            <p class="lobby-help-text">
                Keep this tab open. The match starts automatically once your friend joins.
            </p>
            <div class="panel__actions">
                <button class="button button--ghost" data-lobby-action="cancel">Cancel</button>
            </div>
        `;
    }

    renderJoinView() {
        return `
            <p class="panel__eyebrow">Enter Code</p>
            <h2>Join Room</h2>
            <p class="panel__lead">
                Enter the 6-character room code from your friend to join their match.
            </p>
            <form class="lobby-join-form" onsubmit="return false;">
                <input
                    type="text"
                    id="lobby-room-code-input"
                    class="lobby-input"
                    placeholder="ABC123"
                    maxlength="6"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    required
                />
                ${this.errorMessage ? `<div class="lobby-error">${this.errorMessage}</div>` : ""}
                ${this.statusMessage ? `<div class="lobby-status">${this.statusMessage}</div>` : ""}
                <div class="panel__actions panel__actions--vertical">
                    <button class="button button--primary" data-lobby-action="submit-join">Join Match</button>
                    <button class="button button--ghost" data-lobby-action="cancel">Back</button>
                </div>
            </form>
        `;
    }

    renderDisconnectView() {
        return `
            <p class="panel__eyebrow">Match Ended</p>
            <h2>Disconnected</h2>
            <p class="panel__lead">
                ${this.errorMessage || "The opponent left or connection was lost."}
            </p>
            <div class="panel__actions panel__actions--vertical">
                <button class="button button--primary" data-lobby-action="reconnect-lobby">Back to Lobby</button>
                <button class="button button--ghost" data-lobby-action="close">Back to Menu</button>
            </div>
        `;
    }

    attachViewHandlers() {
        const overlay = this.overlay;

        // Choice actions
        const btnCreate = overlay.querySelector('[data-lobby-action="go-create"]');
        if (btnCreate) {
            btnCreate.onclick = async () => {
                this.view = "create";
                this.errorMessage = "";
                this.render();
                try {
                    await this.session.createRoom();
                } catch (err) {
                    this.errorMessage = err.message || "Failed to create room.";
                    this.render();
                }
            };
        }

        const btnJoin = overlay.querySelector('[data-lobby-action="go-join"]');
        if (btnJoin) {
            btnJoin.onclick = () => {
                this.view = "join";
                this.errorMessage = "";
                this.statusMessage = "";
                this.render();
                const input = overlay.querySelector("#lobby-room-code-input");
                if (input) input.focus();
            };
        }

        const btnClose = overlay.querySelector('[data-lobby-action="close"]');
        if (btnClose) {
            btnClose.onclick = () => {
                this.session.leave();
                this.hide();
                this.onLeaveMatch();
            };
        }

        const btnCancel = overlay.querySelector('[data-lobby-action="cancel"]');
        if (btnCancel) {
            btnCancel.onclick = () => {
                this.session.leave();
                this.view = "choice";
                this.errorMessage = "";
                this.render();
            };
        }

        const btnReconnect = overlay.querySelector('[data-lobby-action="reconnect-lobby"]');
        if (btnReconnect) {
            btnReconnect.onclick = () => {
                this.session.leave();
                this.show();
            };
        }

        // Copy Code
        const btnCopyCode = overlay.querySelector('[data-lobby-action="copy-code"]');
        if (btnCopyCode) {
            btnCopyCode.onclick = async () => {
                if (!this.session.roomCode) return;
                try {
                    await navigator.clipboard.writeText(this.session.roomCode);
                    const originalText = btnCopyCode.textContent;
                    btnCopyCode.textContent = "Copied!";
                    setTimeout(() => { btnCopyCode.textContent = originalText; }, 1800);
                } catch (e) {
                    btnCopyCode.textContent = "Press Ctrl+C";
                }
            };
        }

        // Copy Link
        const btnCopyLink = overlay.querySelector('[data-lobby-action="copy-link"]');
        if (btnCopyLink) {
            btnCopyLink.onclick = async () => {
                if (!this.session.roomCode) return;
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.set("room", this.session.roomCode);
                    url.searchParams.set("game", this.gameId);
                    await navigator.clipboard.writeText(url.toString());
                    const originalText = btnCopyLink.textContent;
                    btnCopyLink.textContent = "Link Copied!";
                    setTimeout(() => { btnCopyLink.textContent = originalText; }, 1800);
                } catch (e) {
                    btnCopyLink.textContent = "Copy Failed";
                }
            };
        }

        // Join Input and Submit
        const input = overlay.querySelector("#lobby-room-code-input");
        const btnSubmitJoin = overlay.querySelector('[data-lobby-action="submit-join"]');

        if (input) {
            input.oninput = () => {
                input.value = sanitizeRoomCode(input.value);
            };
            input.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (btnSubmitJoin) btnSubmitJoin.click();
                }
            };
        }

        if (btnSubmitJoin && input) {
            btnSubmitJoin.onclick = async () => {
                const code = sanitizeRoomCode(input.value);
                if (code.length !== 6) {
                    this.errorMessage = "Room code must be exactly 6 characters.";
                    this.render();
                    return;
                }

                this.errorMessage = "";
                this.statusMessage = "Connecting to host...";
                btnSubmitJoin.setAttribute("disabled", "true");
                this.render();

                try {
                    await this.session.joinRoom(code);
                } catch (err) {
                    this.errorMessage = err.message || "Failed to join room.";
                    this.statusMessage = "";
                    this.render();
                }
            };
        }
    }

    showDisconnect(reason) {
        this.errorMessage = reason || "Opponent disconnected.";
        this.view = "disconnect";
        this.overlay.hidden = false;
        if (this.hudBadge) this.hudBadge.hidden = true;
        this.render();
    }
}
