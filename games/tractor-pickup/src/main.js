// Tractor Pickup's browser entry on the lion-hawk engine (2g G1; the shipped entry since G7): Rapier first (#6),
// then boot the sim half with the view half and the devices. The stored records are the farm's args (#84), and the sim's
// `progress`, `settings` and `bed` events are saved back. #35: a random engine seed per visit; ?seed= and ?lh-test win inside boot.
// G4: the 1 Hz wall date for bedtime (#85), audio unlock and page hide (X-13, D-1), the back guard (X-14, D-2).
// G5: the Multiplayer panel's session binds a joined Handshake room to the engine through a port (#75); ?lag=, ?signal= and ?r=
// as the old main.js; the netlog; ?lh-bridge=host|guest (tests, with ?lh-test) binds lion-hawk/playwright's Node bridge instead.
import R from '@dimforge/rapier3d-compat';
import { boot } from 'lion-hawk/view';
import { bridgeTransport, parseLag } from 'lion-hawk/net';
import { bindPort } from './net/bind.js';
import { Handshake } from './net/handshake.js';
import { createNetLog, loggedTransports } from './net/netlog.js';
import { createSession, parseRoomInput, signalServer } from './net/session.js';
import { START_PAINT } from './net/players.js';
import { tractorGame } from './game.sim.js';
import { tractorView, audioOf } from './game.view.js';
import { devices } from './devices.js';
import { rig } from './view/rig.js';
import { hudMarkup } from './view/hud.js';
import { load, save } from './ui/store.js';
import { TYPES } from './sim/herd.js';
import { DEFAULT_SETTINGS, seedParam, powerParam, clampSettings, clampProgress, emptyProgress } from './sim/progress.js';
import { clampBedtime } from './sim/bedtime.js';

// X-15: no storage content may stop the game starting (the old main.js's safe)
const safe = (fn, fallback) => { try { return fn(); } catch (e) { console.warn('saved data ignored', e); return fallback(); } };

