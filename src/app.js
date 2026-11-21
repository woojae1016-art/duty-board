// 대시보드 화면. 데이터가 바뀌면 보이는 부분만 다시 그립니다.
import * as db from './data.js';
import {viewTask, viewWeekly, viewService, viewAnnual, viewEvent, TABLE_LABEL, FIELD_LABEL, COMMON_LABEL, rowTitle} from './model.js';
import {h, fmt, lines, ym, monthLabel, shortMonth, addMonths, when, editButton, toast} from './util.js';
import * as editor from './editor.js';

/* ---------- constants ---------- */
const STATUS = ['확정', '확인필요', '미배정'];
const STATUS_CLS = {'확정': 'ok', '확인필요': 'warn', '미배정': 'bad'};
const KINDS = ['정기', '수시', '특별절기'];
const DAYS = ['주일', '월', '화', '수', '목', '금', '토'];
const ROLES = ['준비·세팅', '설교', '찬양인도', '자막 제작', '자막 넘기기', '음향', '방송 보조', '영상 편집', '차량운행', '기타'];
// 보기 전용일 때는 변경 기록 탭이 없음
const TABS = ['overview', 'people', 'services', 'week', 'year', 'todo', 'all', 'history'].filter((t) => db.canEdit || t !== 'history');

const today = new Date();
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const state = {tab: 'overview', person: null, day: DAYS[today.getDay()], month: null};

/* ---------- store & a tiny drawing system ---------- */
const store = {status: 'loading', raw: {staff: [], tasks: [], weekly: [], services: [], annual: [], events: []}, view: {}, log: null, logError: ''};
const draws = {}, calcs = {};
let params = {};
let memo = {};

function setRaw(raw) {
  store.raw = raw;
  store.view = {
    staff: raw.staff,
    tasks: raw.tasks.map(viewTask),
    weekly: raw.weekly.map(viewWeekly),
    services: raw.services.map(viewService),
    annual: raw.annual.map(viewAnnual),
    events: raw.events.map(viewEvent),
  };
  store.status = 'ok';
  memo = {};
}
const dash = {
  calc(id, o) { calcs[id] = o; },
  data(id) {
    if (store.status !== 'ok') return {status: store.status, data: []};
    if (id in store.view) return {status: 'ok', data: store.view[id]};
    const c = calcs[id];
    if (!c) return {status: 'missing', data: []};
    if (!(id in memo)) memo[id] = c.fn(...c.inputs.map((i) => dash.data(i).data));
    return {status: 'ok', data: memo[id]};
  },
  draw(name, fn) { if (fn) draws[name] = fn; else renderNamed(name); },
  params: () => params,
  setParams(p) {
    for (const [k, v] of Object.entries(p)) { if (v == null || v === '') delete params[k]; else params[k] = v; }
    memo = {};
    renderAll();
  },
  setLink(id) { try { history.replaceState(null, '', '#' + id); } catch { /* 무시 */ } },
};
const visible = (el) => !el.closest('[hidden]');
function runDraw(el) {
  const f = draws[el.dataset.draw];
  if (!f) return;
  try { f(el); } catch (e) { console.error(el.dataset.draw, e); }
}
function renderAll() { document.querySelectorAll('[data-draw]').forEach((el) => { if (visible(el)) runDraw(el); }); }
function renderNamed(name) { document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => { if (visible(el)) runDraw(el); }); }

/* ---------- helpers ---------- */
const raw = (table, id) => store.raw[table].find((r) => r.id === id);
const staffMap = () => Object.fromEntries(store.raw.staff.map((s) => [s.name, s.short]));
const order = () => [...store.raw.staff.map((s) => s.name), '교역자 공통', '성도 봉사'];
const byOrder = (a, b) => { const o = order(); const i = (n) => { const k = o.indexOf(n); return k < 0 ? 99 : k; }; return i(a) - i(b); };

function allMonths() {
  const set = new Set();
  for (const a of store.raw.annual) for (const k of Object.keys(a.months || {})) if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
  for (const e of store.raw.events) set.add(e.month);
  const cur = ym(today);
  const sorted = [...set].sort();
  const start = sorted[0] && sorted[0] < cur ? sorted[0] : cur;
  let end = sorted[sorted.length - 1] || cur;
  const minEnd = addMonths(cur, 6);
  if (end < minEnd) end = minEnd;
  const out = [];
  for (let m = start; m <= end && out.length < 48; m = addMonths(m, 1)) out.push(m);
  return out;
}

function notOk(el, status) {
  const failed = status === 'error' || status === 'missing';
  const msg = failed ? '이 부분의 데이터를 불러오지 못했습니다.' : '—';
  if (el.tagName === 'TBODY') el.replaceChildren(h('tr', null, h('td', {colspan: 20, class: 'nb-empty'}, msg)));
  else if (el.tagName === 'SELECT') el.replaceChildren(new Option('전체', ''));
  else if (el.tagName === 'UL') el.replaceChildren(h('li', {class: 'nb-empty'}, msg));
  else el.replaceChildren(failed ? h('p', {class: 'nb-empty'}, msg) : msg);
}

