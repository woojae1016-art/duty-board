// 수정·추가 창. 저장하면 Supabase(또는 예시 모드 메모리)에 쓰고 화면을 새로 그립니다.
import * as db from './data.js';
import {SERVICE_FIELDS, DAY_FIELDS} from './model.js';
import {h, shortMonth, toast} from './util.js';

const EDITOR_KEY = 'duty-board.editor';
let ctx = null; // {raw: () => rows by table, months: () => string[], refresh: () => Promise, onEditor: (name) => void}

export function initEditor(c) {
  ctx = c;
  const dlg = document.getElementById('dlg');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

export function getEditor() {
  try { return localStorage.getItem(EDITOR_KEY) || ''; } catch { return ''; }
}
function setEditor(name) {
  try { localStorage.setItem(EDITOR_KEY, name); } catch { /* 저장 못 해도 이번 화면에서는 씀 */ }
  memoryEditor = name;
  ctx?.onEditor(name);
}
let memoryEditor = '';
const editorName = () => getEditor() || memoryEditor;

/* ---------- 공통 폼 ---------- */
let seq = 0;
function fieldNode(f, values) {
  const id = `ff-${++seq}`;
  if (f.type === 'row') return h('div', {class: 'nb-ff-row'}, f.fields.map((x) => fieldNode(x, values)));
  if (f.type === 'custom') return f.render(values);
  const wrap = h('div', {class: 'nb-ff'});
  const v = f.value ?? '';
  if (f.type === 'seg') {
    wrap.append(h('span', {class: 'nb-ff-label', id: id + '-l'}, f.label));
    const group = h('div', {class: 'nb-seg-ctl', role: 'radiogroup', 'aria-labelledby': id + '-l'});
    for (const [val, label, dot] of f.options) {
      const input = h('input', {type: 'radio', name: f.name, value: val});
      input.checked = String(v) === String(val);
      group.append(h('label', null, input, h('span', null, dot ? h('i', {class: 'nb-dot ' + dot}) : null, label)));
    }
    wrap.append(group);
  } else {
    wrap.append(h('label', {for: id}, f.label, f.required ? ' *' : ''));
    let input;
    if (f.type === 'textarea') input = h('textarea', {id, name: f.name, rows: f.rows || 3, maxlength: f.max, placeholder: f.placeholder});
    else if (f.type === 'select') {
      input = h('select', {id, name: f.name});
      for (const [val, label] of f.options) input.append(new Option(label, val));
    } else input = h('input', {type: 'text', id, name: f.name, maxlength: f.max, placeholder: f.placeholder, list: f.list ? id + '-list' : null, autocomplete: 'off'});
    input.value = v;
    wrap.append(input);
    if (f.list) wrap.append(h('datalist', {id: id + '-list'}, f.list.map((x) => h('option', {value: x}))));
    if (f.quick?.length) {
      const quick = h('div', {class: 'nb-quick', 'aria-label': `${f.label}에 이름 넣기`});
      const sync = () => {
        const cur = input.value.split(',').map((x) => x.trim()).filter(Boolean);
        quick.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', cur.includes(b.dataset.name)));
      };
      for (const name of f.quick) {
        quick.append(h('button', {type: 'button', 'data-name': name, onclick: () => {
          const cur = input.value.split(',').map((x) => x.trim()).filter(Boolean);
          const i = cur.indexOf(name);
          if (i >= 0) cur.splice(i, 1); else cur.push(name);
          input.value = cur.join(', ');
          sync();
        }}, name));
      }
      input.addEventListener('input', sync);
      sync();
      wrap.append(quick);
    }
  }
  if (f.hint) wrap.append(h('p', {class: 'nb-ff-hint'}, f.hint));
  return wrap;
}

let activeCleanup = null;
export function openForm({title, intro, fields, submitLabel = '저장', danger, onSubmit, extraFoot, needName = true}) {
  if (!db.canEdit) { toast('보기 전용 화면이에요.'); return Promise.resolve(null); }
  const dlg = document.getElementById('dlg');
  activeCleanup?.(false);
  if (dlg.open) dlg.close();
  // 아직 이름을 모르면, 저장 창 안에서 바로 받음 (창을 겹쳐 띄우지 않음)
  if (needName && onSubmit && !editorName()) {
    fields = [...fields, {name: '__editor', label: '수정하는 분 이름', required: true, max: 40, placeholder: '예: 노주희 목사', hint: '누가 고쳤는지 변경 기록에 남겨요. 이 기기에 기억해 두니 한 번만 적으면 돼요.'}];
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const onClose = () => { if (!dlg.open) cleanup(false); };
    const cleanup = (v) => {
      dlg.removeEventListener('close', onClose);
      if (activeCleanup === cleanup) activeCleanup = null;
      finish(v);
    };
    activeCleanup = cleanup;
    const values = {};
    const body = h('div', {class: 'nb-form-body'}, intro ? h('p', {class: 'nb-ff-hint'}, intro) : null, fields.map((f) => fieldNode(f, values)));
    const err = h('p', {class: 'nb-form-error', role: 'alert'}); err.hidden = true;
    body.append(err);
    const submit = submitLabel ? h('button', {type: 'submit', class: 'nb-btn nb-btn-primary'}, submitLabel) : null;
    const foot = h('div', {class: 'nb-form-foot'});
    if (danger) {
      const d = h('button', {type: 'button', class: 'nb-btn nb-btn-danger'}, danger.label);
      d.addEventListener('click', async () => {
        if (!d.classList.contains('is-armed')) { d.classList.add('is-armed'); d.textContent = danger.confirm || '한 번 더 누르면 실행돼요'; return; }
        const nameInput = form.elements.__editor;
        if (nameInput) {
          if (!nameInput.value.trim()) { err.textContent = "'수정하는 분 이름'을 적어 주세요."; err.hidden = false; nameInput.focus(); return; }
          setEditor(nameInput.value.trim());
        }
        d.disabled = true;
        try { await danger.run(); dlg.close(); cleanup(true); } catch (e) { showError(e); d.disabled = false; }
      });
      foot.append(d);
    }
    if (extraFoot) foot.append(extraFoot);
    foot.append(h('span', {class: 'nb-spacer'}), h('button', {type: 'button', class: 'nb-btn', onclick: () => dlg.close()}, submitLabel ? '취소' : '닫기'), submit);
    const form = h('form', {class: 'nb-form', novalidate: true},
      h('div', {class: 'nb-form-head'}, h('div', null, h('h2', {id: 'dlg-title'}, title)), h('button', {type: 'button', class: 'nb-x', 'aria-label': '닫기', onclick: () => dlg.close()}, '×')),
      body, foot);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      const data = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else data[el.name] = el.value.trim();
      }
      const missing = fields.flatMap((f) => (f.type === 'row' ? f.fields : [f])).find((f) => f.required && !data[f.name]);
      if (missing) { err.textContent = `'${missing.label}'을(를) 적어 주세요.`; err.hidden = false; form.elements[missing.name]?.focus?.(); return; }
      if (data.__editor) { setEditor(data.__editor); delete data.__editor; }
      if (submit) { submit.disabled = true; submit.textContent = '저장 중…'; }
      try {
        await onSubmit(data);
        dlg.close();
        cleanup(true);
      } catch (e2) {
        showError(e2);
        if (submit) { submit.disabled = false; submit.textContent = submitLabel; }
      }
    });
    function showError(e) {
      if (form.isConnected && dlg.open) { err.textContent = e.message; err.hidden = false; } else toast(e.message, {bad: true});
    }
    dlg.replaceChildren(form);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    const first = form.querySelector('input[type=text],textarea');
    if (first) { first.focus(); first.setSelectionRange?.(first.value.length, first.value.length); }
  });
}

