// The overlays over the stage scene (lion-hawk [S-3], field notes #7, #23): title (the menu over the live scene, the car
// idling held on the line), pause (the only one that pauses), results (the finished car keeps rolling) and settings.
// Control ids are the test ids (U-1): title.drive, pause.resume, results.retry, settings.close.
const settingsOpen = e => e.scene.overlays.includes('settings');

export function makeOverlays(api) {
  const title = {
    ui(u) { u.button({ id: 'drive', label: 'Drive', action: e => api.drive(e), when: e => e.scene.state.phase === 'title' }); },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.drive(e); },
  };
  const pause = {
    pauses: true, // #23: pause is this overlay, not a sub-state
    ui(u) { u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') }); },
    step(e) { if (e.input.snapshot.pause.pressed && !settingsOpen(e)) e.close('pause'); },
  };
  const results = {
    ui(u) { u.button({ id: 'retry', label: 'Retry', action: e => api.restart(e) }); },
    step(e) { if (e.input.snapshot.confirm.pressed && !settingsOpen(e)) api.restart(e); },
  };
  const settings = {
    ui(u) { u.button({ id: 'close', label: 'Done', action: e => e.close('settings') }); },
    step(e) { if (e.input.snapshot.pause.pressed) e.close('settings'); }, // Esc closes the sheet before the pause menu
  };
  return { title, pause, results, settings };
}
