// 데이터베이스 열 이름 ↔ 화면에서 쓰는 한글 이름

export const TABLE_LABEL = {
  tasks: '업무', staff: '교역자 명단', weekly: '주간 일정', services: '예배별 담당', annual: '연간 업무', events: '교회 일정',
};

export const TASK_FIELDS = [
  ['title', '세부 업무'], ['category', '부서'], ['subcategory', '중분류'], ['schedule', '주기·시기'],
  ['lead', '주담당'], ['coop', '협력'], ['status', '상태'], ['kind', '주기 구분'], ['note', '비고'], ['no', 'No'],
];
export const SERVICE_FIELDS = [
  ['prep', '준비·세팅'], ['sermon', '설교'], ['praise', '찬양인도'], ['slide_make', '자막 제작'], ['slide_run', '자막 넘기기'],
  ['sound', '음향'], ['broadcast', '방송 보조'], ['video', '영상 편집'], ['vehicle', '차량운행'], ['etc', '기타'],
];
export const DAY_FIELDS = [['sun', '주일'], ['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금'], ['sat', '토']];

export const FIELD_LABEL = {
  tasks: Object.fromEntries(TASK_FIELDS),
  services: {name: '예배', sort: '순서', ...Object.fromEntries(SERVICE_FIELDS)},
  weekly: {person: '교역자', sort: '순서', ...Object.fromEntries(DAY_FIELDS)},
  annual: {dept: '부서', task: '업무', owner: '담당', months: '달별 내용', sort: '순서'},
  events: {month: '달', label: '일정', expected: '예상 여부', sort: '순서'},
  staff: {name: '이름', short: '짧은 이름', sort: '순서'},
};
export const COMMON_LABEL = {deleted: '숨김'};

// 화면용(한글 키) 객체로 바꾸기
export const viewTask = (r) => ({
  id: r.id, 'No': r.no, '카테고리': r.category, '중분류': r.subcategory, '세부 업무': r.title, '주기·시기': r.schedule,
  '주담당': r.lead, '협력': r.coop, '상태': r.status, '비고': r.note, '주기 구분': r.kind,
});
export const viewWeekly = (r) => {
  const o = {id: r.id, '교역자': r.person};
  for (const [col, ko] of DAY_FIELDS) o[ko] = r[col] || '';
  return o;
};
export const viewService = (r) => {
  const o = {id: r.id, '예배': r.name};
  for (const [col, ko] of SERVICE_FIELDS) o[ko] = r[col] || '';
  return o;
};
export const viewAnnual = (r) => ({id: r.id, '부서': r.dept, '업무': r.task, '담당': r.owner, ...(r.months || {})});
export const viewEvent = (r) => ({id: r.id, '월': r.month, '일정': r.label, '구분': r.expected ? '예상' : '확정'});

// 한 줄 요약(변경 기록에서 어떤 행인지 보여 줄 때)
export function rowTitle(table, r) {
  if (!r) return '';
  switch (table) {
    case 'tasks': return r.title;
    case 'staff': return r.name;
    case 'weekly': return r.person;
    case 'services': return r.name;
    case 'annual': return r.task;
    case 'events': return `${r.month} ${r.label}`;
    default: return '';
  }
}
