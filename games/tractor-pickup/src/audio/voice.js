// Recorded words (spec S-4, section 12) played back to back; any word not yet recorded uses the browser's speech.
import { textOf } from '../sim/words.js';

export function planUtterances(ids, available) {
  const out = [];
  for (const id of [].concat(ids)) {
    if (available.has(id)) out.push({ clip: id });
    else if (out.at(-1)?.tts) out.at(-1).tts += ' ' + textOf(id);
    else out.push({ tts: textOf(id) });
  }
  return out;
}

// say(ids) resolves when the line has been spoken, or at once when stop() cuts it off. It never rejects (R-1).
export function createVoice(sound) {
  const src = (typeof window !== 'undefined' && window.__VOICE__) || {}, buffers = new Map(), pending = new Set(), live = new Set();
  let gen = 0, current = null; // gen bumps on stop(); a line from an older gen quietly ends
  const decode = async id => {
    if (!buffers.has(id)) {
      const bin = Uint8Array.from(atob(src[id].split(',')[1]), c => c.charCodeAt(0));
      buffers.set(id, await sound.ctx.decodeAudioData(bin.buffer));
    }
    return buffers.get(id);
  };
  // each step resolves on its own end, its safety timeout, or stop(); `current.cancel` is what stop() calls
  const step = (start, maxMs) => new Promise(res => {
    let done = false, timer = null;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); current = null; pending.delete(finish); res(); };
    pending.add(finish); timer = setTimeout(finish, maxMs);
    try { current = { cancel: start(finish) || (() => {}), finish }; } catch (e) { console.warn('voice', e); finish(); }
  });
  const playClip = async id => {
    const buf = await decode(id);
    return step(end => {
      const s = sound.ctx.createBufferSource(), g = sound.ctx.createGain(); s.buffer = buf; g.gain.value = 1.4;
      s.connect(g); g.connect(sound.master); s.onended = end; s.start();
      return () => { try { s.stop(); } catch { /* already ended */ } s.disconnect(); g.disconnect(); };
    }, buf.duration * 1000 + 800);
  };
  const speak = text => step(end => {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') { setTimeout(end, 300 * text.split(' ').length); return; }
    const u = new SpeechSynthesisUtterance(text), release = () => { live.delete(u); end(); }; u.rate = 0.9; u.pitch = 1.1; u.onend = release; u.onerror = release;
    live.add(u); // iOS and Chrome can drop an utterance (and its end event) once it is garbage collected: hold it until it ends
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
    return () => { live.delete(u); speechSynthesis.cancel(); };
  }, 1200 + 150 * text.length);
  let chain = Promise.resolve(), lowPending = 0;
  const MAX_LOW = 2;
  const v = {
    enabled: true,
    // opts.low marks a name line (a landing): when 2 low lines are already waiting it is dropped so trip and show lines are never delayed
    say(ids, opts = {}) {
      if (!v.enabled || (opts.low && lowPending >= MAX_LOW)) return Promise.resolve();
      if (opts.low) lowPending++;
      const my = gen, plan = planUtterances(ids, new Set(Object.keys(src)));
      chain = chain.then(async () => {
        if (opts.low) lowPending = Math.max(0, lowPending - 1); // stop() zeroed it: a dropped old line must not push it below 0 and raise the cap
        for (const p of plan) {
          if (my !== gen) return;
          try { if (p.clip && sound.ctx) await playClip(p.clip); else await speak(p.clip ? textOf(p.clip) : p.tts); } catch (e) { console.warn('voice', e); }
          if (my === gen) await new Promise(r => setTimeout(r, 80));
        }
      });
      return chain;
    },
    // a tap on the show cuts the current line (F-8); queued lines from before are dropped
    // iOS only speaks later, non-gesture lines once speech was started inside a gesture: call this from the gesture handler
    prime() { try { if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { console.warn('voice prime', e); } },
    stop() { lowPending = 0; gen++; const c = current; current = null; c?.cancel(); for (const f of [...pending]) f(); },
  };
  return v;
}