const leadsOf = (t) => {
  const s = staffMap();
  return lines(t['주담당'], /,/).map((p) => (p in s || p === '교역자 공통' ? p : '성도 봉사'));
};
function roleOf(t, name) {
  if (leadsOf(t).includes(name)) return '주담당';
  const s = staffMap()[name];
  if (s && String(t['협력'] || '').includes(s)) return '협력';
  return null;
}
const statusPill = (t) => h('span', {class: 'nb-pill ' + (STATUS_CLS[t['상태']] || '')}, t['상태']);

function taskItem(t, opt = {}) {
  const f = (field, cls) => h('span', {class: cls}, t[field]);
  const meta = h('div', {class: 'nb-task-meta'},
    h('span', null, f('카테고리', 'nb-k'), h('span', {class: 'nb-k'}, ' › '), f('중분류')),
    t['주기·시기'] ? h('span', null, h('span', {class: 'nb-k'}, '주기 '), f('주기·시기')) : null,
    t['주담당'] && (opt.role !== '주담당' || leadsOf(t).length > 1) ? h('span', null, h('span', {class: 'nb-k'}, '주담당 '), f('주담당')) : null,
    t['협력'] ? h('span', null, h('span', {class: 'nb-k'}, '협력 '), f('협력')) : null);
  return h('li', {class: 'nb-task', 'data-id': t.id},
    h('div', {class: 'nb-task-top'},
      statusPill(t),
      opt.role ? h('span', {class: 'nb-role' + (opt.role === '주담당' ? ' is-lead' : '')}, opt.role) : null,
      f('세부 업무', 'nb-task-name'),
      editButton(`'${t['세부 업무']}' 수정`, () => editor.editTask(raw('tasks', t.id)))),
    meta,
    t['비고'] ? h('p', {class: 'nb-task-note'}, t['비고']) : null);
}
function bindTip(target, tip, box, text) {
  const show = () => {
    tip.textContent = text; tip.hidden = false;
    const b = box.getBoundingClientRect(), s = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.max(0, Math.min(s.left - b.left + s.width / 2 - tw / 2, b.width - tw));
    let y = s.top - b.top - th - 6;
    if (y < 0) y = s.bottom - b.top + 6;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hide = () => { tip.hidden = true; };
  target.addEventListener('pointerenter', show);
  target.addEventListener('pointerdown', show);
  target.addEventListener('pointerleave', hide);
}
function splitDate(s) {
  const m = String(s).match(/^(~?\d{1,2}\/\d{1,2}(?:~(?:\d{1,2}\/)?\d{0,2})?)\s+(.+)$/);
  return m ? {date: m[1], text: m[2]} : {date: '', text: String(s)};
}
function startDay(s, month) {
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})/);
  return m ? new Date(Number(month.slice(0, 4)), Number(m[1]) - 1, Number(m[2])) : null;
}
function curPerson() {
  const L = dash.data('person_load');
  const names = L.status === 'ok' ? L.data.map((r) => r['교역자']).sort(byOrder) : [];
  if (names.length && !names.includes(state.person)) state.person = names[0];
  return state.person;
}
function curMonth(ms) {
  if (!state.month || !ms.includes(state.month)) state.month = ms.includes(ym(today)) ? ym(today) : ms[0];
  return state.month;
}

