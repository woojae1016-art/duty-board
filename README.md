# 늘샘교회 교역자 업무분장 웹앱

엑셀 「2026 교역자 공통업무 분장표」를 웹으로 옮긴 것입니다.
링크를 아는 사람은 누구나 보고 고칠 수 있고, 고친 내용은 모든 사람 화면에 바로 반영됩니다.
모든 수정은 '변경 기록' 탭에 남고, 거기서 되돌릴 수 있습니다. 완전 삭제는 막혀 있고 '숨기기'만 됩니다.

- 화면: Hostinger(또는 Vercel 등 아무 정적 호스팅)에 올리는 HTML·JS·CSS 파일
- 데이터: Supabase (무료 요금제로 충분)

## 지금 올라가 있는 곳 (GitHub Pages)
- 주소: https://woojae1016-art.github.io/duty-board/
- 데이터: Supabase 프로젝트 `duty-board` (무료 요금제, 서울). 아래 1~3단계는 이미 끝났습니다.
- 링크를 아는 사람은 누구나 보고 고칠 수 있습니다. 고친 내용은 모든 사람 화면에 바로 반영됩니다.
- 화면 코드를 고쳐서 다시 올릴 때: `npm run deploy` (빌드한 뒤 `gh-pages` 브랜치로 올림, 1~2분 뒤 반영)
- 검색엔진에는 나오지 않도록 `noindex`를 넣어 두었습니다. 다만 저장소가 공개라 주소를 아는 사람은 볼 수 있습니다.
- `public/config.js`를 비우고 빌드하면 보기 전용이 됩니다.

## 처음 한 번 설정

### 1. Supabase 프로젝트 만들기
1. https://supabase.com → GitHub로 로그인 → **New project**
   - Region: **Northeast Asia (Seoul)**
   - Database password: *Generate* 후 따로 보관
2. 왼쪽 **SQL Editor** → **New query** → `supabase/schema.sql` 내용을 전부 붙여 넣고 **Run**
   - 맨 아래 `테이블 준비 완료`가 보이면 성공
3. **Project Settings → API**(또는 상단 **Connect**)에서 두 가지를 복사
   - Project URL (예: `https://abcd1234.supabase.co`)
   - `anon` `public` 키 (또는 `sb_publishable_...` 로 시작하는 Publishable key)
   - ⚠️ `service_role` / `secret` 키는 절대 쓰지 마세요.

### 2. 연결 정보 넣기
`public/config.js`(올린 뒤에는 서버의 `config.js`)에 붙여 넣습니다.

```js
window.DUTY_CONFIG = {
  supabaseUrl: 'https://abcd1234.supabase.co',
  supabaseAnonKey: '복사한 anon 키',
};
```

### 3. 엑셀 데이터 넣기 (한 번만)
`.env.local` 파일에 같은 값을 적고 실행합니다. 이미 데이터가 있으면 아무것도 하지 않습니다.

```
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=복사한 anon 키
```

```bash
npm install
npm run seed
```

### 4. 빌드하고 Hostinger에 올리기
```bash
npm run build
```
`dist` 폴더 안의 파일(`index.html`, `config.js`, `assets/`)을 올립니다.

1. Hostinger **hPanel → 웹사이트 → 파일 관리자**
2. `public_html` 안에 `duty` 같은 폴더를 만들고 들어가기 (도메인 바로 아래에 둘 거면 `public_html` 그대로)
3. `dist` 폴더를 압축한 zip을 **업로드 → 압축 풀기**
4. `https://내도메인/duty/` 로 접속

연결 정보를 바꿀 때는 파일 관리자에서 `config.js`만 고치면 됩니다 (다시 빌드할 필요 없음).

## 알아둘 것
- 링크를 아는 사람은 누구나 고칠 수 있습니다 (요청대로). 실수나 장난으로 바뀐 것은 '변경 기록 → 되돌리기'로 복구합니다.
- Supabase 무료 프로젝트는 오랫동안(약 1주) 아무도 쓰지 않으면 일시정지될 수 있습니다. 그러면 Supabase 대시보드에서 **Restore**를 누르면 됩니다.
- '교역자 명단 관리 → 이름 바꾸기'로 '남자 전도사'를 실제 이름으로 바꾸면 업무표·주간 일정·연간 일정·예배별 담당의 이름이 한꺼번에 바뀝니다.

## 개발
```bash
npm run dev      # http://localhost:5181 (연결 정보가 없으면 예시 모드: 고쳐 볼 수 있지만 저장 안 됨)
npm run build    # 연결 정보 없이 빌드하면 보기 전용
```
- `src/app.js` 화면, `src/editor.js` 수정 창, `src/data.js` 데이터 읽기·쓰기, `supabase/schema.sql` 테이블·권한
- `seed/*.json` 은 엑셀에서 변환한 처음 데이터
