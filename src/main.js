import './style.css';
import * as db from './data.js';
import * as app from './app.js';
import * as editor from './editor.js';
import {h, toast} from './util.js';

const liveEl = document.getElementById('live-status');
const liveText = document.getElementById('live-text');
function setLive(stateName) {
  liveEl.dataset.state = stateName;
  liveText.textContent = {live: '실시간 연결됨', offline: '연결 끊김 · 새로 고침 필요', demo: '예시 모드', view: '보기 전용', connecting: '연결 중'}[stateName] || '연결 중';
}

function paintEditor(name) {
  const btn = document.getElementById('editor-btn');
  document.getElementById('editor-name').textContent = name ? `수정자: ${name}` : '이름 정하기';
  btn.classList.toggle('is-empty', !name);
}

editor.initEditor({
  raw: () => app.rawData(),
  months: () => app.allMonths(),
  refresh: () => app.refreshAll(),
  onEditor: paintEditor,
});
paintEditor(editor.getEditor());
document.getElementById('editor-btn').addEventListener('click', () => editor.askEditorName());

document.documentElement.dataset.mode = db.mode;
app.setupStatic();
document.getElementById('demo-banner').hidden = db.mode !== 'demo';

async function start() {
  const errBox = document.getElementById('load-error');
  try {
    await app.refreshAll();
  } catch (e) {
    errBox.replaceChildren(h('span', null, `데이터를 불러오지 못했어요. ${e.message} `), h('button', {type: 'button', class: 'nb-btn nb-btn-sm', onclick: () => { errBox.hidden = true; start(); }}, '다시 시도'));
    errBox.hidden = false;
    return;
  }
  // 다른 사람이 고치면 잠시 뒤 다시 불러옴
  let timer;
  db.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await app.refreshAll(); await app.loadHistory(); } catch (e) { toast(e.message, {bad: true}); }
    }, 350);
  }, setLive);
}
start();

// 탭을 다시 보면 최신으로
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && db.mode === 'live') app.refreshAll().catch(() => {});
});
