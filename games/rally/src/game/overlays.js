// The overlays over the stage scene (lion-hawk [S-3], field notes #7, #23): title (the menu over the live scene, the car
// idling held on the line), pause (the only one that pauses), results (the finished car keeps rolling) and settings.
// Control ids are the test ids (U-1): title.drive, pause.resume, results.retry, settings.close.
const settingsOpen = e => e.scene.overlays.includes('settings');

// A settings choice: pick(id, label, values, when) with values as plain values or { value, label }; the value is the label
// unless given. Reads and applies through the stage settings (api.choose).
const choices = (u, api) => (id, label, values, when) => u.choice({ id, label, when,
  options: values.map(v => typeof v === 'object' && v !== null ? v : { value: v, label: String(v) }),
  get: e => e.scene.state.settings[id], set: (v, e) => api.choose(e, id, v) });

export function makeOverlays(api) {
  const title = {
    ui(u) {
      const pick = choices(u, api);
      pick('mode', 'Mode', ['freeDrive', 'stage', 'timeAttack']);
      pick('world', 'World', ['loop', 'stage'], e => e.scene.state.settings.mode === 'freeDrive');
      pick('style', 'Style', ['twisty', 'flowing']);
      pick('theme', 'Theme', ['summer', 'winter']);
      pick('obstacles', 'Obstacles', ['mild', 'wild']);
      pick('car', 'Car', ['awd', 'rwd']);
      u.field({ id: 'seed', label: 'Track seed', get: e => e.scene.state.settings.seed, set: (t, e) => api.setSeed(e, t) });
      u.button({ id: 'dice', label: 'New seed', action: e => api.rollSeed(e) });
      u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
      u.button({ id: 'drive', label: 'Drive', action: e => api.drive(e), when: e => ['title', 'loading'].includes(e.scene.state.phase) });
    },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.drive(e); },
  };
  const pause = {
    pauses: true, // #23: pause is this overlay, not a sub-state
    ui(u) {
      u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') });
      u.button({ id: 'restart', label: 'Restart', action: e => api.restart(e), when: e => !e.scene.state.pad });
      u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
      u.button({ id: 'quit', label: 'Quit', action: e => api.toTitle(e) });
    },
    step(e) { if (e.input.snapshot.pause.pressed && !settingsOpen(e)) e.close('pause'); },
  };
  const results = {
    ui(u) {
      u.button({ id: 'retry', label: 'Retry', action: e => api.restart(e) });
      u.button({ id: 'newSeed', label: 'New seed', action: e => api.newSeedRun(e) });
      u.button({ id: 'menu', label: 'Menu', action: e => api.toTitle(e) });
    },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.restart(e); },
  };
  const settings = {
    ui(u) {
      const pick = choices(u, api);
      pick('surface', 'Surface', ['tarmac', 'hardpack', 'gravel', 'snow', 'ice'], e => e.scene.state.pad);
      pick('assist', 'Assist', [{ value: true, label: 'On' }, { value: false, label: 'Off' }]); // test ids stay settings.assist.true|false
      pick('units', 'Units', ['mph', 'kmh']);
      pick('gearbox', 'Gearbox', ['auto', 'manual']);
      u.button({ id: 'close', label: 'Done', action: e => e.close('settings') });
    },
    step(e) { if (e.input.snapshot.pause.pressed) e.close('settings'); }, // Esc closes the sheet before the pause menu
  };
  return { title, pause, results, settings };
}