/* ---------- 이름 ---------- */
export async function askEditorName(reason) {
  const ok = await openForm({
    title: '수정하는 분 이름',
    intro: reason || '누가 고쳤는지 변경 기록에 남기기 위해 이름을 한 번만 적어 주세요. 이 기기에 기억해 둡니다.',
    fields: [{name: 'name', label: '이름', required: true, max: 40, value: editorName(), placeholder: '예: 노주희 목사'}],
    submitLabel: '확인',
    needName: false,
    onSubmit: async ({name}) => setEditor(name),
  });
  return ok ? editorName() : '';
}
async function needEditor() {
  return editorName() || askEditorName('고친 내용을 저장하기 전에, 누가 고쳤는지 남기기 위해 이름을 한 번만 적어 주세요.');
}
async function saveWith(fn, message = '저장했어요') {
  const who = await needEditor();
  if (!who) throw new Error('이름을 적어야 저장할 수 있어요.');
  await fn(who);
  await ctx.refresh();
  toast(message);
}

/* ---------- 업무 ---------- */
const STATUS_OPTS = [['확정', '확정', 'ok'], ['확인필요', '확인필요', 'warn'], ['미배정', '미배정', 'bad']];
const KIND_OPTS = [['정기', '정기 (매일·매주·매월)'], ['수시', '수시·상시'], ['특별절기', '특별절기·연간']];
const uniq = (a) => [...new Set(a.filter(Boolean))];

