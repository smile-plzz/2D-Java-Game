import { SessionState } from "./session.js";

const QUICK_REACTIONS = ["👍", "🔥", "⚡", "😮", "GG!", "Nice!", "Close!", "Rematch?"];
const BUBBLE_TIMEOUT_MS = 4500;

/**
 * In-game real-time chat overlay for multiplayer rooms.
 * Provides floating message bubbles, quick reaction chips, and text input.
 */
export class InGameChat {
    /**
     * @param {object} options
     * @param {HTMLElement} options.stageFrame The .stage__frame element
     * @param {import('./session.js').MultiplayerSession} options.session
     * @param {object} [options.audio] AudioBank instance for sound effects
     */
    constructor(options) {
        this.frame = options.stageFrame;
        this.session = options.session;
        this.audio = options.audio || null;

        this.container = null;
        this.bubbleStream = null;
        this.drawer = null;
        this.toggleBtn = null;
        this.inputEl = null;
        this.isOpen = false;

        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        const root = document.createElement("div");
        root.className = "net-chat-root";
        root.hidden = true;

        // Floating message stream
        const bubbleStream = document.createElement("div");
        bubbleStream.className = "net-chat-stream";
        this.bubbleStream = bubbleStream;
        root.appendChild(bubbleStream);

        // Chat toggle button (pinned bottom-left of stage)
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "icon-button net-chat-toggle";
        toggleBtn.setAttribute("type", "button");
        toggleBtn.setAttribute("title", "Toggle Chat (C)");
        toggleBtn.innerHTML = `💬 <span class="net-chat-toggle__label">Chat</span>`;
        this.toggleBtn = toggleBtn;
        root.appendChild(toggleBtn);

        // Chat drawer
        const drawer = document.createElement("div");
        drawer.className = "net-chat-drawer";
        drawer.hidden = true;
        drawer.innerHTML = `
            <div class="net-chat-drawer__header">
                <span class="net-chat-drawer__title">Match Chat</span>
                <button type="button" class="net-chat-drawer__close" aria-label="Close chat">&times;</button>
            </div>
            <div class="net-chat-chips">
                ${QUICK_REACTIONS.map((r) => `<button type="button" class="net-chat-chip">${r}</button>`).join("")}
            </div>
            <form class="net-chat-form" onsubmit="return false;">
                <input
                    type="text"
                    class="net-chat-input"
                    placeholder="Type a message..."
                    maxlength="120"
                    autocomplete="off"
                />
                <button type="submit" class="button button--secondary net-chat-send">Send</button>
            </form>
        `;
        this.drawer = drawer;
        this.inputEl = drawer.querySelector(".net-chat-input");
        root.appendChild(drawer);

        this.container = root;
        this.frame.appendChild(root);
    }

    bindEvents() {
        // Toggle drawer
        this.toggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleDrawer();
        };

        // Close drawer
        const closeBtn = this.drawer.querySelector(".net-chat-drawer__close");
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.closeDrawer();
            };
        }

        // Quick reactions
        const chips = this.drawer.querySelectorAll(".net-chat-chip");
        for (const chip of chips) {
            chip.onclick = (e) => {
                e.stopPropagation();
                this.sendMessage(chip.textContent);
            };
        }

        // Form submit
        const form = this.drawer.querySelector(".net-chat-form");
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = this.inputEl.value.trim();
                if (text) {
                    this.sendMessage(text);
                    this.inputEl.value = "";
                }
            };
        }

        // Prevent game controls while typing
        if (this.inputEl) {
            for (const evt of ["keydown", "keyup", "keypress"]) {
                this.inputEl.addEventListener(evt, (e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                        this.closeDrawer();
                    }
                });
            }
        }

        // Hotkey: press 'C' to toggle chat (when not already typing)
        document.addEventListener("keydown", (e) => {
            if (this.container.hidden) return;
            const active = document.activeElement;
            const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
            if (!isTyping && (e.key === "c" || e.key === "C")) {
                e.preventDefault();
                this.toggleDrawer();
            }
        });

        // Listen for incoming peer chat messages
        this.session.onChat((msg) => {
            this.displayBubble(msg.text, false);
            if (this.audio) {
                try {
                    this.audio.play("pop");
                } catch (e) {}
            }
        });

        // Visibility tied to session state
        this.session.onStateChange((state) => {
            const isConnected = state === SessionState.CONNECTED || state === SessionState.PLAYING;
            this.container.hidden = !isConnected;
            if (!isConnected) {
                this.closeDrawer();
                this.bubbleStream.innerHTML = "";
            }
        });
    }

    toggleDrawer() {
        if (this.isOpen) {
            this.closeDrawer();
        } else {
            this.openDrawer();
        }
    }

    openDrawer() {
        this.isOpen = true;
        this.drawer.hidden = false;
        if (this.inputEl) {
            setTimeout(() => this.inputEl.focus(), 60);
        }
    }

    closeDrawer() {
        this.isOpen = false;
        this.drawer.hidden = true;
        if (this.inputEl) {
            this.inputEl.blur();
        }
    }

    sendMessage(text) {
        if (!text) return;
        const sent = this.session.sendChat(text);
        if (sent) {
            this.displayBubble(text, true);
        }
    }

    displayBubble(text, isSelf) {
        if (!this.bubbleStream) return;

        const bubble = document.createElement("div");
        bubble.className = `net-chat-bubble ${isSelf ? "net-chat-bubble--self" : "net-chat-bubble--peer"}`;

        const author = isSelf ? "You" : "Opponent";
        bubble.innerHTML = `
            <span class="net-chat-bubble__author">${author}:</span>
            <span class="net-chat-bubble__text">${this.escapeHTML(text)}</span>
        `;

        this.bubbleStream.appendChild(bubble);

        // Keep maximum 4 live bubbles
        while (this.bubbleStream.children.length > 4) {
            this.bubbleStream.removeChild(this.bubbleStream.children[0]);
        }

        // Fade out and remove
        setTimeout(() => {
            bubble.classList.add("net-chat-bubble--fadeout");
            setTimeout(() => {
                if (bubble.parentNode) {
                    bubble.parentNode.removeChild(bubble);
                }
            }, 300);
        }, BUBBLE_TIMEOUT_MS);
    }

    escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
}
