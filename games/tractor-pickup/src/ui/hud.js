// Slot bar (U-1), the big animal name (W-5, W-6), the edge arrow (F-1, F-4).
import { TYPES } from '../sim/herd.js';
export function createHud(root, { icons, onWordTap }) {
  const bar = document.createElement('div'); bar.id = 'slots'; root.appendChild(bar);
  const word = document.createElement('div'); word.id = 'word'; root.appendChild(word);
  const arrow = document.createElement('div'); arrow.id = 'arrow'; arrow.textContent = '➜'; arrow.hidden = true; root.appendChild(arrow);
  let slots = [], wordTimer = 0, flyTimer = 0, lastIds = [], lastArrow = '';
  const clearFly = () => { word.style.transition = word.style.transform = word.style.opacity = ''; };
  const reset = () => { clearTimeout(wordTimer); clearTimeout(flyTimer); clearFly(); word.classList.remove('on'); word.innerHTML = ''; lastIds = []; bar.innerHTML = ''; // a word still on its way must not fly into the next bar
    slots = Array.from({ length: 12 }, (_, i) => { const s = document.createElement('div'); s.className = i === 6 ? 'slot wagon' : 'slot'; bar.appendChild(s); return s; }); };
  reset();
  // W-5: the name pops in letter by letter, stays 2.5 s, then shrinks and flies into its slot (n: 1-12) in 0.5 s
  const showWord = (text, n, ids = []) => {
    lastIds = ids;
    clearTimeout(wordTimer); clearTimeout(flyTimer); clearFly();
    word.innerHTML = ''; [...text].forEach((ch, i) => { const sp = document.createElement('span'); sp.textContent = ch === ' ' ? ' ' : ch; sp.style.animationDelay = `${i * 0.09}s`; word.appendChild(sp); });
    word.classList.remove('on'); void word.offsetWidth; word.classList.add('on');
    wordTimer = setTimeout(() => {
      const s = slots[n - 1]; if (!s) { word.classList.remove('on'); return; }
      const a = word.getBoundingClientRect(), b = s.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height * 0.85 - (a.top + a.height / 2), k = 12 / a.height;
      word.style.transition = 'transform .5s ease-in, opacity .5s ease-in';
      word.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px) scale(${k})`; word.style.opacity = '0.3';
      flyTimer = setTimeout(() => { word.classList.remove('on'); clearFly(); }, 500);
    }, 2500);
  };
  word.addEventListener('pointerdown', e => { e.stopPropagation(); onWordTap?.(lastIds); }); // W-6
  return {
    reset, showWord,
    fill(n, type, golden) {
      const s = slots[n - 1]; if (!s) return;
      s.innerHTML = `<img alt="" src="${golden ? icons.golden[type] : icons[type]}"><span>${TYPES[type].word}</span>`;
      s.classList.add('full');
    },
    markOut(n) { slots[n - 1]?.classList.add('out'); }, // F-15: its animal hopped out in the show
    // B-7: only the transform moves it (no layout), and only when it changed by a pixel or a degree
    arrowTo(p) { if (!p) { if (!arrow.hidden) arrow.hidden = true; return; } if (arrow.hidden) arrow.hidden = false;
      const t = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-50%) rotate(${Math.round(p.angle * 57.3)}deg)`; if (t !== lastArrow) { arrow.style.transform = t; lastArrow = t; } },
  };
}
