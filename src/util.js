// 작은 도우미들. 데이터 값은 항상 textContent 로만 넣습니다.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') continue;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false && k !== '') el.append(k instanceof Node ? k : String(k));
  return el;
}

export const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v));
export const lines = (s, sep = /\n/) => String(s || '').split(sep).map((x) => x.trim()).filter(Boolean);
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
export const shortMonth = (m) => `${m.slice(2, 4)}.${Number(m.slice(5))}`;

export function addMonths(m, n) {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1);
  return ym(d);
}

export const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const SVG = 'http://www.w3.org/2000/svg';
export function pencil() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M10.8 2.7l2.5 2.5M3 13l.6-3.1 7.6-7.6a1.2 1.2 0 011.7 0l.8.8a1.2 1.2 0 010 1.7L6.1 12.4z');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}
export function editButton(label, onClick, text = '수정') {
  return h('button', {type: 'button', class: 'nb-edit', 'aria-label': label, onclick: (e) => { e.stopPropagation(); onClick(); }}, pencil(), text);
}

let toastTimer;
export function toast(message, {bad = false, action} = {}) {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(toastTimer);
  t.className = 'nb-toast' + (bad ? ' is-bad' : '');
  t.replaceChildren(...[h('span', null, message), action ? h('button', {type: 'button', onclick: () => { t.hidden = true; action.run(); }}, action.label) : null].filter(Boolean));
  t.hidden = false;
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3500);
}
