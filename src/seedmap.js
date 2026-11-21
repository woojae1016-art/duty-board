// 엑셀에서 변환한 JSON(seed/*.json)을 Supabase 테이블 형식으로 바꿉니다.
// 앱의 '예시 모드'와 scripts/seed.mjs 가 함께 씁니다.

export const STAFF_SEED = [
  {name: '노주희 목사', short: '노주희', sort: 1},
  {name: '이요셉 전도사', short: '이요셉', sort: 2},
  {name: '오성경 전도사', short: '오성경', sort: 3},
  {name: '권도희 전도사', short: '권도희', sort: 4},
  {name: '남자 전도사', short: '남자 전도사', sort: 5},
  {name: '행정간사', short: '행정간사', sort: 6},
  {name: '담임목사님', short: '담임목사', sort: 7},
];

const SERVICE_COLS = {
  '준비·세팅': 'prep', '설교': 'sermon', '찬양인도': 'praise', '자막 제작': 'slide_make', '자막 넘기기': 'slide_run',
  '음향': 'sound', '방송 보조': 'broadcast', '영상 편집': 'video', '차량운행': 'vehicle', '기타': 'etc',
};
const DAY_COLS = {'주일': 'sun', '월': 'mon', '화': 'tue', '수': 'wed', '목': 'thu', '금': 'fri', '토': 'sat'};

export function seedRows({tasks, annual, events, weekly, services}, by = '엑셀 가져오기') {
  return {
    staff: STAFF_SEED.map((s) => ({...s, updated_by: by})),
    tasks: tasks.map((t) => ({
      no: t['No'],
      category: t['카테고리'],
      subcategory: t['중분류'] || '',
      title: t['세부 업무'],
      schedule: t['주기·시기'] || '',
      lead: t['주담당'] || '',
      coop: t['협력'] || '',
      status: t['상태'] || '미배정',
      note: t['비고'] || '',
      kind: t['주기 구분'] || '정기',
      updated_by: by,
    })),
    weekly: weekly.map((w, i) => {
      const row = {person: w['교역자'], sort: w['교역자'] === '공통·비고' ? 999 : i + 1, updated_by: by};
      for (const [ko, col] of Object.entries(DAY_COLS)) row[col] = w[ko] || '';
      return row;
    }),
    services: services.map((s, i) => {
      const row = {name: s['예배'], sort: i + 1, updated_by: by};
      for (const [ko, col] of Object.entries(SERVICE_COLS)) row[col] = s[ko] || '';
      return row;
    }),
    annual: annual.map((a, i) => {
      const months = {};
      for (const [k, v] of Object.entries(a)) if (/^\d{4}-\d{2}$/.test(k) && v) months[k] = v;
      return {sort: i + 1, dept: a['부서'], task: a['업무'], owner: a['담당'] || '미정', months, updated_by: by};
    }),
    events: events.map((e, i) => ({month: e['월'], label: e['일정'], expected: e['구분'] === '예상', sort: i + 1, updated_by: by})),
  };
}