/* ---------- calculations ---------- */
dash.calc('status_counts', {
  inputs: ['tasks'],
  fn: (tasks) => {
    const n = (s) => tasks.filter((t) => t['상태'] === s).length;
    return [
      {'상태': '전체', '건수': tasks.length}, {'상태': '확정', '건수': n('확정')}, {'상태': '확인필요', '건수': n('확인필요')},
      {'상태': '미배정', '건수': n('미배정')}, {'상태': '미확정', '건수': n('확인필요') + n('미배정')},
    ];
  },
});
dash.calc('person_load', {
  inputs: ['tasks', 'staff'],
  fn: (tasks, staff) => {
    const short = Object.fromEntries(staff.map((s) => [s.name, s.short]));
    const rows = new Map();
    const get = (name) => {
      if (!rows.has(name)) rows.set(name, {'교역자': name, '주담당': 0, '협력': 0, '정기': 0, '수시': 0, '특별절기': 0});
      return rows.get(name);
    };
    for (const s of staff) get(s.name);
    for (const t of tasks) {
      const leads = new Set(lines(t['주담당'], /,/).map((p) => (p in short || p === '교역자 공통' ? p : '성도 봉사')));
      for (const name of leads) {
        const r = get(name);
        r['주담당'] += 1;
        if (KINDS.includes(t['주기 구분'])) r[t['주기 구분']] += 1;
      }
      const coop = String(t['협력'] || '');
      for (const [name, stem] of Object.entries(short)) if (stem && coop.includes(stem) && !leads.has(name)) get(name)['협력'] += 1;
    }
    return [...rows.values()].sort((a, b) => b['주담당'] - a['주담당'] || b['협력'] - a['협력']);
  },
});
dash.calc('category_status', {
  inputs: ['tasks'],
  fn: (tasks) => {
    const m = new Map();
    for (const t of tasks) {
      const c = t['카테고리'];
      if (!m.has(c)) m.set(c, {'카테고리': c, '전체': 0, '확정': 0, '확인필요': 0, '미배정': 0});
      const r = m.get(c);
      r['전체'] += 1;
      if (STATUS.includes(t['상태'])) r[t['상태']] += 1;
    }
    return [...m.values()].sort((a, b) => b['전체'] - a['전체']);
  },
});
dash.calc('former_assoc', {
  inputs: ['tasks'],
  fn: (tasks) => {
    const rows = tasks.filter((t) => String(t['비고'] || '').includes('부목사') && !String(t['비고'] || '').includes('조직안'));
    const n = (s) => rows.filter((t) => t['상태'] === s).length;
    return [{'상태': '전체', '건수': rows.length}, {'상태': '확정', '건수': n('확정')}, {'상태': '확인필요', '건수': n('확인필요')}, {'상태': '미배정', '건수': n('미배정')}];
  },
});
dash.calc('shown_tasks', {
  inputs: ['tasks', 'staff'],
  fn: (tasks, staff) => {
    const p = params;
    const short = Object.fromEntries(staff.map((s) => [s.name, s.short]));
    const q = String(p.q || '').trim().toLowerCase();
    return tasks.filter((t) => {
      if (p.cat && t['카테고리'] !== p.cat) return false;
      if (p.st && t['상태'] !== p.st) return false;
      if (p.kind && t['주기 구분'] !== p.kind) return false;
      if (p.who) {
        const leads = lines(t['주담당'], /,/);
        const ok = p.who === '성도 봉사'
          ? leads.some((l) => !(l in short) && l !== '교역자 공통')
          : leads.includes(p.who) || (short[p.who] && String(t['협력'] || '').includes(short[p.who]));
        if (!ok) return false;
      }
      if (q) {
        const hay = [t['카테고리'], t['중분류'], t['세부 업무'], t['주기·시기'], t['주담당'], t['협력'], t['비고']].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },
});
dash.calc('shown_count', {inputs: ['shown_tasks'], fn: (shown) => shown.length});

/* ---------- tabs & static controls ---------- */
function openTab(id, link = true) {
  if (!TABS.includes(id)) id = 'overview';
  state.tab = id;
  document.querySelectorAll('.nb-panel').forEach((p) => { p.hidden = p.id !== id; });
  document.querySelectorAll('.nb-tab').forEach((b) => {
    const on = b.dataset.tab === id;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('is-active', on);
    b.tabIndex = on ? 0 : -1;
  });
  if (link) dash.setLink(id);
  if (id === 'history') loadHistory();
  renderAll();
}
function goTab(id) {
  openTab(id);
  const tabs = document.getElementById('tabs');
  if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({block: 'start'});
}
function showPerson(name) { state.person = name; goTab('people'); }
function syncFilterFields() {
  const p = params;
  document.querySelectorAll('#f-q').forEach((el) => { if (document.activeElement !== el) el.value = p.q ?? ''; });
  document.querySelectorAll('#f-st').forEach((el) => { el.value = p.st ?? ''; });
  document.querySelectorAll('#f-kind').forEach((el) => { el.value = p.kind ?? ''; });
}
function jumpAll(p) {
  params = {};
  dash.setParams(p);
  syncFilterFields();
  goTab('all');
}

export function setupStatic() {
  document.querySelectorAll('.nb-tab').forEach((b) => {
    b.addEventListener('click', () => openTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(b.dataset.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = TABS[(i + TABS.length) % TABS.length];
      openTab(next);
      document.querySelector(`.nb-tab[data-tab="${next}"]`)?.focus();
    });
  });
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.goto)));
  document.querySelectorAll('[data-status-jump]').forEach((b) => b.addEventListener('click', () => jumpAll({st: b.dataset.statusJump})));

  const paintDays = () => document.querySelectorAll('[data-day-chip]').forEach((b) => {
    const on = b.dataset.dayChip === state.day;
    b.classList.toggle('is-active', on);
    b.classList.toggle('is-today', b.dataset.dayChip === DAYS[today.getDay()]);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  paintDays();
  document.querySelectorAll('[data-day-chip]').forEach((b) => b.addEventListener('click', () => { state.day = b.dataset.dayChip; paintDays(); renderNamed('week-day'); }));
  document.querySelectorAll('.nb-weektable th[data-field]').forEach((th) => th.classList.toggle('is-today', th.dataset.field === DAYS[today.getDay()]));

  syncFilterFields();
  document.getElementById('f-st').addEventListener('change', (e) => dash.setParams({st: e.target.value}));
  document.getElementById('f-kind').addEventListener('change', (e) => dash.setParams({kind: e.target.value}));
  const q = document.getElementById('f-q');
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => dash.setParams({q: q.value.trim()}), 160); });
  document.getElementById('f-reset').addEventListener('click', () => { params = {}; memo = {}; syncFilterFields(); renderAll(); });

  document.getElementById('task-add').addEventListener('click', () => editor.editTask(null, {category: params.cat, status: params.st, kind: params.kind}));
  document.getElementById('service-add').addEventListener('click', () => editor.editService(null));
  document.getElementById('event-add').addEventListener('click', () => editor.editEvent(null, state.month || ym(today)));
  document.getElementById('annual-add').addEventListener('click', () => editor.editAnnual(null, state.month));
  document.getElementById('staff-manage').addEventListener('click', () => editor.manageStaff());
  document.getElementById('history-refresh').addEventListener('click', () => loadHistory(true));

  const initial = location.hash.slice(1);
  openTab(TABS.includes(initial) ? initial : 'overview', false);
  // 주소 끝(#week 등)을 바꾸거나 뒤로 가기를 해도 그 탭으로
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (TABS.includes(id) && id !== state.tab) openTab(id, false);
  });
}

