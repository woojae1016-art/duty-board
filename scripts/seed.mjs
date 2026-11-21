// 엑셀에서 옮긴 처음 데이터를 Supabase에 한 번 넣습니다.
// 사용: npm run seed   (.env.local 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 필요)
// 이미 업무가 들어 있으면 아무것도 하지 않습니다 (두 번 실행해도 중복되지 않음).
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {seedRows} from '../src/seedmap.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {...process.env};
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다 (.env.local 확인).'); process.exit(1); }

const sb = createClient(url, key, {auth: {persistSession: false}});
const read = (n) => JSON.parse(readFileSync(join(root, 'seed', n + '.json'), 'utf8'));
const rows = seedRows({tasks: read('tasks'), annual: read('annual'), events: read('events'), weekly: read('weekly'), services: read('services')});

const {count, error: cErr} = await sb.from('tasks').select('id', {count: 'exact', head: true});
if (cErr) { console.error('Supabase에 연결하지 못했습니다:', cErr.message, '\n→ schema.sql 을 SQL Editor에서 먼저 실행했는지 확인하세요.'); process.exit(1); }
if (count > 0) { console.log(`이미 업무 ${count}건이 들어 있어 넣지 않았습니다.`); process.exit(0); }

for (const table of ['staff', 'tasks', 'weekly', 'services', 'annual', 'events']) {
  const list = rows[table];
  for (let i = 0; i < list.length; i += 100) {
    const {error} = await sb.from(table).insert(list.slice(i, i + 100));
    if (error) { console.error(`${table} 넣기 실패:`, error.message); process.exit(1); }
  }
  console.log(`${table}: ${list.length}건`);
}
console.log('완료');
