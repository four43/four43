import { mpWorld, trainFrame, parked } from './mp.harness.mjs';
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const w = await mpWorld({ seed: 63, guests: 2 }); w.seconds(1);
const [g2, g3] = w.guests, H = w.host.net.id;
const show = l => { const e = g2.engine.world.net.find('train', 3); console.log(l, 'roster3', g2.sync.players.map.has(3), 'train3', !!e, e && e.body?.translation(), 'stats', JSON.stringify(g2.engine.world.net.stats)); };
g3.net.send(H, trainFrame(3, 3, parked(g3.game.tractor.x, g3.game.tractor.z), 1e9)); w.seconds(0.3); show('start');
g3.net.leave(); w.seconds(0.5); show('left');
const g = w.addGuest(); w.seconds(1); console.log('you', g.sync.you, g.game.tractor.x, g.game.tractor.z); show('new'); console.log('pose', JSON.stringify(g2.sync.players.map.get(3)?.pose), g2.sync.players.map.get(3)?.train?.id);
const ht = w.host.engine.world.net.find('train', 3); console.log('host has train3', !!ht, ht?.body?.translation());
