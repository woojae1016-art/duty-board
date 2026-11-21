// 데이터 읽기·쓰기. Supabase 주소와 키가 있으면 실제 DB.
// 없으면 개발 중(npm run dev)에는 '예시 모드'(고쳐 볼 수 있지만 저장 안 됨), 올린 사이트에서는 '보기 전용'.
import {createClient} from '@supabase/supabase-js';
import {seedRows} from './seedmap.js';

// 우선순위: config.js(올린 뒤 고칠 수 있음) → 빌드할 때의 .env.local
const CFG = (typeof window !== 'undefined' && window.DUTY_CONFIG) || {};
const URL = (CFG.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '').trim();
const KEY = (CFG.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const mode = URL && KEY ? 'live' : import.meta.env.DEV || CFG.demo ? 'demo' : 'view';
export const canEdit = mode !== 'view';
function assertEditable() {
  if (!canEdit) throw new Error('보기 전용 화면이라 고칠 수 없어요.');
}
const sb = mode === 'live' ? createClient(URL, KEY, {auth: {persistSession: false}}) : null;

export const TABLES = ['staff', 'tasks', 'weekly', 'services', 'annual', 'events'];
const ORDER = {tasks: 'no', staff: 'sort', weekly: 'sort', services: 'sort', annual: 'sort', events: 'sort'};

function friendly(error) {
  const msg = String(error?.message || error || '');
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  if (/check constraint|violates check/i.test(msg)) return '입력한 내용이 너무 길거나 형식이 맞지 않아요. 내용을 줄이거나 확인해 주세요.';
  if (/duplicate key|unique/i.test(msg)) return '같은 이름이 이미 있어요. 다른 이름을 써 주세요.';
  if (/row-level security|permission denied/i.test(msg)) return '저장 권한이 없어요. Supabase 설정(schema.sql)을 다시 실행해 주세요.';
  return msg || '알 수 없는 오류가 났어요.';
}

/* ---------- 예시 모드: 브라우저 메모리에만 저장 ---------- */
let demo = null;
async function demoDb() {
  if (demo) return demo;
  // 예시 데이터는 예시 모드일 때만 내려받음
  const [tasks, annual, events, weekly, services] = await Promise.all([
    import('../seed/tasks.json'), import('../seed/annual.json'), import('../seed/events.json'), import('../seed/weekly.json'), import('../seed/services.json'),
  ].map((p) => p.then((m) => m.default)));
  const rows = seedRows({tasks, annual, events, weekly, services});
  demo = {log: [], id: 1, logId: 1};
  const now = new Date().toISOString();
  for (const t of TABLES) demo[t] = rows[t].map((r) => ({id: demo.id++, deleted: false, updated_at: now, ...r}));
  return demo;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
function demoLog(table, row, action, before, after, by) {
  demo.log.unshift({id: demo.logId++, table_name: table, row_id: row.id, action, before, after, changed_by: by, changed_at: new Date().toISOString()});
}

/* ---------- 공개 함수 ---------- */
export async function loadAll() {
  if (mode !== 'live') {
    const db = await demoDb();
    const out = {};
    for (const t of TABLES) out[t] = clone(db[t].filter((r) => !r.deleted)).sort((a, b) => (a[ORDER[t]] ?? 0) - (b[ORDER[t]] ?? 0) || a.id - b.id);
    return out;
  }
  const res = await Promise.all(TABLES.map((t) => sb.from(t).select('*').eq('deleted', false).order(ORDER[t], {ascending: true, nullsFirst: false}).order('id')));
  const out = {};
  res.forEach((r, i) => {
    if (r.error) throw new Error(friendly(r.error));
    out[TABLES[i]] = r.data;
  });
  return out;
}

export async function loadLog(limit = 150) {
  if (mode !== 'live') return clone((await demoDb()).log.slice(0, limit));
  const {data, error} = await sb.from('change_log').select('*').order('changed_at', {ascending: false}).limit(limit);
  if (error) throw new Error(friendly(error));
  return data;
}

export async function update(table, id, patch, editor) {
  assertEditable();
  if (mode === 'demo') {
    const db = await demoDb();
    const row = db[table].find((r) => r.id === id);
    if (!row) throw new Error('수정할 항목을 찾지 못했어요.');
    const before = clone(row);
    Object.assign(row, patch, {updated_by: editor, updated_at: new Date().toISOString()});
    const strip = (o) => JSON.stringify({...o, updated_at: 0, updated_by: 0});
    if (strip(before) !== strip(row)) demoLog(table, row, 'update', before, clone(row), editor);
    return clone(row);
  }
  const {data, error} = await sb.from(table).update({...patch, updated_by: editor}).eq('id', id).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function insert(table, row, editor) {
  assertEditable();
  if (mode === 'demo') {
    const db = await demoDb();
    const r = {id: db.id++, deleted: false, updated_at: new Date().toISOString(), ...row, updated_by: editor};
    db[table].push(r);
    demoLog(table, r, 'insert', null, clone(r), editor);
    return clone(r);
  }
  const {data, error} = await sb.from(table).insert({...row, updated_by: editor}).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function renamePerson(oldName, newName, newShort, editor) {
  assertEditable();
  if (mode === 'demo') {
    const db = await demoDb();
    const s = db.staff.find((r) => r.name === oldName);
    if (!s) throw new Error('명단에 없는 이름입니다.');
    const oldShort = s.short;
    await update('staff', s.id, {name: newName, short: newShort}, editor);
    for (const t of db.tasks) {
      const lead = t.lead.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x === oldName ? newName : x)).join(', ');
      let coop = t.coop.split(oldName).join(newName);
      if (oldShort !== oldName) coop = coop.split(oldShort).join(newShort);
      if (lead !== t.lead || coop !== t.coop) await update('tasks', t.id, {lead, coop}, editor);
    }
    for (const w of db.weekly) if (w.person === oldName) await update('weekly', w.id, {person: newName}, editor);
    for (const a of db.annual) if (a.owner.includes(oldName)) await update('annual', a.id, {owner: a.owner.split(oldName).join(newName)}, editor);
    const cols = ['prep', 'sermon', 'praise', 'slide_make', 'slide_run', 'sound', 'broadcast', 'video', 'vehicle', 'etc'];
    for (const s of db.services) {
      const patch = {};
      for (const c of cols) if ((s[c] || '').includes(oldName)) patch[c] = s[c].split(oldName).join(newName);
      if (Object.keys(patch).length) await update('services', s.id, patch, editor);
    }
    return;
  }
  const {error} = await sb.rpc('rename_person', {old_name: oldName, new_name: newName, new_short: newShort, editor});
  if (error) throw new Error(friendly(error));
}

// 다른 사람이 고치면 알려 줌. onStatus('live' | 'offline')
export function subscribe(onChange, onStatus) {
  if (mode !== 'live') { onStatus?.(mode); return () => {}; }
  const ch = sb.channel('duty-board')
    .on('postgres_changes', {event: '*', schema: 'public'}, (p) => onChange(p.table))
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'offline' : 'connecting'));
  return () => sb.removeChannel(ch);
}
