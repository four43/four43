// Slot bar (U-1), the big animal name (W-5, W-6), the edge arrow (F-1, F-4).
import { TYPES } from '../sim/herd.js';
export function createHud(root, { icons, onWordTap }) {
  const bar = document.createElement('div'); bar.id = 'slots'; root.appendChild(bar);
  const word = document.createElement('div'); word.id = 'word'; root.appendChild(word);
  const arrow = document.createElement('div'); arrow.id = 'arrow'; arrow.textContent = '➜'; arrow.hidden = true; root.appendChild(arrow);
  let slots = [], wordTimer = 0;
  const reset = () => { bar.innerHTML = ''; slots = Array.from({ length: 12 }, (_, i) => { const s = document.createElement('div'); s.className = i === 6 ? 'slot wagon' : 'slot'; bar.appendChild(s); return s; }); };
  reset();
  const showWord = text => {
    word.innerHTML = ''; [...text].forEach((ch, i) => { const sp = document.createElement('span'); sp.textContent = ch === ' ' ? ' ' : ch; sp.style.animationDelay = `${i * 0.09}s`; word.appendChild(sp); });
    word.classList.remove('on'); void word.offsetWidth; word.classList.add('on'); clearTimeout(wordTimer);
    wordTimer = setTimeout(() => word.classList.remove('on'), 2500);
  };
  word.addEventListener('pointerdown', e => { e.stopPropagation(); onWordTap?.(word.textContent); }); // W-6
  return {
    reset, showWord,
    fill(n, type, golden) {
      const s = slots[n - 1]; if (!s) return;
      s.innerHTML = `<img alt="" src="${golden ? icons.golden[type] : icons[type]}"><span>${TYPES[type].word}</span>`;
      s.classList.add('full');
    },
    arrowTo(p) { if (!p) { arrow.hidden = true; return; } arrow.hidden = false; arrow.style.left = p.x + 'px'; arrow.style.top = p.y + 'px'; arrow.style.transform = `translate(-50%,-50%) rotate(${p.angle}rad)`; },
  };
}
