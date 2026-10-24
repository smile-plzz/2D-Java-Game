// ES Module wrapper for vendored PeerJS UMD bundle
let PeerClass = null;

if (typeof window !== "undefined") {
    await import("./peerjs.min.js");
    PeerClass = window.Peer || (window.peerjs && window.peerjs.Peer);
} else if (typeof globalThis !== "undefined" && globalThis.Peer) {
    PeerClass = globalThis.Peer;
}

export const Peer = PeerClass;
export default PeerClass;
