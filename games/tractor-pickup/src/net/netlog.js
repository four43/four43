// M-53: the multiplayer debug log, shown by the "?" button in the Multiplayer panel. It keeps the last MAX lines: the server
// socket (message types only), HTTP calls (path and status), every peer connection (its ICE setup, states, candidate types and
// errors) and the panel's own states. It never keeps a token, an SDP, a candidate address or any other IP address.
const MAX = 400;
export function createNetLog() {
  const lines = [], t0 = Date.now(), subs = new Set();
  const log = (...parts) => {
    const s = parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ');
    lines.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s ${s}`); if (lines.length > MAX) lines.shift();
    for (const f of subs) try { f(); } catch (e) { console.warn('netlog listener', e); }
  };
  return { log, text: () => lines.join('\n'), get size() { return lines.length; }, onChange(f) { subs.add(f); return () => subs.delete(f); } };
}

// What a server message says that helps, without secrets: its type, an error code, a member count, `nearby`
const wsSummary = m => {
  if (!m || typeof m !== 'object') return '?';
  const bits = [m.t];
  if (m.t === 'error') bits.push(m.code, m.re ? `(re ${m.re})` : '');
  if ('nearby' in m) bits.push('nearby=' + m.nearby);
  if (Array.isArray(m.members)) bits.push(m.members.length + ' members');
  if (m.t === 'signal' && m.data) bits.push('[' + Object.keys(m.data).join(',') + ']');
  if (m.reason) bits.push(m.reason);
  return bits.filter(Boolean).join(' ');
};
const scheme = u => String(u).split(':')[0];
const iceSummary = cfg => {
  const urls = (cfg?.iceServers || []).flatMap(s => [].concat(s.urls || []));
  const count = {}; for (const u of urls) count[scheme(u)] = (count[scheme(u)] || 0) + 1;
  return `policy=${cfg?.iceTransportPolicy || 'all'} servers=${JSON.stringify(count)}${cfg?.iceTransportPolicy === 'relay' && !count.turn && !count.turns ? ' NO TURN: relay-only cannot connect' : ''}`;
};

// The browser's WebSocket, RTCPeerConnection and fetch, wrapped to write to `log`. Handshake takes them as options (for tests).
export function loggedTransports(log, { WebSocket = globalThis.WebSocket, RTCPeerConnection = globalThis.RTCPeerConnection, fetch = globalThis.fetch } = {}) {
  let pcs = 0;
  const WS = WebSocket && class extends WebSocket {
    constructor(url, p) {
      super(url, p); log('ws connect', String(url).replace(/\?.*$/, ''));
      this.addEventListener('open', () => log('ws open'));
      this.addEventListener('close', e => log('ws close', e.code, e.reason || ''));
      this.addEventListener('error', () => log('ws error'));
      this.addEventListener('message', e => { try { log('ws <-', wsSummary(JSON.parse(e.data))); } catch { log('ws <- (not JSON)'); } });
    }
    send(d) { try { log('ws ->', wsSummary(JSON.parse(d))); } catch { log('ws -> (not JSON)'); } return super.send(d); }
  };
  const PC = RTCPeerConnection && class extends RTCPeerConnection {
    constructor(cfg, ...rest) {
      super(cfg, ...rest); const id = 'pc' + (++pcs), seen = {};
      log(id, 'new', iceSummary(cfg));
      this.addEventListener('connectionstatechange', () => log(id, 'connection', this.connectionState));
      this.addEventListener('iceconnectionstatechange', () => log(id, 'ice', this.iceConnectionState));
      this.addEventListener('icegatheringstatechange', () => log(id, 'gathering', this.iceGatheringState, this.iceGatheringState === 'complete' ? JSON.stringify(seen) : ''));
      this.addEventListener('icecandidate', e => { if (e.candidate) { const k = `${e.candidate.type || '?'}/${e.candidate.protocol || '?'}`; seen[k] = (seen[k] || 0) + 1; } });
      this.addEventListener('icecandidateerror', e => log(id, 'candidate error', e.errorCode, e.errorText || '', scheme(e.url || '')));
      this.addEventListener('datachannel', e => log(id, 'remote channel', e.channel.label));
    }
    setConfiguration(cfg) { log('pc config', iceSummary(cfg)); return super.setConfiguration(cfg); }
    createDataChannel(label, o) { const ch = super.createDataChannel(label, o); ch.addEventListener('open', () => log('channel open', label)); ch.addEventListener('close', () => log('channel close', label)); return ch; }
  };
  const F = fetch && (async (url, o) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    try {
      const r = await fetch(url, o);
      let extra = '';
      if (path.startsWith('/turn') && r.ok) try { const j = await r.clone().json(); extra = iceSummary({ iceServers: j.ice_servers }); } catch (e) { extra = 'unreadable: ' + e; }
      if (path.startsWith('/session') && r.ok) try { const j = await r.clone().json(); extra = 'turn=' + !!j.turn; } catch (e) { extra = 'unreadable: ' + e; }
      log('http', o?.method || 'GET', path, r.status, extra); return r;
    } catch (e) { log('http', o?.method || 'GET', path, 'FAILED', String(e?.message || e)); throw e; }
  });
  return { WebSocket: WS, RTCPeerConnection: PC, fetch: F };
}