export async function editTask(task, preset = {}) {
  const raw = ctx.raw();
  const isNew = !task;
  const t = task || {title: '', category: preset.category || '', subcategory: '', schedule: '', lead: '', coop: '', status: preset.status || '미배정', note: '', kind: preset.kind || '정기'};
  const names = [...raw.staff.map((s) => s.name), '교역자 공통'];
  // 지금 있는 업무 안에서 같은 부서의 중분류만 먼저 제안
  const cats = uniq(raw.tasks.map((x) => x.category));
  const subs = uniq(raw.tasks.map((x) => x.subcategory));
  return openForm({
    title: isNew ? '새 업무 추가' : '업무 수정',
    intro: isNew ? null : `No.${t.no ?? '-'} · 저장하면 모든 사람 화면에 바로 반영되고 변경 기록에 남아요.`,
    fields: [
      {name: 'title', label: '세부 업무', type: 'textarea', rows: 2, required: true, max: 300, value: t.title},
      {type: 'row', fields: [
        {name: 'category', label: '부서(카테고리)', required: true, max: 40, value: t.category, list: cats},
        {name: 'subcategory', label: '중분류', max: 60, value: t.subcategory, list: subs},
      ]},
      {type: 'row', fields: [
        {name: 'schedule', label: '주기·시기', max: 120, value: t.schedule, placeholder: '예: 매주 수, 월~금, 연 2회'},
        {name: 'kind', label: '주기 구분', type: 'select', options: KIND_OPTS, value: t.kind},
      ]},
      {name: 'lead', label: '주담당', max: 120, value: t.lead, quick: names, hint: '여러 명이면 쉼표로 구분해요. 아래 이름을 누르면 넣고 뺄 수 있어요.'},
      {name: 'coop', label: '협력 (교역자·성도)', max: 200, value: t.coop, quick: names.filter((n) => n !== '교역자 공통')},
      {name: 'status', label: '상태', type: 'seg', options: STATUS_OPTS, value: t.status, hint: '확정 = 본인 확인 끝 · 확인필요 = 담당·주기 확인 필요 · 미배정 = 담당자 없음'},
      {name: 'note', label: '비고', type: 'textarea', rows: 2, max: 500, value: t.note},
    ],
    submitLabel: isNew ? '추가' : '저장',
    danger: isNew ? null : {label: '이 업무 숨기기', confirm: '한 번 더 누르면 숨겨요 (변경 기록에서 되돌릴 수 있음)', run: () => saveWith((who) => db.update('tasks', t.id, {deleted: true}, who), '업무를 숨겼어요. 변경 기록에서 되돌릴 수 있어요.')},
    onSubmit: (v) => saveWith(async (who) => {
      const row = {title: v.title, category: v.category, subcategory: v.subcategory, schedule: v.schedule, lead: v.lead, coop: v.coop, status: v.status || '미배정', note: v.note, kind: v.kind || '정기'};
      if (isNew) {
        row.no = Math.max(0, ...raw.tasks.map((x) => x.no || 0)) + 1;
        await db.insert('tasks', row, who);
      } else {
        const patch = {};
        for (const [k, val] of Object.entries(row)) if ((t[k] ?? '') !== val) patch[k] = val;
        if (!Object.keys(patch).length) return;
        await db.update('tasks', t.id, patch, who);
      }
    }, isNew ? '새 업무를 추가했어요' : '저장했어요'),
  });
}

/* ---------- 주간 일정 ---------- */
export async function editWeekly(row, person) {
  const isNew = !row;
  const r = row || {person, sort: 50};
  const common = r.person === '공통·비고';
  return openForm({
    title: common ? '주간 일정 공통·비고' : `${r.person} 한 주 일정`,
    intro: common ? '모든 교역자에게 해당하는 안내를 적어요. 항목은 | 로 나눌 수 있어요.' : '한 줄에 하나씩 적어요. 비워 두면 그 요일은 일정 없음으로 보여요.',
    fields: common
      ? [{name: 'sun', label: '공통·비고', type: 'textarea', rows: 5, max: 600, value: r.sun}]
      : DAY_FIELDS.map(([col, ko]) => ({name: col, label: ko === '주일' ? '주일' : `${ko}요일`, type: 'textarea', rows: 2, max: 600, value: r[col] || ''})),
    onSubmit: (v) => saveWith(async (who) => {
      if (isNew) await db.insert('weekly', {person: r.person, sort: r.sort, ...v}, who);
      else {
        const patch = {};
        for (const [k, val] of Object.entries(v)) if ((r[k] ?? '') !== val) patch[k] = val;
        if (Object.keys(patch).length) await db.update('weekly', r.id, patch, who);
      }
    }),
  });
}

