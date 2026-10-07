// The Multiplayer panel's controller (M-29..M-36): a Handshake room, the link around it, and the host or guest sync. All errors end
// here as panel text (M-44). Rooms are public (joinable with the code), never listed (server: list = "none", M-46), for 4 players,
// with relayed connections to players who are not nearby (M-48). A room does not survive a reload (M-36).
import { roomLink, withLag } from './link.js';
import { createHostSync } from './host.js';
import { createGuestSync } from './guest.js';
import { NET_VERSION, MAX_PLAYERS } from './protocol.js';

export const SERVER = 'https://handshake.four43.com', APP = 'tractor-pickup';
export const roomName = code => 'tractor-pickup-' + code;
export const joinUrl = (code, loc = location) => loc.origin + loc.pathname + '?r=' + code;
// M-28, M-48: ?signal= may name only a local Handshake (tests) or this page's own origin. A link to any other server is ignored (undefined: the default
// server), so a crafted link cannot send players to a server that calls everyone nearby and so skips the relay-only rule.
export function signalServer(s, origin) {
  let u; try { u = new URL(s); } catch { return undefined; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.origin === origin ? s : undefined;
}
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/; // the server's join alphabet
export const parseRoomInput = s => { const m = typeof s === 'string' && s.trim().toUpperCase().replace(/^TRACTOR-PICKUP-/, ''); return m && CODE.test(m) ? m : null; };
export const ERRORS = {
  badCode: 'Room names look like tractor-pickup-K7MX2.', not_found: 'No farm with that name.', full: 'That farm is full.', locked: 'That farm is locked.',
  version_mismatch: 'Update the game on both devices.', rate_limited: 'Too many tries. Wait a minute.', network: "Can't reach the server. Trying again…",
  timeout: "Can't reach the server.", closed: "Can't reach the server.", other: 'Something went wrong. Try again.', joinNetwork: "Can't reach the server. Try again.",
  noFarm: "Can't connect to the farm.", // joined, but no welcome from the host in 10 s (no peer connection)
  lost: 'The room closed.', kicked: 'You were removed from the farm.', // closed reasons: the room ended without a tap here
};
ERRORS.bad_key = ERRORS.not_found; // a private room without its key looks like no room (tractor rooms are public; peek(code) sends no key)
const errText = e => ERRORS[e?.code] || ERRORS.other, joinText = e => e?.code === 'network' ? ERRORS.joinNetwork : errText(e); // only Host retries by itself
export function createSession({ Handshake, server = SERVER, lag = null, getGame, onFarm, getPaint, onChange = () => {}, retryMs = 10000, welcomeMs = 10000 }) {
  let hs = null, room = null, sync = null, state = 'idle', error = null, code = null, info = null, retry = 0, stuck = false, waitT = 0; // stuck: joined, no welcome after welcomeMs
  const unstick = () => { clearTimeout(waitT); stuck = false; };
  const changed = () => { try { onChange(); } catch (e) { console.warn(e); } };
  const client = () => (hs ||= new Handshake({ server, app: APP, version: NET_VERSION, relayUnlessNearby: true }));
  const link = r => { const n = roomLink(r); return lag ? withLag(n, lag) : n; };
  const drop = () => { sync?.close(); sync = null; room = null; code = null; info = null; };
  const idleClient = () => { if (!room) { hs?.close(); hs = null; } }; // a Handshake that has peeked keeps its socket open until close()
  // any closed reason ('kicked', 'left', 'replaced', 'lost', host gone) ends the room; the guest sync has already gone alone (M-41)
  const watch = r => r.on('closed', why => { if (room !== r) return; unstick(); error = why === 'lost' || why === 'kicked' ? ERRORS[why] : null; if (state === 'joined') { room = null; sync = null; code = null; state = 'idle'; } else if (state === 'hosting') { drop(); state = 'idle'; } idleClient(); changed(); });
  const statusOf = p => { if (p.away) return 'away'; const id = p.peer || (state === 'joined' && p.n === 1 ? room?.hostId : null), peer = id && room?.peers.get(id); return peer?.connectionType || 'connecting'; }; // a guest's store has no peer ids: its host row uses room.hostId
  const s = {
    get sync() { return sync; }, get isGuest() { return state === 'joined'; }, get inRoom() { return !!sync; },
    view() {
      const players = [];
      if (sync) { const me = sync.you || 1;
        players.push({ n: me, paint: getPaint(), you: true, host: me === 1, status: '' });
        for (const p of sync.players.list()) players.push({ n: p.n, paint: p.paint, you: false, host: p.n === 1, status: state === 'joined' && p.n !== 1 ? (p.away ? 'away' : '') : statusOf(p) });
        players.sort((a, b) => a.n - b.n); }
      return { state, code, name: code && roomName(code), url: code && (typeof location === 'undefined' ? '?r=' + code : joinUrl(code)), locked: !!room?.locked, players, info, error: state === 'joined' && stuck && !sync?.you ? ERRORS.noFarm : error };
    },
    // after every await: a result for a client that was closed (Cancel, Back, Stop) or a state that moved on is stale and changes nothing
    async host() {
      if (state !== 'idle') return; state = 'starting'; error = null; changed(); // a second tap makes no second room
      const h = client(), stale = () => hs !== h || state !== 'starting'; let r = null;
      try {
        r = await h.createRoom({ public: true, maxPlayers: MAX_PLAYERS, meta: {} });
        if (stale()) { if (!r.closed) r.leave(); return; }
        if (!CODE.test(r.code)) throw { code: 'other' }; // the code goes into the QR link
        const y = createHostSync({ game: getGame(), net: link(r), paint: getPaint() });
        room = r; code = r.code; sync = y; watch(r); state = 'hosting';
        r.on('members', changed); r.on('meta', changed); r.on('peerAway', changed); r.on('peerBack', changed); r.on('peerLeft', changed); r.on('peer', p => { p.on?.('type', changed); changed(); });
      } catch (e) {
        if (r && room !== r && !r.closed) r.leave(); if (stale()) return;
        error = errText(e); if (e?.code === 'network' || e?.code === 'timeout') { clearTimeout(retry); retry = setTimeout(() => { if (state === 'starting') { state = 'idle'; s.host(); } }, retryMs); } else { state = 'idle'; idleClient(); } // M-31
      }
      changed();
    },
    stopHosting() { clearTimeout(retry); const r = room; drop(); if (r && !r.closed) r.leave(); idleClient(); state = 'idle'; error = null; changed(); },
    openJoin() { state = 'join'; error = null; info = null; changed(); },
    async submitCode(text) {
      const c = parseRoomInput(text); if (!c) { error = ERRORS.badCode; changed(); return; }
      state = 'checking'; error = null; changed();
      const h = client(), stale = () => hs !== h || state !== 'checking';
      try { const i = await h.peek(c); if (stale()) return; if (i.locked) throw { code: 'locked' }; if (i.full) throw { code: 'full' }; code = c; info = { players: i.players }; state = 'prompt'; }
      catch (e) { if (stale()) return; state = 'join'; error = joinText(e); }
      changed();
    },
    async confirmJoin() {
      if (state !== 'prompt') return; state = 'joining'; changed();
      const h = client(), stale = () => hs !== h || state !== 'joining'; let r = null;
      try { r = await h.joinRoom(code); if (stale()) { if (!r.closed) r.leave(); return; }
        const y = createGuestSync({ game: getGame(), net: link(r), paint: getPaint(), onFarm }); room = r; sync = y; watch(r); state = 'joined';
        unstick(); waitT = setTimeout(() => { if (sync === y && !y.you) { stuck = true; changed(); } }, welcomeMs); waitT?.unref?.(); // the panel says so; Leave still works
        r.on('members', changed); r.on('hostAway', changed); r.on('hostBack', changed); r.on('peer', p => { p.on?.('type', changed); changed(); }); } // the host row follows the real connection
      catch (e) { if (r && room !== r && !r.closed) r.leave(); if (stale()) return; state = 'join'; error = joinText(e); code = null; info = null; idleClient(); }
      changed();
    },
    cancel() { if (state === 'prompt' || state === 'join' || state === 'checking') { state = 'idle'; code = null; info = null; error = null; idleClient(); changed(); } },
    leave() { unstick(); const r = room; room = null; state = 'idle'; sync?.close(); sync = null; code = null; if (!r?.closed) r?.leave(); idleClient(); changed(); }, // M-41: the guest goes on alone
    lock(on) { room?.lock(on); changed(); },
    remove(n) { const p = sync?.players.map.get(n); if (p?.peer) room?.kick(p.peer); },
    before(now) { const e = sync ? sync.before(now) : []; if (stuck && sync?.you) { stuck = false; changed(); } return e; }, // a late welcome clears the panel text
    after(events, now) { sync?.after(events, now); },
    showStarted() { sync?.showStarted(); }, delivered(r) { sync?.delivered(r); }, requestHelp: () => !!(sync && state === 'joined' && sync.requestHelp()),
    setGame(g) { sync?.setGame(g); }, setPaint(p) { sync?.setPaint(p); },
  };
  return s;
}
