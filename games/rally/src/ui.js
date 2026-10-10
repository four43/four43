// Input sources merge into one normalised control struct; the physics never sees
// where a command came from. Plus the HUD and the per-wheel debug panel.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Controls {
  constructor(root) {
    this.out = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.keys = new Set();
    this.kb = { steer: 0, throttle: 0, brake: 0 };
    this.touch = { steer: null, throttle: 0, brake: 0, handbrake: 0 };
    this.events = []; // 'shiftUp', 'shiftDown', 'reset', 'resetAll', 'camera', 'debug'
    addEventListener('keydown', (e) => {
      if (e.repeat || e.target.closest?.('input, textarea')) return; // typing a seed isn't driving
      const k = e.key.toLowerCase();
      this.keys.add(k);
      const map = { q: 'shiftDown', e: 'shiftUp', r: e.shiftKey ? 'resetAll' : 'reset', c: 'camera', f3: 'debug', '`': 'debug' };
      if (map[k]) this.events.push(map[k]);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    this.bindTouch(root);
    this.padPrev = [];
  }

  bindTouch(root) {
    const steer = root.querySelector('#steerZone'), knob = root.querySelector('#steerKnob');
    let sid = null, sx = 0;
    const range = () => Math.min(110, steer.clientWidth * 0.32);
    steer.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; steer.setPointerCapture(sid); this.touch.steer = 0; e.preventDefault(); });
    steer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const v = clamp((e.clientX - sx) / range(), -1, 1);
      this.touch.steer = -v; // drag right = steer right (negative = right in sim)
      knob.style.transform = `translateX(${v * range()}px)`;
    });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; this.touch.steer = null; knob.style.transform = ''; };
    steer.addEventListener('pointerup', end); steer.addEventListener('pointercancel', end);

    for (const [id, key] of [['#gasPad', 'throttle'], ['#brakePad', 'brake'], ['#hbBtn', 'handbrake']]) {
      const el = root.querySelector(id); let pid = null;
      const set = (e) => {
        if (key === 'handbrake') { this.touch[key] = 1; return; }
        const r = el.getBoundingClientRect();
        const f = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
        this.touch[key] = 0.45 + 0.55 * clamp(f * 1.4, 0, 1); // lower 70 % of pad ramps to full
        el.style.setProperty('--press', this.touch[key].toFixed(2));
      };
      el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('on'); set(e); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
      const up = (e) => { if (e.pointerId !== pid) return; pid = null; this.touch[key] = 0; el.classList.remove('on'); el.style.setProperty('--press', 0); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }
  }

  // Called once per rendered frame with frame time dt.
  update(dt) {
    const k = this.keys;
    const left = k.has('a') || k.has('arrowleft'), right = k.has('d') || k.has('arrowright');
    const tgt = (left ? 1 : 0) - (right ? 1 : 0);
    // Ease-in/ease-out keyboard steering: rate grows the longer a key is held,
    // and returns to centre faster than it leaves.
    const kb = this.kb;
    if (tgt !== 0) {
      kb.hold = (kb.hold || 0) + dt;
      const rate = 1.2 + 3.0 * Math.min(1, kb.hold / 0.35);
      if (Math.sign(kb.steer) !== tgt && kb.steer !== 0) kb.steer += tgt * 6 * dt; // snap through centre
      else kb.steer += tgt * rate * dt;
      kb.steer = clamp(kb.steer, -1, 1);
    } else {
      kb.hold = 0;
      const d = 4.5 * dt; kb.steer = Math.abs(kb.steer) < d ? 0 : kb.steer - Math.sign(kb.steer) * d;
    }
    const ramp = (cur, on, up, down) => clamp(cur + (on ? up : -down) * dt, 0, 1);
    kb.throttle = ramp(kb.throttle, k.has('w') || k.has('arrowup'), 5, 8);
    kb.brake = ramp(kb.brake, k.has('s') || k.has('arrowdown'), 6, 9);
    const kbHand = k.has(' ') ? 1 : 0;

    // Gamepad.
    let gp = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, dz = 0.08;
      const s = Math.abs(ax) < dz ? 0 : (ax - Math.sign(ax) * dz) / (1 - dz);
      gp.steer = -Math.sign(s) * s * s * 0.35 - s * 0.65; // slight expo
      gp.throttle = p.buttons[7]?.value || 0; gp.brake = p.buttons[6]?.value || 0;
      gp.handbrake = p.buttons[0]?.pressed ? 1 : 0;
      const edge = (i, ev) => { const pr = !!p.buttons[i]?.pressed; if (pr && !this.padPrev[i]) this.events.push(ev); this.padPrev[i] = pr; };
      edge(5, 'shiftUp'); edge(4, 'shiftDown'); edge(3, 'reset'); edge(2, 'camera');
      break;
    }

    const t = this.touch;
    const pick = (...v) => v.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    this.out.steer = t.steer !== null ? t.steer : pick(kb.steer, gp.steer);
    this.out.throttle = Math.max(kb.throttle, gp.throttle, t.throttle);
    this.out.brake = Math.max(kb.brake, gp.brake, t.brake);
    this.out.handbrake = Math.max(kbHand, gp.handbrake, t.handbrake);
    return this.out;
  }
}

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