/* ---------- history ---------- */
let historyLoading = false;
export async function loadHistory(force = false) {
  if (historyLoading || (!force && state.tab !== 'history')) return;
  historyLoading = true;
  try { store.log = await db.loadLog(150); store.logError = ''; } catch (e) { store.logError = e.message; }
  historyLoading = false;
  renderNamed('history');
}

/* ---------- data loading ---------- */
export function applyData(rawData) {
  setRaw(rawData);
  renderAll();
  const last = [];
  for (const t of db.TABLES) for (const r of rawData[t]) if (r.updated_at) last.push(r);
  last.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const f = document.getElementById('footer-updated');
  if (f && last[0]) f.textContent = `마지막 수정 ${when(last[0].updated_at)}${last[0].updated_by ? ' · ' + last[0].updated_by : ''}`;
}
export function rawData() { return store.raw; }
export { allMonths, openTab };

/* ---------- drawings ---------- */
dash.draw('num', (el) => {
  const d = dash.data(el.dataset.source);
  if (d.status !== 'ok' || d.data == null) { el.textContent = d.status === 'error' ? '?' : '—'; return; }
  let v = d.data;
  if (el.dataset.field) {
    const [k, val] = (el.dataset.where || '').split('=').map(decodeURIComponent);
    const row = (Array.isArray(d.data) ? d.data : []).find((r) => String(r[k]) === val);
    v = row ? row[el.dataset.field] : null;
  }
  el.textContent = v == null ? '—' : fmt(v);
});

dash.draw('statusbar', (el) => {
  const d = dash.data('status_counts');
  if (d.status !== 'ok') return notOk(el, d.status);
  const get = (s) => (d.data.find((r) => r['상태'] === s) || {})['건수'] || 0;
  const total = get('전체') || 1;
  const tip = h('div', {class: 'nb-tip', role: 'tooltip'}); tip.hidden = true;
  const track = h('div', {class: 'nb-sb-track'});
  for (const s of STATUS) {
    const n = get(s); if (!n) continue;
    const seg = h('span', {class: 'nb-sb-seg ' + STATUS_CLS[s], style: `width:${(n / total) * 100}%`, 'aria-label': `${s} ${n}건`});
    bindTip(seg, tip, el, `${s} ${n}건 · ${Math.round((n / total) * 100)}%`);
    track.append(seg);
  }
  el.replaceChildren(track, tip);
});

dash.draw('chart-people', (el) => {
  const d = dash.data('person_load');
  if (d.status !== 'ok') return notOk(el, d.status);
  const rows = d.data.filter((r) => r['주담당'] + r['협력'] > 0);
  const max = Math.max(1, ...rows.map((r) => r['주담당'] + r['협력']));
  const tip = h('div', {class: 'nb-tip', role: 'tooltip'}); tip.hidden = true;
  const grid = h('div', {class: 'nb-bars'});
  for (const r of rows) {
    const name = r['교역자'];
    const track = h('div', {class: 'nb-track'});
    KINDS.forEach((k, i) => {
      if (!r[k]) return;
      const seg = h('span', {class: `nb-seg s${i}`, style: `width:${(r[k] / max) * 100}%`});
      bindTip(seg, tip, el, `${name} · ${k} ${r[k]}건 (주담당)`);
      track.append(seg);
    });
    if (r['협력']) {
      const seg = h('span', {class: 'nb-seg nb-seg-coop', style: `width:${(r['협력'] / max) * 100}%`});
      bindTip(seg, tip, el, `${name} · 협력 ${r['협력']}건`);
      track.append(seg);
    }
    grid.append(
      h('button', {type: 'button', class: 'nb-bar-label', onclick: () => showPerson(name)}, name),
      track,
      h('span', {class: 'nb-bar-val'}, h('b', null, r['주담당']), r['협력'] ? h('span', {class: 'nb-bar-plus'}, '+' + r['협력']) : null));
  }
  el.replaceChildren(grid, tip);
});

dash.draw('chart-cats', (el) => {
  const d = dash.data('category_status');
  if (d.status !== 'ok') return notOk(el, d.status);
  const rows = d.data;
  const max = Math.max(1, ...rows.map((r) => r['전체']));
  const tip = h('div', {class: 'nb-tip', role: 'tooltip'}); tip.hidden = true;
  const grid = h('div', {class: 'nb-bars'});
  for (const r of rows) {
    const cat = r['카테고리'];
    const track = h('div', {class: 'nb-track'});
    for (const s of STATUS) {
      if (!r[s]) continue;
      const seg = h('span', {class: 'nb-seg ' + STATUS_CLS[s], style: `width:${(r[s] / max) * 100}%`});
      bindTip(seg, tip, el, `${cat} · ${s} ${r[s]}건`);
      track.append(seg);
    }
    grid.append(
      h('button', {type: 'button', class: 'nb-bar-label', onclick: () => jumpAll({cat})}, cat),
      track,
      h('span', {class: 'nb-bar-val'}, h('b', null, r['전체'])));
  }
  el.replaceChildren(grid, tip);
});

