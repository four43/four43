// src/net/link.js
// The game-level link (M-20, M-21): transports, the memory hub, ?lag= and room links live in lion-hawk/net now (#77).
export { emitter, createMemoryHub, parseLag, withLag, roomLink } from 'lion-hawk/net';
