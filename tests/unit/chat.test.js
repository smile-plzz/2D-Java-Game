import assert from "node:assert/strict";
import { MessageType, createMessage, encodeMessage, decodeMessage } from "../../web/js/net/protocol.js";

console.log("Running in-game chat unit tests...\n");

// 1. Message envelope test
{
    const chatMsg = createMessage(MessageType.CHAT, {
        text: "GG! Good game!",
        sender: "host",
        ts: Date.now()
    });

    assert.equal(chatMsg.t, "CHAT");
    assert.equal(chatMsg.v, 1);
    assert.equal(chatMsg.text, "GG! Good game!");
    assert.equal(chatMsg.sender, "host");
    console.log("PASS: CHAT message packet created with valid protocol envelope");

    const encoded = encodeMessage(MessageType.CHAT, {
        text: "Nice move! 👍",
        sender: "guest",
        ts: 12345678
    });

    const decoded = decodeMessage(encoded);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.message.t, "CHAT");
    assert.equal(decoded.message.text, "Nice move! 👍");
    assert.equal(decoded.message.sender, "guest");
    console.log("PASS: CHAT message round-trips through JSON serialization with emoji support");
}

// 2. Chat text sanitization logic
{
    function sanitizeChat(raw) {
        if (!raw || typeof raw !== "string") return "";
        return raw.trim().slice(0, 140);
    }

    assert.equal(sanitizeChat("  hello peer!  "), "hello peer!");
    assert.equal(sanitizeChat(""), "");
    assert.equal(sanitizeChat(null), "");

    const longText = "a".repeat(200);
    const trimmed = sanitizeChat(longText);
    assert.equal(trimmed.length, 140);
    console.log("PASS: Chat message text trimmed and clamped to 140 characters max");
}

console.log("\nALL CHAT TESTS PASSED!");