/* ---------- 예배별 담당 ---------- */
export async function editService(row) {
  const isNew = !row;
  const r = row || {name: '', sort: Math.max(0, ...ctx.raw().services.map((s) => s.sort || 0)) + 1};
  return openForm({
    title: isNew ? '예배 추가' : `${r.name} 담당 수정`,
    intro: '한 칸에 여러 줄을 적을 수 있어요. 담당자가 없으면 "미배정", 확인이 필요하면 "(?)"를 붙이면 화면에 색으로 표시돼요.',
    fields: [
      {name: 'name', label: '예배 이름', required: true, max: 60, value: r.name},
      {type: 'row', fields: SERVICE_FIELDS.map(([col, ko]) => ({name: col, label: ko, type: 'textarea', rows: 2, max: 300, value: r[col] || ''}))},
    ],
    submitLabel: isNew ? '추가' : '저장',
    danger: isNew ? null : {label: '이 예배 숨기기', confirm: '한 번 더 누르면 숨겨요', run: () => saveWith((who) => db.update('services', r.id, {deleted: true}, who), '예배를 숨겼어요.')},
    onSubmit: (v) => saveWith(async (who) => {
      if (isNew) await db.insert('services', {...v, sort: r.sort}, who);
      else {
        const patch = {};
        for (const [k, val] of Object.entries(v)) if ((r[k] ?? '') !== val) patch[k] = val;
        if (Object.keys(patch).length) await db.update('services', r.id, patch, who);
      }
    }),
  });
}

/* ---------- 연간 업무 ---------- */
export async function editAnnual(row, focusMonth) {
  const raw = ctx.raw();
  const isNew = !row;
  const r = row || {dept: '', task: '', owner: '미정', months: focusMonth ? {[focusMonth]: '●'} : {}, sort: Math.max(0, ...raw.annual.map((a) => a.sort || 0)) + 1};
  const months = ctx.months();
  const names = ['미정', ...raw.staff.map((s) => s.name)];
  return openForm({
    title: isNew ? '연간 업무 추가' : '연간 업무 수정',
    intro: '진행하는 달에 내용을 적어요. 특별한 내용이 없으면 ● 만 적어도 돼요. 비워 두면 그 달에는 표시되지 않아요.',
    fields: [
      {type: 'row', fields: [
        {name: 'dept', label: '부서', required: true, max: 40, value: r.dept, list: uniq(raw.annual.map((a) => a.dept))},
        {name: 'owner', label: '담당', max: 60, value: r.owner, quick: names, hint: '정해지지 않았으면 "미정"'},
      ]},
      {name: 'task', label: '업무', required: true, max: 120, value: r.task},
      {type: 'row', fields: months.map((m) => ({name: 'm:' + m, label: shortMonth(m), max: 80, value: (r.months || {})[m] || '', placeholder: '●'}))},
    ],
    submitLabel: isNew ? '추가' : '저장',
    danger: isNew ? null : {label: '이 연간 업무 숨기기', confirm: '한 번 더 누르면 숨겨요', run: () => saveWith((who) => db.update('annual', r.id, {deleted: true}, who), '연간 업무를 숨겼어요.')},
    onSubmit: (v) => saveWith(async (who) => {
      const m = {...(r.months || {})};
      for (const [k, val] of Object.entries(v)) {
        if (!k.startsWith('m:')) continue;
        const key = k.slice(2);
        if (val) m[key] = val; else delete m[key];
      }
      const row2 = {dept: v.dept, task: v.task, owner: v.owner || '미정', months: m};
      if (isNew) await db.insert('annual', {...row2, sort: r.sort}, who);
      else {
        const patch = {};
        for (const [k, val] of Object.entries(row2)) if (JSON.stringify(r[k] ?? '') !== JSON.stringify(val)) patch[k] = val;
        if (Object.keys(patch).length) await db.update('annual', r.id, patch, who);
      }
    }),
  });
}

