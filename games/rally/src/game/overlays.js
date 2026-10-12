// The overlays over the stage scene (lion-hawk [S-3], field notes #7, #23): title (the menu over the live scene, the car
// idling held on the line), pause (the only one that pauses), results (the finished car keeps rolling) and settings.
// Control ids are the test ids (U-1): title.drive, pause.resume, results.retry, settings.close.
const settingsOpen = e => e.scene.overlays.includes('settings');

export function makeOverlays(api) {
  const title = {
    ui(u) {
      const st = e => e.scene.state.settings, set = key => (v, e) => api.choose(e, key, v);
      const opts = (...vs) => vs.map(v => ({ value: v, label: String(v) }));
      const pick = (id, label, values, when) => u.choice({ id, label, options: opts(...values), get: e => st(e)[id], set: set(id), when });
      pick('mode', 'Mode', ['freeDrive', 'stage', 'timeAttack']);
      pick('world', 'World', ['loop', 'stage'], e => st(e).mode === 'freeDrive');
      pick('style', 'Style', ['twisty', 'flowing']);
      pick('theme', 'Theme', ['summer', 'winter']);
      pick('density', 'Density', ['mild', 'wild']);
      pick('car', 'Car', ['awd', 'rwd']);
      u.field({ id: 'seed', label: 'Track seed', get: e => e.scene.state.settings.seed, set: (t, e) => api.setSeed(e, t) });
      u.button({ id: 'dice', label: 'New seed', action: e => api.rollSeed(e) });
      u.button({ id: 'settings', label: 'Settings', action: e => e.overlay('settings') });
      u.button({ id: 'drive', label: 'Drive', action: e => api.drive(e), when: e => e.scene.state.phase === 'title' });
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
      const st = e => e.scene.state.settings, set = key => (v, e) => api.choose(e, key, v);
      const pick = (id, label, values, when) => u.choice({ id, label, options: values.map(v => ({ value: v, label: String(v) })), get: e => st(e)[id], set: set(id), when });
      pick('surface', 'Surface', ['tarmac', 'hardpack', 'gravel', 'snow', 'ice'], e => e.scene.state.pad);
      pick('assist', 'Assist', [true, false]);
      pick('units', 'Units', ['mph', 'kmh']);
      pick('gearbox', 'Gearbox', ['auto', 'manual']);
      u.button({ id: 'close', label: 'Done', action: e => e.close('settings') });
    },
    step(e) { if (e.input.snapshot.pause.pressed) e.close('settings'); }, // Esc closes the sheet before the pause menu
  };
  return { title, pause, results, settings };
}