dash.draw('upcoming', (el) => {
  const d = dash.data('events');
  if (d.status !== 'ok') return notOk(el, d.status);
  const months = [...new Set(d.data.map((e) => e['월']))].sort();
  const cur = ym(today), nx = addMonths(cur, 1);
  let pick = months.filter((m) => m === cur || m === nx);
  if (!pick.length) pick = months.filter((m) => m > cur).slice(0, 2);
  const out = [];
  let nextDone = false;
  for (const m of pick) {
    const evs = d.data.map((e, i) => ({e, i, day: startDay(e['일정'], m)}))
      .filter((x) => x.e['월'] === m && !(x.day && x.day < todayStart))
      .sort((a, b) => (a.day && b.day ? a.day - b.day : a.day ? -1 : b.day ? 1 : a.i - b.i));
    if (!evs.length) continue;
    out.push(h('li', {class: 'nb-ev-month'}, monthLabel(m)));
    for (const {e, day} of evs) {
      const {date, text} = splitDate(e['일정']);
      const isNext = day && !nextDone;
      if (isNext) nextDone = true;
      out.push(h('li', {class: 'nb-ev' + (isNext ? ' is-next' : '')},
        h('span', {class: 'nb-ev-date'}, date || '이 달 중'),
        h('span', {class: 'nb-ev-text'}, text,
          e['구분'] === '예상' ? h('span', {class: 'nb-pill warn nb-pill-sm'}, '예상') : null,
          isNext ? h('span', {class: 'nb-next'}, '다음 일정') : null),
        h('span')));
    }
  }
  el.replaceChildren(...(out.length ? out : [h('li', {class: 'nb-empty'}, '이번 달과 다음 달에 남은 교회 일정이 없습니다.')]));
});

/* people */
dash.draw('person-chips', (el) => {
  const d = dash.data('person_load');
  if (d.status !== 'ok') return notOk(el, d.status);
  const cur = curPerson();
  const rows = d.data.slice().sort((a, b) => byOrder(a['교역자'], b['교역자']));
  el.replaceChildren(...rows.map((r) => {
    const name = r['교역자'];
    return h('button', {type: 'button', class: 'nb-chip' + (name === cur ? ' is-active' : ''), 'aria-pressed': name === cur ? 'true' : 'false', onclick: () => { state.person = name; renderAll(); }},
      name, h('span', {class: 'nb-chip-n'}, r['주담당']));
  }));
});
dash.draw('person-name', (el) => {
  if (store.status !== 'ok') return notOk(el, store.status);
  el.textContent = curPerson() || '—';
});
for (const [draw, field] of [['person-lead', '주담당'], ['person-coop', '협력']]) {
  dash.draw(draw, (el) => {
    const d = dash.data('person_load');
    if (d.status !== 'ok') return notOk(el, d.status);
    const row = d.data.find((r) => r['교역자'] === curPerson());
    el.textContent = row ? row[field] : 0;
  });
}
dash.draw('person-week-edit', (el) => {
  if (store.status !== 'ok') return el.replaceChildren();
  const name = curPerson();
  const row = store.raw.weekly.find((w) => w.person === name);
  const isStaff = store.raw.staff.some((s) => s.name === name);
  el.replaceChildren(row || isStaff ? editButton(`${name} 한 주 일정 수정`, () => editor.editWeekly(row || null, name), row ? '한 주 일정 수정' : '한 주 일정 만들기') : '');
});
dash.draw('person-week', (el) => {
  const d = dash.data('weekly');
  if (d.status !== 'ok') return notOk(el, d.status);
  const name = curPerson();
  const row = d.data.find((r) => r['교역자'] === name);
  if (!row) { el.replaceChildren(h('p', {class: 'nb-empty'}, `주간 일정에 ${name} 일정은 따로 적혀 있지 않습니다.`)); return; }
  el.replaceChildren(...DAYS.map((day) => {
    const items = lines(row[day]);
    const isToday = day === DAYS[today.getDay()];
    return h('div', {class: 'nb-wday' + (isToday ? ' is-today' : '') + (items.length ? '' : ' is-empty')},
      h('h4', null, isToday ? `${day} · 오늘` : day),
      h('ul', null, items.length ? items.map((x) => h('li', null, x)) : h('li', null, '—')));
  }));
});
dash.draw('person-tasks', (el) => {
  const d = dash.data('tasks');
  if (d.status !== 'ok') return notOk(el, d.status);
  const name = curPerson(), kind = el.dataset.kind;
  const mine = d.data.map((t) => [t, roleOf(t, name)]).filter(([t, r]) => r && t['주기 구분'] === kind)
    .sort((a, b) => (a[1] === b[1] ? (a[0].No || 0) - (b[0].No || 0) : a[1] === '주담당' ? -1 : 1));
  el.replaceChildren(...(mine.length ? mine.map(([t, r]) => taskItem(t, {role: r})) : [h('li', {class: 'nb-empty'}, '해당하는 업무가 없습니다.')]));
});
dash.draw('common-tasks', (el) => {
  const d = dash.data('tasks');
  if (d.status !== 'ok') return notOk(el, d.status);
  const rows = d.data.filter((t) => leadsOf(t).includes('교역자 공통'));
  el.replaceChildren(...(rows.length ? rows.map((t) => taskItem(t)) : [h('li', {class: 'nb-empty'}, '공통 업무가 없습니다.')]));
});