/* ---------- 교회 일정 ---------- */
export async function editEvent(row, month) {
  const isNew = !row;
  const r = row || {month, label: '', expected: false, sort: Math.max(0, ...ctx.raw().events.map((e) => e.sort || 0)) + 1};
  const months = ctx.months();
  return openForm({
    title: isNew ? '교회 일정 추가' : '교회 일정 수정',
    fields: [
      {name: 'month', label: '달', type: 'select', options: months.map((m) => [m, `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`]), value: r.month},
      {name: 'label', label: '일정', required: true, max: 120, value: r.label, hint: '날짜가 있으면 맨 앞에 적어요. 예: 12/24 성탄전야 발표회, 12/28~ 연말연초 특새'},
      {name: 'expected', label: '구분', type: 'seg', options: [['false', '확정'], ['true', '예상']], value: String(Boolean(r.expected))},
    ],
    submitLabel: isNew ? '추가' : '저장',
    danger: isNew ? null : {label: '이 일정 숨기기', confirm: '한 번 더 누르면 숨겨요', run: () => saveWith((who) => db.update('events', r.id, {deleted: true}, who), '일정을 숨겼어요.')},
    onSubmit: (v) => saveWith(async (who) => {
      const row2 = {month: v.month, label: v.label, expected: v.expected === 'true'};
      if (isNew) await db.insert('events', {...row2, sort: r.sort}, who);
      else {
        const patch = {};
        for (const [k, val] of Object.entries(row2)) if (r[k] !== val) patch[k] = val;
        if (Object.keys(patch).length) await db.update('events', r.id, patch, who);
      }
    }),
  });
}

/* ---------- 교역자 명단 ---------- */
export async function manageStaff() {
  const staff = ctx.raw().staff;
  const list = h('div', {class: 'nb-staff-list'},
    staff.map((s) => h('div', {class: 'nb-staff-row'},
      h('div', {class: 'nb-ff'}, h('span', {class: 'nb-ff-label'}, '이름'), h('strong', null, s.name)),
      h('div', {class: 'nb-ff'}, h('span', {class: 'nb-ff-label'}, '짧은 이름'), h('span', null, s.short)),
      h('div', {class: 'nb-quick'},
        h('button', {type: 'button', onclick: () => renameStaff(s)}, '이름 바꾸기'),
        h('button', {type: 'button', onclick: () => hideStaff(s)}, '명단에서 빼기')))));
  return openForm({
    title: '교역자 명단 관리',
    intro: "명단에 있는 이름이 그래프·담당자 선택에 쓰여요. '이름 바꾸기'를 하면 업무표·주간 일정·연간 일정·예배별 담당에 적힌 이름도 한꺼번에 바뀌어요. 예: '남자 전도사' → 실제 이름",
    fields: [
      {type: 'custom', render: () => list},
      {type: 'row', fields: [
        {name: 'name', label: '새 교역자 이름', max: 40, placeholder: '예: 박성빈 강도사'},
        {name: 'short', label: '짧은 이름', max: 20, placeholder: '예: 박성빈', hint: '협력 칸에서 이 이름을 찾아 셉니다'},
      ]},
    ],
    submitLabel: '새 교역자 추가',
    onSubmit: (v) => {
      if (!v.name) throw new Error('추가할 이름을 적어 주세요. 추가하지 않으려면 닫기를 누르세요.');
      return saveWith(async (who) => {
        const sort = Math.max(0, ...staff.map((s) => s.sort || 0)) + 1;
        await db.insert('staff', {name: v.name, short: v.short || v.name.split(' ')[0], sort}, who);
        if (!ctx.raw().weekly.some((w) => w.person === v.name)) await db.insert('weekly', {person: v.name, sort}, who);
      }, `${v.name}을(를) 명단에 추가했어요`);
    },
  });
}

async function renameStaff(s) {
  await openForm({
    title: `'${s.name}' 이름 바꾸기`,
    intro: '업무표의 주담당·협력, 주간 일정, 연간 일정 담당, 예배별 담당에 적힌 이 이름이 모두 새 이름으로 바뀌어요.',
    fields: [
      {name: 'name', label: '새 이름', required: true, max: 40, value: s.name},
      {name: 'short', label: '짧은 이름', required: true, max: 20, value: s.short, hint: '협력 칸에서 찾을 때 쓰는 이름 (예: 노주희)'},
    ],
    submitLabel: '바꾸기',
    onSubmit: (v) => saveWith((who) => db.renamePerson(s.name, v.name, v.short, who), `이름을 '${v.name}'(으)로 바꿨어요`),
  });
}
async function hideStaff(s) {
  await openForm({
    title: `'${s.name}' 명단에서 빼기`,
    intro: '명단에서만 빠지고, 업무표에 적힌 이름은 그대로 남아요. 그 업무들은 그래프에서 \'성도 봉사\'로 묶여 보이니, 먼저 업무 담당을 바꾸는 것이 좋아요. 변경 기록에서 되돌릴 수 있어요.',
    fields: [],
    submitLabel: '명단에서 빼기',
    onSubmit: () => saveWith((who) => db.update('staff', s.id, {deleted: true}, who), '명단에서 뺐어요'),
  });
}
