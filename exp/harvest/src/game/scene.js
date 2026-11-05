// The farm scene and its card (spec §2–§6). The farm scene owns the farm (sim/farm.js) on its World and seat 0's rig; its step
// reads the stick through the pilot, steps the farm and turns the farm's events into engine events. Driving into the barn opens
// the `shop` card (upgrades for the vehicle, and the vehicles to drive or buy); driving out closes it (H-U1, H-V2). Purchases are commands, so a tape records them and (later) a guest's can go to
// the host (H-M4). The farm's records go out as `progress` events; main.js saves them.
import { createFarm, clampProgress } from '../sim/farm.js';
import { createPilot } from '../sim/pilot.js';
import { TUNE, TUNE_RANGE } from '../defs/econ.js';
import { SHOP_ZONES } from '../sim/layout.js';
import { UPGRADE_IDS, VEHICLES, VEHICLE_IDS, costOf } from '../defs/vehicles.js';
import { createWarnOnce } from 'lion-hawk/sim';

const progressOf = farm => farm.record(); // a copy: the event log never sees later changes
const S = ctx => (ctx?.name === 'farm' && ctx.state.farm ? ctx.state : null);

export function makeScenes() {
  const pilot = createPilot();
  const drive = { thr: 0, steer: 0 };
  const events = [];
  const farm = {
    enter(e, ctx) {
      const args = ctx.args ?? {}, progress = clampProgress(args.progress);
      if (Number.isFinite(args.coins)) progress.coins = Math.max(0, Math.floor(args.coins)); // ?coins= (debug)
      const s = ctx.state, f = s.farm = createFarm(e.world, { progress });
      s.rig = f.addRig(1, progress.active, Object.fromEntries(VEHICLE_IDS.map(v => [v, progress.vehicles[v].levels])));
      s.raw = null; // debug.drive: { thr, steer } in place of the pilot
      e.controllerOf(0)?.possess(s.rig.c.e);
      e.emit('farm', {});
    },
    step(e, dt, ctx) {
      const s = ctx.state, f = s.farm, I = e.input.snapshot;
      events.length = 0;
      f.step(dt, r => {
        if (r !== s.rig) { drive.thr = drive.steer = 0; return drive; } // other players' rigs: their own input (multiplayer, later)
        if (s.raw) { drive.thr = s.raw.thr; drive.steer = s.raw.steer; return drive; }
        // H-C5: the lane hold, while the cutter is over one of the vehicle's fields
        const hold = f.fields.under(r.strip.x, r.strip.z, r.vehicle) ? TUNE.laneHold : 0;
        const p = pilot.drive(I.goX, I.goZ, I.goBack.down, r.c.yaw, r.c.speed, hold);
        drive.thr = p.thr; drive.steer = p.steer; return drive;
      }, events);
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        e.emit(ev.type, ev);
        if (ev.type === 'zone' && ev.player === 1) zoneChanged(e, ev.zone, ev.from);
        if (ev.type === 'sold' && (ev.done || ev.last) || ev.type === 'fieldDone') e.emit('progress', { progress: progressOf(f) });
      }
    },
  };
  // the card follows the zone the combine is in
  function zoneChanged(e, zone, from) {
    const shop = z => SHOP_ZONES.includes(z);
    if (shop(from) && !shop(zone) && e.isOpen('shop')) e.close('shop');
    if (shop(zone) && !e.isOpen('shop')) e.overlay('shop', {}, { once: true });
  }
  // H-U2: one button per upgrade of the player's vehicle; enabled while it can be bought
  const shop = {
    ui(u, e) {
      for (const id of UPGRADE_IDS) u.button({ id, label: id, action: en => en.command('buy', { what: id }),
        when: en => { const s = en.scene.state, r = s.rig; if (!r) return false; const c = costOf(r.vehicle, id, r.levels[id]); return c !== null && s.farm.prog.coins >= c; } });
      // H-V2: one button per vehicle: drive one you own, or buy the next
      for (const v of VEHICLE_IDS) u.button({ id: `veh.${v}`, label: VEHICLES[v].label, action: en => en.command('drive', { vehicle: v }),
        when: en => { const s = en.scene.state, p = s.farm?.prog; if (!p || s.rig?.vehicle === v) return false; return p.owned[v] || p.coins >= VEHICLES[v].price; } });
      u.button({ id: 'close', label: 'Close', action: en => en.close('shop') });
    },
  };
  return { farm, shop };
}

// Game-wide commands (they run under any overlay): buy, drive, tune
export function makeCommands(warn = createWarnOnce()) {
  return {
    buy: (e, d, ctx) => {
      const s = S(ctx); if (!s || typeof d?.what !== 'string') return;
      if (s.farm.buy(1, d.what)) {
        e.emit('bought', { what: d.what, level: s.rig.levels[d.what] });
        e.emit('progress', { progress: progressOf(s.farm) });
      }
    },
    // H-V2: drive a vehicle (buying it first if it is not owned yet)
    drive: (e, d, ctx) => {
      const s = S(ctx); if (!s || typeof d?.vehicle !== 'string') return;
      const how = s.farm.drive(1, d.vehicle); if (!how) return;
      e.controllerOf(0)?.possess(s.rig.c.e); // the new vehicle's entity
      e.emit('vehicle', { vehicle: d.vehicle, how });
      e.emit('progress', { progress: progressOf(s.farm) });
    },
    // ?tune: a TUNE value, clamped to its range and written where the sim reads it
    tune: (e, d) => {
      const r = TUNE_RANGE[d?.key];
      if (!r || !Number.isFinite(d.value)) return warn(`tune: dropped ${JSON.stringify(d?.key)}`, new Error(`tune: unknown key or bad value ${JSON.stringify(d)}`));
      TUNE[d.key] = Math.max(r[0], Math.min(r[1], d.value));
      e.emit('tune', { key: d.key, value: TUNE[d.key] });
    },
  };
}
