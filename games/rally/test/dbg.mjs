import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
await R.init();
const [car, surf] = [process.argv[2]||'rwd', process.argv[3]||'gravel'];
const sim = new Sim(R, { car, surface: surf, cones: false, assist: true, pos:{x:0,y:0.6,z:-250} });
for (let i=0;i<360;i++) sim.step();
for (let i=0;i<240*11;i++){ sim.car.input.throttle=1; sim.step();
 if (i%60==0){ const c=sim.car; console.log((i*DT).toFixed(2), 'v',(c.speed*3.6).toFixed(1),'rpm',c.rpm.toFixed(0),'g',c.gear,'Tc',c.dt.clutchT.toFixed(0),'Te',c.dt.engT.toFixed(0), c.wheels.map(w=>`${w.name}:k${w.kappa.toFixed(2)} fz${w.fz.toFixed(0)} fx${w.fx.toFixed(0)}`).join(' ')); } }