/* services */
dash.draw('services', (el) => {
  const d = dash.data('services');
  if (d.status !== 'ok') return notOk(el, d.status);
  if (!d.data.length) { el.replaceChildren(h('p', {class: 'nb-empty'}, "아직 예배가 없습니다. '+ 예배 추가'를 눌러 만드세요.")); return; }
  el.replaceChildren(...d.data.map((r) => {
    const dl = h('dl');
    for (const role of ROLES) {
      if (!r[role]) continue;
      dl.append(h('dt', null, role), h('dd', null, lines(r[role]).map((x) =>
        h('div', {class: 'nb-line' + (x.includes('미배정') ? ' is-bad' : x.includes('?') ? ' is-warn' : '')}, x))));
    }
    return h('article', {class: 'nb-card nb-svc'},
      h('div', {class: 'nb-row-between'}, h('h3', {class: 'nb-h2'}, r['예배']), editButton(`${r['예배']} 담당 수정`, () => editor.editService(raw('services', r.id)))),
      dl);
  }));
});

/* week */
dash.draw('week-day', (el) => {
  const d = dash.data('weekly');
  if (d.status !== 'ok') return notOk(el, d.status);
  const day = state.day;
  const rows = d.data.filter((r) => r['교역자'] !== '공통·비고');
  const withItems = rows.filter((r) => lines(r[day]).length);
  const without = rows.filter((r) => !lines(r[day]).length);
  const cards = withItems.map((r) => h('article', {class: 'nb-card nb-day-card'},
    h('div', {class: 'nb-row-between'}, h('h3', {class: 'nb-h3'}, r['교역자']), editButton(`${r['교역자']} 한 주 일정 수정`, () => editor.editWeekly(raw('weekly', r.id)))),
    h('ul', null, lines(r[day]).map((x) => h('li', null, x)))));
  if (without.length) cards.push(h('article', {class: 'nb-card nb-day-card is-empty'},
    h('h3', {class: 'nb-h3 nb-k'}, day === '주일' ? '주일 일정이 적혀 있지 않은 사람' : `${day}요일 일정이 적혀 있지 않은 사람`),
    h('div', {class: 'nb-quick'}, without.map((r) => (db.canEdit
      ? h('button', {type: 'button', onclick: () => editor.editWeekly(raw('weekly', r.id))}, `${r['교역자']} · 추가`)
      : h('span', null, r['교역자']))))));
  el.replaceChildren(...(cards.length ? cards : [h('p', {class: 'nb-empty'}, '이 요일에 적힌 일정이 없습니다.')]));
});
dash.draw('week-note', (el) => {
  const d = dash.data('weekly');
  if (d.status !== 'ok') return notOk(el, d.status);
  const row = d.data.find((r) => r['교역자'] === '공통·비고');
  if (!row) { el.replaceChildren(h('span', null, '공통·비고가 없습니다.')); return; }
  el.replaceChildren(
    h('div', {class: 'nb-row-between'}, h('strong', {class: 'nb-h3'}, '공통·비고'), editButton('공통·비고 수정', () => editor.editWeekly(raw('weekly', row.id)))),
    ...lines(row['주일'], /\||\n/).map((x) => h('span', null, x)));
});
dash.draw('week-table', (el) => {
  const d = dash.data('weekly');
  if (d.status !== 'ok') return notOk(el, d.status);
  const td = DAYS[today.getDay()];
  el.replaceChildren(...d.data.filter((r) => r['교역자'] !== '공통·비고').map((r) =>
    h('tr', null,
      h('th', {scope: 'row'}, r['교역자']),
      DAYS.map((day) => h('td', {class: day === td ? 'is-today' : null}, h('ul', null, lines(r[day]).map((x) => h('li', null, x))))))));
});

