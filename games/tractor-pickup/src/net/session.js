// The Multiplayer panel's controller (M-29..M-36): a Handshake room, the link around it, and the host or guest sync. All errors end
// here as panel text (M-44). Rooms are public (joinable with the code), never listed (server: list = "none", M-46), for 4 players,
// with relayed connections to players who are not nearby (M-48). A room does not survive a reload (M-36).
import { roomLink, withLag } from './link.js';
import { NET_VERSION, MAX_PLAYERS, createWarnOnce } from './protocol.js';

export const SERVER = 'https://handshake.home.four43.com', APP = 'tractor-pickup';
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
  badCode: 'Type the 5 letters and numbers after tractor-pickup-, like K7MX2.', not_found: 'No farm with that name.', full: 'That farm is full.', locked: 'That farm is locked.',
  version_mismatch: 'Update the game on both devices.', rate_limited: 'Too many tries. Wait a minute.', network: "Can't reach the server. Trying again…",
  timeout: "Can't reach the server.", closed: "Can't reach the server.", other: 'Something went wrong. Try again.', joinNetwork: "Can't reach the server. Try again.",
  noFarm: "Can't connect to the farm.", // joined, but no welcome from the host in 10 s (no peer connection)
  no_turn: "This device is not on the host's network, and the server has no relay (TURN). Join from the same Wi-Fi.", // C-2: a guest that is not nearby could never connect (M-48)
  control: "Can't change the farm now. Try again.", // Lock or Remove refused (the socket is down, or no answer)
  lost: 'The room closed.', kicked: 'You were removed from the farm.', // closed reasons: the room ended without a tap here
};
ERRORS.bad_key = ERRORS.not_found; // a private room without its key looks like no room (tractor rooms are public; peek(code) sends no key)
const errText = e => ERRORS[e?.code] || ERRORS.other, joinText = e => e?.code === 'network' ? ERRORS.joinNetwork : errText(e); // only Host retries by itself
// log (M-53): the debug log's log(...), or nothing; transports: the logged WebSocket, RTCPeerConnection and fetch for Handshake.
// bind (lion-hawk 2g G5, the engine path): bind({ role, transport }) → { sync: () => the sim's sync or null, close(then) }. With it, a
// joined room's link goes to the engine (a port) instead of a sync made here: `sync` reads the getter (null until the step after
// the bind), and Stop or Leave call close, which ends the sim's sync (net.close) and calls then() once its leave has gone out.
// Without it the session makes and steps the sync itself (the old main.js's path, removed in lion-hawk 2g G7; session.test.mjs still covers it).
export function createSession({ Handshake, server = SERVER, lag = null, getPaint, onChange = () => {}, retryMs = 10000, welcomeMs = 10000, log = () => {}, transports = {}, bind = null }) {
  if (typeof bind !== 'function') throw new Error('session: bind is required (the engine path; lion-hawk 0.13)');
  let welcomed = false, hs = null, room = null, sync = null, bound = null, state = 'idle', error = null, code = null, info = null, retry = 0, stuck = false, waitT = 0; // stuck: joined, no welcome after welcomeMs
  const cur = () => bound ? bound.sync() : sync; // the sync the panel reads: the sim's on the engine path
  const unstick = () => { clearTimeout(waitT); stuck = false; };
  let said = '';
  const changed = () => { const k = `${state}${error ? ' error: ' + error : ''}`; if (k !== said) { said = k; log('panel', k); } try { onChange(); } catch (e) { console.warn(e); } };
  const fail = (what, e) => log(what, 'failed:', e?.code || 'no code', e?.message || String(e ?? ''));
  const client = () => { if (!hs) log('client', server, 'app', APP, 'version', NET_VERSION); return (hs ||= new Handshake({ server, app: APP, version: NET_VERSION, relayUnlessNearby: true, ...transports })); };
  const link = r => { const n = roomLink(r); return lag ? withLag(n, lag) : n; };
  const drop = () => { sync?.close(); sync = null; room = null; code = null; info = null; };
  // the engine path: the sim ends its sync and leaves the room through the port; the session leaves too once that has gone out
  // (a room that is closed already is not left twice), and closes an idle client
  const unbind = r => { const b = bound; bound = null; if (!b) return false; b.close(() => { if (r && !r.closed) r.leave(); if (state === 'idle') idleClient(); }); return true; };
  const idleClient = () => { if (!room) { hs?.close(); hs = null; } }; // a Handshake that has peeked keeps its socket open until close()
  // any closed reason ('kicked', 'left', 'replaced', 'lost', host gone) ends the room; the guest sync has already gone alone (M-41)
  const watch = r => r.on('closed', why => { if (room !== r) return; unstick(); error = why === 'lost' || why === 'kicked' ? ERRORS[why] : null; if (state === 'joined') { room = null; sync = null; code = null; state = 'idle'; } else if (state === 'hosting') { drop(); state = 'idle'; } unbind(null); idleClient(); changed(); });
  const warn = createWarnOnce(), refused = (r, e) => { if (room !== r) return; warn('multiplayer control', e); error = ERRORS.control; }; // M-44: panel text; a room that is gone needs none
  const statusOf = p => { if (p.away) return 'away'; const id = p.peer || (state === 'joined' && p.n === 1 ? room?.hostId : null), peer = id && room?.peers.get(id); return peer?.connectionType || 'connecting'; }; // a guest's store has no peer ids: its host row uses room.hostId
  const s = {
    get sync() { return cur(); }, get isGuest() { return state === 'joined'; }, get inRoom() { return !!(bound || sync); },
    view() {
      const players = [], y = cur(); // the engine path: no sync until the step after the bind (a host shows itself)
      if (y || (bound && state === 'hosting')) { const me = y?.you || 1;
        players.push({ n: me, paint: getPaint(), you: true, host: me === 1, status: '' });
        if (y) for (const p of y.players.list()) players.push({ n: p.n, paint: p.paint, you: false, host: p.n === 1, status: state === 'joined' && p.n !== 1 ? (p.away ? 'away' : '') : statusOf(p) });
        players.sort((a, b) => a.n - b.n); }
      return { state, code, name: code && roomName(code), url: code && (typeof location === 'undefined' ? '?r=' + code : joinUrl(code)), locked: !!room?.locked, players, info, connected: state === 'hosting' || (state === 'joined' && !!y?.you), error: state === 'joined' && stuck && !y?.you ? ERRORS.noFarm : error };
    },
    // after every await: a result for a client that was closed (Cancel, Back, Stop) or a state that moved on is stale and changes nothing
    async host() {
      if (state !== 'idle') return; state = 'starting'; error = null; changed(); // a second tap makes no second room
      const h = client(), stale = () => hs !== h || state !== 'starting'; let r = null;
      try {
        r = await h.createRoom({ public: true, maxPlayers: MAX_PLAYERS, meta: {} });
        if (stale()) { if (!r.closed) r.leave(); return; }
        if (!CODE.test(r.code)) throw { code: 'other' }; // the code goes into the QR link
        bound = bind({ role: 'host', transport: link(r) });
        room = r; code = r.code; watch(r); state = 'hosting';
        r.on('members', changed); r.on('meta', changed); r.on('peerAway', changed); r.on('peerBack', changed); r.on('peerLeft', changed); r.on('peer', p => { p.on?.('type', changed); changed(); });
      } catch (e) {
        fail('host', e); if (r && room !== r && !r.closed) r.leave(); if (stale()) return;
        error = errText(e); if (e?.code === 'network' || e?.code === 'timeout') { clearTimeout(retry); retry = setTimeout(() => { if (state === 'starting') { state = 'idle'; s.host(); } }, retryMs); } else { state = 'idle'; idleClient(); } // M-31
      }
      changed();
    },
    stopHosting() { clearTimeout(retry); const r = room; drop(); state = 'idle'; error = null; if (!unbind(r)) { if (r && !r.closed) r.leave(); idleClient(); } changed(); },
    openJoin() { state = 'join'; error = null; info = null; changed(); },
    async submitCode(text) {
      const c = parseRoomInput(text); if (!c) { error = ERRORS.badCode; changed(); return; }
      state = 'checking'; error = null; changed();
      const h = client(), stale = () => hs !== h || state !== 'checking';
      try { const i = await h.peek(c); if (stale()) return; if (i.locked) throw { code: 'locked' }; if (i.full) throw { code: 'full' }; code = c; info = { players: i.players }; state = 'prompt'; }
      catch (e) { fail('check code', e); if (stale()) return; state = 'join'; error = joinText(e); }
      changed();
    },
    async confirmJoin() {
      if (state !== 'prompt') return; state = 'joining'; welcomed = false; changed();
      const h = client(), stale = () => hs !== h || state !== 'joining'; let r = null;
      try { r = await h.joinRoom(code); if (stale()) { if (!r.closed) r.leave(); return; }
        const b = bound = bind({ role: 'guest', transport: link(r) });
        room = r; watch(r); state = 'joined';
        unstick(); waitT = setTimeout(() => { if (bound === b && room === r && !cur()?.you) { stuck = true; log('no welcome from the host after', welcomeMs / 1000, 's: no peer connection?'); changed(); } }, welcomeMs); waitT?.unref?.(); // the panel says so; Leave still works
        r.on('members', changed); r.on('hostAway', changed); r.on('hostBack', changed); r.on('peer', p => { p.on?.('type', changed); changed(); }); } // the host row follows the real connection
      catch (e) { fail('join', e); if (r && room !== r && !r.closed) r.leave(); if (stale()) return; state = 'join'; error = joinText(e); code = null; info = null; idleClient(); }
      changed();
    },
    cancel() { if (state === 'prompt' || state === 'join' || state === 'checking') { state = 'idle'; code = null; info = null; error = null; idleClient(); changed(); } },
    leave() { unstick(); const r = room; room = null; state = 'idle'; sync?.close(); sync = null; code = null; if (!unbind(r)) { if (!r?.closed) r?.leave(); idleClient(); } changed(); }, // M-41: the guest goes on alone
    lock(on) { const r = room; if (!r) return; error = null; r.lock(on).catch(e => refused(r, e)).finally(changed); changed(); }, // the switch follows room.locked (the meta event)
    remove(n) { const p = cur()?.players.map.get(n), r = room; if (!p?.peer || !r) return; error = null; r.kick(p.peer).catch(e => refused(r, e)).finally(changed); },
    before(now) { const e = sync ? sync.before(now) : []; s.poll(); return e; },
    // the welcome's log line and a late welcome's cleared panel text (M-33). The engine path calls it after each step (the sim steps the sync)
    poll() { const y = cur(); if (state === 'joined' && y?.you && !welcomed) { welcomed = true; log('welcome: this device is player', y.you); changed(); } if (stuck && y?.you) { stuck = false; changed(); } },
    after(events, now) { sync?.after(events, now); },
    showStarted() { sync?.showStarted(); }, delivered(r) { sync?.delivered(r); }, requestHelp: () => !!(sync && state === 'joined' && sync.requestHelp()),
    setGame(g) { sync?.setGame(g); }, setPaint(p) { sync?.setPaint(p); },
  };
  return s;
}