async function start() {
  await R.init();
  const q = new URLSearchParams(location.search), sandbox = q.has('sandbox');
  const settings = safe(() => clampSettings(load('tp-settings', DEFAULT_SETTINGS)), () => clampSettings({})), progress = safe(() => clampProgress(load('tp-progress', null), Object.keys(TYPES)), emptyProgress);
  const bed = safe(() => clampBedtime(load('tp-bedtime', null)), () => clampBedtime(null));
  const { sound, voice } = audioOf();
  if (!sandbox) hudMarkup(document); // the drive buttons, the gear and the red X: game markup, adopted at boot's first UI sync
  // M-53: the multiplayer debug log (the "?" in the Multiplayer panel); Handshake's, the port's and the syncs' warnings go into it too
  const net = sandbox ? null : { session: null, netlog: createNetLog(), refresh: null }, netlog = net?.netlog;
  if (netlog) { netlog.log('device', navigator.userAgent); for (const k of ['warn', 'error']) { const orig = console[k].bind(console); console[k] = (...a) => { if (typeof a[0] === 'string' && /^(handshake|multiplayer|net[ :])/.test(a[0])) netlog.log(k, ...a.map(x => x instanceof Error ? x.message : typeof x === 'string' ? x : String(x))); orig(...a); }; } }
  const { engine } = boot(tractorGame(), tractorView({ tune: q.has('tune'), fps: q.has('fps'), sandbox, net }), {
    seed: (Math.random() * 2 ** 32) >>> 0, scene: sandbox ? 'sandbox' : 'farm',
    args: { seed: seedParam(q.get('seed')) ?? undefined, power: powerParam(q.get('power'), settings.power), progress, settings, bed },
    devices: devices(document, { rig }),
  });
  const failed = window.engine?.errors?.[0]; if (failed) throw new Error(failed.message); // the view half could not start (WebGL)
  // #84: the sim owns the records and says when one changed; voice and music follow the settings at once (P-4, P-5)
  let music = (engine.scene.state.settings ?? settings).music; voice.enabled = (engine.scene.state.settings ?? settings).voice;
  engine.events.on(e => {
    if (e.type === 'progress') save('tp-progress', e.progress);
    else if (e.type === 'bed') save('tp-bedtime', e.bed);
    else if (e.type === 'settings') { const s = e.settings; save('tp-settings', s); voice.enabled = s.voice; if (!s.voice) voice.stop?.(); music = s.music; sound.music(s.music); }
  });
  // #85: the sim checks bedtime against the view's wall date: once a second, and at once on coming back to the page
  const clock = () => { try { engine.command('clock', { date: Date.now() }); } catch (e) { console.warn('clock', e); } };
  clock(); setInterval(clock, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') clock(); });
  // iOS: audio and speech only start inside a gesture, and the context can be interrupted later. Try on every kind of gesture and on coming back to the page,
  // and stop listening only once the context is really running. (Moved unchanged from the old main.js.)
  const GEST = ['pointerup', 'touchend', 'click', 'keydown'];
  const unlock = () => { voice.prime(); Promise.resolve(sound.unlock()).then(() => { if (sound.ctx?.state === 'running') { sound.music(music); voice.preload(); sound.loadClips(); watchCtx(); // B-8, E-2, D-1
    for (const n of GEST) removeEventListener(n, unlock, true); } }); };
  for (const n of GEST) addEventListener(n, unlock, true);
  const relisten = () => { sound.unlock(); for (const n of GEST) addEventListener(n, unlock, true); };
  document.addEventListener('visibilitychange', () => { // D-1: silent while hidden; back on the page, the next gesture (or this call) resumes
    if (document.visibilityState === 'hidden') { sound.suspend(); voice.stop?.(); } else if (sound.ctx && sound.ctx.state !== 'running') relisten(); });
  addEventListener('pageshow', () => { if (sound.ctx && sound.ctx.state !== 'running') relisten(); });
  // D-1: Siri, a call or an alarm can interrupt the context with no page hide: listen for the next gesture again
  const watchCtx = () => { if (sound.ctx && !sound.ctx.onstatechange) sound.ctx.onstatechange = () => { if (sound.ctx.state !== 'running' && document.visibilityState === 'visible') relisten(); }; };
  // M-29..M-36: the Multiplayer panel's session. A joined room's link is bound to the engine (bindPort); the session keeps the
  // panel's states, errors, the M-31 retry and the M-33 close. Real rooms stamp on performance.now(); the test bridge on the
  // engine's wall time, as the tests step it by hand (real time would trip the rate limits)
  if (net) {
    const role = q.has('lh-test') ? q.get('lh-bridge') : null, bridged = role === 'host' || role === 'guest';
    const clock = bridged ? () => engine.time.wall : () => performance.now();
    const log = netlog.log, lag = bridged ? null : parseLag(q.get('lag')), signal = signalServer(q.get('signal'), location.origin); // M-28; M-48: only a local server or this origin
    net.session = createSession({ Handshake, server: signal, lag, log, transports: loggedTransports(log), getPaint: () => engine.scene.state?.progress?.paint ?? START_PAINT,
      bind: ({ role: r, transport }) => bindPort(engine, { role: r, transport, clock }), onChange: () => net.refresh?.() });
    engine.onStep(() => net.session.poll()); // the welcome's log line; a late welcome clears the panel's text
    if (bridged) bindPort(engine, { role, transport: () => bridgeTransport(), clock }); // tests: the page is in the Node hub's room from the start
    const linkCode = parseRoomInput(q.get('r')); // M-34: a QR link opens the join prompt
    if (q.has('r')) { const u = new URL(location.href); u.searchParams.delete('r'); history.replaceState(null, '', u); } // a reload does not ask again
    if (linkCode) { engine.command('multiplayer.open', {}); net.session.openJoin(); net.session.submitCode(linkCode); }
  }
  // D-2: a swipe from the left edge (Safari, not installed) or a stray back press must not leave the game: back stays on this page
  if (!sandbox) { history.pushState({ tp: 1 }, '', location.href); addEventListener('popstate', () => history.pushState({ tp: 1 }, '', location.href)); }
  // F-11, A-7: with no start screen the first touch or key starts the trip (the farm also starts on the first stick move)
  const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); if (engine.scene.state?.game?.mode === 'drive') engine.command('play', {}); };
  if (!sandbox) { addEventListener('pointerdown', first, true); addEventListener('keydown', first, true); }
}
start().catch(err => console.error('Tractor Pickup could not start', err));