/* year */
dash.draw('month-chips', (el) => {
  if (store.status !== 'ok') return notOk(el, store.status);
  const ms = allMonths(), cur = curMonth(ms), now = ym(today);
  el.replaceChildren(...ms.map((m, i) => h('button', {
    type: 'button', class: 'nb-mchip' + (m === cur ? ' is-active' : '') + (m === now ? ' is-now' : ''),
    'aria-pressed': m === cur ? 'true' : 'false', 'aria-label': monthLabel(m) + (m === now ? ' (이번 달)' : ''),
    onclick: () => { state.month = m; ['month-chips', 'month-title', 'month-events', 'month-jobs'].forEach(renderNamed); },
  }, h('span', {class: 'nb-mchip-y'}, i === 0 || m.endsWith('-01') ? m.slice(0, 4) : ''), h('span', {class: 'nb-mchip-m'}, `${Number(m.slice(5))}월`))));
  el.querySelector('.is-active')?.scrollIntoView?.({block: 'nearest', inline: 'center'});
});
dash.draw('month-title', (el) => {
  if (store.status !== 'ok') return notOk(el, store.status);
  const m = curMonth(allMonths());
  el.textContent = monthLabel(m) + (m === ym(today) ? ' · 이번 달' : '');
});
dash.draw('month-events', (el) => {
  const E = dash.data('events');
  if (E.status !== 'ok') return notOk(el, E.status);
  const m = curMonth(allMonths());
  const evs = E.data.map((e, i) => ({e, i, day: startDay(e['일정'], m)})).filter((x) => x.e['월'] === m)
    .sort((a, b) => (a.day && b.day ? a.day - b.day : a.day ? -1 : b.day ? 1 : a.i - b.i));
  el.replaceChildren(...(evs.length ? evs.map(({e, day}) => {
    const {date, text} = splitDate(e['일정']);
    return h('li', {class: 'nb-ev' + (day && day < todayStart ? ' is-past' : '')},
      h('span', {class: 'nb-ev-date'}, date || '이 달 중'),
      h('span', {class: 'nb-ev-text'}, text, e['구분'] === '예상' ? h('span', {class: 'nb-pill warn nb-pill-sm'}, '예상') : null),
      editButton(`'${e['일정']}' 수정`, () => editor.editEvent(raw('events', e.id))));
  }) : [h('li', {class: 'nb-empty'}, '적힌 교회 일정이 없습니다.')]));
});
dash.draw('month-jobs', (el) => {
  const d = dash.data('annual');
  if (d.status !== 'ok') return notOk(el, d.status);
  const m = curMonth(allMonths());
  const jobs = d.data.filter((r) => r[m]);
  el.replaceChildren(...(jobs.length ? jobs.map((r) => h('li', {class: 'nb-task'},
    h('div', {class: 'nb-task-top'},
      h('span', {class: 'nb-tag'}, r['부서']),
      h('span', {class: 'nb-task-name'}, r['업무']),
      editButton(`'${r['업무']}' 수정`, () => editor.editAnnual(raw('annual', r.id)))),
    h('div', {class: 'nb-task-meta'},
      h('span', null, h('span', {class: 'nb-k'}, '담당 '), r['담당'] === '미정' ? h('span', {class: 'nb-pill bad'}, '미정') : h('span', null, r['담당'])),
      h('span', null, h('span', {class: 'nb-k'}, '이 달 '), h('span', null, r[m] === '●' ? '진행' : r[m])))))
    : [h('li', {class: 'nb-empty'}, '이 달에 표시된 연간 업무가 없습니다.')]));
});
dash.draw('year-head', (el) => {
  if (store.status !== 'ok') return el.replaceChildren();
  const now = ym(today);
  el.replaceChildren(h('tr', null, h('th', null, '부서'), h('th', null, '업무'), h('th', null, '담당'),
    allMonths().map((m) => h('th', {class: 'c-m' + (m === now ? ' is-now' : '')}, shortMonth(m)))));
});
dash.draw('year-table', (el) => {
  const d = dash.data('annual');
  if (d.status !== 'ok') return notOk(el, d.status);
  const ms = allMonths(), now = ym(today);
  el.replaceChildren(...d.data.map((r) => h('tr', null,
    h('td', {class: 'c-small'}, r['부서']),
    h('td', null, r['업무']),
    h('td', {class: 'c-small'}, r['담당'] === '미정' ? h('span', {class: 'nb-pill bad'}, '미정') : r['담당']),
    ms.map((m) => h('td', {class: 'c-m' + (m === now ? ' is-now' : '')}, r[m] === '●' ? h('span', {class: 'nb-ydot', 'aria-label': '진행'}) : r[m] || '')))));
});

/* todo */
dash.draw('todo', (el) => {
  const d = dash.data('tasks');
  if (d.status !== 'ok') return notOk(el, d.status);
  const rows = d.data.filter((t) => t['상태'] === el.dataset.status);
  if (!rows.length) { el.replaceChildren(h('p', {class: 'nb-empty'}, '해당하는 업무가 없습니다. 모두 정해졌어요!')); return; }
  const groups = new Map();
  for (const t of rows) { if (!groups.has(t['카테고리'])) groups.set(t['카테고리'], []); groups.get(t['카테고리']).push(t); }
  el.replaceChildren(...[...groups].map(([cat, ts]) => h('div', {class: 'nb-catgroup'},
    h('h4', null, cat),
    h('ul', {class: 'nb-tasks'}, ts.map((t) => taskItem(t))))));
});

/* all */
dash.draw('opt-cat', (sel) => {
  const d = dash.data('tasks');
  if (d.status !== 'ok') return notOk(sel, d.status);
  const cats = [...new Set(d.data.map((t) => t['카테고리']))];
  sel.replaceChildren(new Option('전체', ''), ...cats.map((c) => new Option(c, c)));
  sel.value = params.cat ?? '';
  sel.onchange = () => dash.setParams({cat: sel.value});
});
dash.draw('opt-who', (sel) => {
  const d = dash.data('person_load');
  if (d.status !== 'ok') return notOk(sel, d.status);
  const names = d.data.map((r) => r['교역자']).sort(byOrder);
  sel.replaceChildren(new Option('전체', ''), ...names.map((n) => new Option(n, n)));
  sel.value = params.who ?? '';
  sel.onchange = () => dash.setParams({who: sel.value});
});
dash.draw('all-table', (el) => {
  const d = dash.data('shown_tasks');
  if (d.status !== 'ok') return notOk(el, d.status);
  if (!d.data.length) { el.replaceChildren(h('tr', null, h('td', {colspan: 10, class: 'nb-empty'}, '조건에 맞는 업무가 없습니다. 조건을 지우거나 바꿔 보세요.'))); return; }
  el.replaceChildren(...d.data.map((t) => h('tr', {'data-id': t.id},
    h('td', {class: 'c-no'}, t.No),
    h('td', {class: 'c-st'}, statusPill(t)),
    h('td', {class: 'c-cat c-small'}, t['카테고리']),
    h('td', {class: 'c-sub c-small'}, t['중분류']),
    h('td', {class: 'c-task'}, t['세부 업무']),
    h('td', {class: 'c-when c-small'}, t['주기·시기']),
    h('td', {class: 'c-lead c-small'}, t['주담당']),
    h('td', {class: 'c-coop c-small'}, t['협력']),
    h('td', {class: 'c-note'}, t['비고']),
    h('td', {class: 'c-act'}, editButton(`'${t['세부 업무']}' 수정`, () => editor.editTask(raw('tasks', t.id)))))));
});

