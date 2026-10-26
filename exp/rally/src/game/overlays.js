// The overlays over the stage scene (lion-hawk [S-3], field notes #7, #23): title (the menu over the live scene, the car
// idling held on the line), pause (the only one that pauses), results (the finished car keeps rolling) and settings.
// Control ids are the test ids (U-1): title.drive, pause.resume, results.retry, settings.close.
// Menu navigation (lion-hawk U-9, rally-spec R6): every overlay is a modal menu that owns the input while it is on top;
// B/Esc/Start go Back (pause resumes, results goes to the main menu, settings closes; the title has no Back), and
// Start/Esc open pause while driving. R14: on the title LB/RB step the mode (nav.shoulders; the pad never focuses that
// row) and Start drives; View opens settings from every menu and while driving (settings pauses), and closes it.
import { DRIVING } from './stage.js';
import { LEVELS, LENGTH_NAMES } from '../gen/levels.js';
const settingsOpen = e => e.scene.overlays.includes('settings');
const openSettings = e => { if (!settingsOpen(e)) e.overlay('settings'); };
const canDrive = e => ['title', 'loading'].includes(e.scene.state.phase);

// A settings choice: pick(id, label, values, when) with values as plain values or { value, label }; the value is the label
// unless given. Reads and applies through the stage settings (api.choose).
const choices = (u, api) => (id, label, values, when) => u.choice({ id, label, when,
  options: values.map(v => typeof v === 'object' && v !== null ? v : { value: v, label: String(v) }),
  get: e => e.scene.state.settings[id], set: (v, e) => api.choose(e, id, v) });

export function makeOverlays(api) {
  const title = {
    nav: { modal: true, initial: 'title.drive', shoulders: 'mode', buttons: { start: e => { if (canDrive(e)) api.drive(e); }, select: openSettings } },
    ui(u) {
      const pick = choices(u, api);
      pick('mode', 'Mode', ['stage', 'timeAttack', 'freeDrive']);
      pick('world', 'World', ['loop', 'stage'], e => e.scene.state.settings.mode === 'freeDrive');
      pick('length', 'Length', LENGTH_NAMES);
      pick('style', 'Style', LEVELS); // 1 tight … 5 flowing
      pick('theme', 'Theme', ['summer', 'winter']);
      pick('obstacles', 'Obstacles', LEVELS); // 1 mild … 5 frequent
      pick('car', 'Car', ['awd', 'rwd']);
      u.field({ id: 'seed', label: 'Track seed', get: e => e.scene.state.settings.seed, set: (t, e) => api.setSeed(e, t) });
      u.button({ id: 'dice', label: 'New seed', action: e => api.rollSeed(e) });
      u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
      u.button({ id: 'drive', label: 'Drive', action: e => api.drive(e), when: canDrive });
    },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.drive(e); },
  };
  const pause = {
    pauses: true, // #23: pause is this overlay, not a sub-state
    nav: { modal: true, initial: 'pause.resume', back: e => e.close('pause'), open: { button: 'start', key: 'escape', when: e => DRIVING.has(e.scene.state.phase) }, buttons: { select: openSettings } },
    ui(u) {
      u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') });
      u.button({ id: 'restart', label: 'Restart', action: e => api.restart(e), when: e => !e.scene.state.pad });
      u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
      u.button({ id: 'quit', label: 'Quit', action: e => api.toTitle(e) });
    },
    step(e) { if (e.input.snapshot.pause.pressed && !settingsOpen(e)) e.close('pause'); },
  };
  const results = {
    nav: { modal: true, initial: 'results.retry', back: e => api.toTitle(e), buttons: { select: openSettings } },
    ui(u) {
      u.button({ id: 'retry', label: 'Retry', action: e => api.restart(e) });
      u.button({ id: 'newSeed', label: 'New seed', action: e => api.newSeedRun(e) });
      u.button({ id: 'menu', label: 'Menu', action: e => api.toTitle(e) });
    },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.restart(e); },
  };
  const settings = {
    pauses: true, // View opens it mid-run too: the car must not roll on under it
    nav: { modal: true, back: e => e.close('settings'), open: { button: 'select', when: e => DRIVING.has(e.scene.state.phase) }, buttons: { select: e => e.close('settings') } },
    ui(u) {
      const pick = choices(u, api);
      pick('surface', 'Surface', ['tarmac', 'hardpack', 'gravel', 'snow', 'ice'], e => e.scene.state.pad);
      pick('assist', 'Assist', [{ value: true, label: 'On' }, { value: false, label: 'Off' }]); // test ids stay settings.assist.true|false
      pick('units', 'Units', ['mph', 'kmh']);
      pick('gearbox', 'Gearbox', ['auto', 'manual']);
      pick('rumble', 'Rumble', ['off', 'light', 'full']);
      u.button({ id: 'close', label: 'Done', action: e => e.close('settings') });
    },
    step(e) { if (e.input.snapshot.pause.pressed) e.close('settings'); }, // Esc closes the sheet before the pause menu
  };
  return { title, pause, results, settings };
}
