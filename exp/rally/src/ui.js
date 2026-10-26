// The HUD (speed, gear, rev lights) and the per-wheel debug panel. Input lives in devices.js.

export class Hud {
  constructor(root) {
    this.speed = root.querySelector('#spd');
    this.unitEl = root.querySelector('#unit');
    this.setUnits('mph');
    this.gear = root.querySelector('#gear');
    this.revs = [...root.querySelectorAll('#revs i')];
    this.debug = root.querySelector('#debug');
    this.dbgCells = [...root.querySelectorAll('#debug .wh')];
  }
  setUnits(u) { this.units = u; this.unitEl.textContent = u === 'mph' ? 'mph' : 'km/h'; }
  update(car) {
    const v = Math.abs(car.speed) * (this.units === 'mph' ? 2.23694 : 3.6);
    this.speed.textContent = v.toFixed(0);
    const g = car.gear;
    this.gear.textContent = g < 0 ? 'R' : g === 0 ? 'N' : String(g);
    const red = car.cfg.drive.redline, frac = Math.min(1, car.rpm / red);
    const n = this.revs.length, lit = Math.round(frac * n);
    this.revs.forEach((el, i) => {
      el.className = i < lit ? (i >= n - 2 ? 'r' : i >= n - 5 ? 'a' : 'g') : '';
    });
    if (car.dt.limiter) this.revs.forEach((el) => (el.className = 'r'));
    if (!this.debug.hidden) {
      car.wheels.forEach((w, i) => {
        const c = this.dbgCells[i];
        const load = w.fz / (car.cfg.mass * 9.81 / 4);
        c.querySelector('b').style.height = `${Math.min(100, load * 50)}%`;
        c.querySelector('span').textContent =
          `${w.name}  ${(w.fz / 1000).toFixed(2)} kN\nslip ${(w.kappa * 100).toFixed(0)}%  α ${(w.alpha * 57.3).toFixed(1)}°\n${w.contact ? w.surf.name : 'airborne'}`;
        c.classList.toggle('slide', w.rho > 1);
      });
    }
  }
}