/* history */
const SKIP = new Set(['id', 'updated_at', 'updated_by']);
function showVal(table, key, v) {
  if (key === 'deleted') return v ? '숨김' : '보임';
  if (key === 'expected') return v ? '예상' : '확정';
  if (v == null || v === '') return '(빈칸)';
  return String(v);
}
function diffLines(entry) {
  const b = entry.before || {}, a = entry.after || {};
  const labels = {...COMMON_LABEL, ...(FIELD_LABEL[entry.table_name] || {})};
  const out = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (SKIP.has(k)) continue;
    if (k === 'months') {
      const bm = b.months || {}, am = a.months || {};
      for (const m of new Set([...Object.keys(bm), ...Object.keys(am)])) {
        if ((bm[m] || '') !== (am[m] || '')) out.push([shortMonth(m) + '월', bm[m] || '(빈칸)', am[m] || '(빈칸)']);
      }
      continue;
    }
    if (JSON.stringify(b[k] ?? '') !== JSON.stringify(a[k] ?? '')) out.push([labels[k] || k, showVal(entry.table_name, k, b[k]), showVal(entry.table_name, k, a[k])]);
  }
  return out;
}
async function undo(entry, btn) {
  if (!btn.classList.contains('is-armed')) { btn.classList.add('is-armed', 'nb-btn-danger'); btn.textContent = '한 번 더 누르면 되돌려요'; return; }
  btn.disabled = true;
  try {
    const who = editor.getEditor() || await editor.askEditorName('되돌리기 전에, 누가 되돌렸는지 남기기 위해 이름을 적어 주세요.');
    if (!who) { btn.disabled = false; return; }
    if (entry.action === 'insert') await db.update(entry.table_name, entry.row_id, {deleted: true}, who);
    else {
      const patch = {};
      const b = entry.before || {}, a = entry.after || {};
      for (const k of Object.keys(b)) if (!SKIP.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k])) patch[k] = b[k];
      await db.update(entry.table_name, entry.row_id, patch, who);
    }
    await refreshAll();
    await loadHistory(true);
    toast('되돌렸어요');
  } catch (e) {
    toast(e.message, {bad: true});
    btn.disabled = false;
  }
}
dash.draw('history', (el) => {
  if (store.logError) { el.replaceChildren(h('li', {class: 'nb-log-item'}, h('p', {class: 'nb-empty'}, store.logError))); return; }
  if (!store.log) { el.replaceChildren(h('li', {class: 'nb-log-item'}, h('p', {class: 'nb-empty'}, '불러오는 중…'))); return; }
  if (!store.log.length) { el.replaceChildren(h('li', {class: 'nb-log-item'}, h('p', {class: 'nb-empty'}, '아직 바뀐 내용이 없습니다. 무엇이든 고치면 여기에 남아요.'))); return; }
  el.replaceChildren(...store.log.map((e) => {
    const row = e.after || e.before;
    const label = TABLE_LABEL[e.table_name] || e.table_name;
    const diffs = e.action === 'insert' ? [] : diffLines(e);
    const hidden = diffs.length === 1 && diffs[0][0] === '숨김';
    const verb = e.action === 'insert' ? '추가' : hidden ? (e.after?.deleted ? '숨김' : '다시 보이기') : '수정';
    const btn = h('button', {type: 'button', class: 'nb-btn nb-btn-sm'}, '되돌리기');
    btn.addEventListener('click', () => undo(e, btn));
    return h('li', {class: 'nb-log-item'},
      h('div', {class: 'nb-log-head'},
        h('span', {class: 'nb-log-who'}, e.changed_by || '이름 없음'),
        h('span', {class: 'nb-log-when'}, when(e.changed_at)),
        h('span', null, h('span', {class: 'nb-k'}, `${label} ${verb} · `), h('span', {class: 'nb-log-what'}, rowTitle(e.table_name, row)))),
      h('div', {class: 'nb-log-actions'}, e.changed_by === '엑셀 가져오기' ? null : btn),
      diffs.length && !hidden ? h('div', {class: 'nb-log-diff'}, diffs.map(([k, b, a]) => h('div', null, h('span', {class: 'nb-k'}, k + ': '), h('del', null, b), ' → ', h('ins', null, a)))) : null);
  }));
});

/* ---------- refresh ---------- */
let refreshing = null;
export async function refreshAll() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await db.loadAll();
      applyData(data);
      document.getElementById('load-error').hidden = true;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
