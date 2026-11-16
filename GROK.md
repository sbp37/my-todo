# SUBIN ASSISTANT 작업 규칙

이 저장소는 사용자의 개인 업무 비서 사이트와 연결된 코드 저장소다.

## 핵심 구조

- 사이트: `https://subin-assistant.vercel.app`
- Vercel 프로젝트: `subin-assistant`
- GitHub 저장소: `sbp37/my-todo`
- 사이트 소스 폴더: `subin-assistant-site/`
- 기본 브랜치: `main`
- 업무 데이터: Supabase 프로젝트 `subin-assistant`
- Supabase project ref: `ctthdtsbjjqovtmhrzzj`
- 공용 작업 API: `https://ctthdtsbjjqovtmhrzzj.supabase.co/functions/v1/assistant-api`
- 인증 헤더: `x-assistant-key`
- 실제 키 값은 공개 저장소에 적지 말고 Grok의 비공개 secret/environment 값 `SUBIN_ASSISTANT_KEY`로 보관한다.
- 회사 업무, 개인 일정, Google Calendar 원문을 GitHub JSON에 저장하지 않는다.

## 할 일 등록·수정

사용자가 `이거 해야 돼`, `금요일까지`, `나중에`, `완료`, `개발 일정으로 넣어` 같은 말을 하면 공용 API로 Supabase `public.tasks`를 갱신한다.

분류:
- `work`: 회사 업무
- `dev`: 개인 앱/게임 개발
- `personal`: 개인 일정, 약속, 생활 할 일

상태:
- `todo`
- `doing`
- `waiting`
- `done`
- `later`

주요 필드:
- `external_id`, `title`, `category`
- `due_date`, `end_date`
- `priority`, `urgent`, `status`
- `estimate_min`, `emoji`, `note`, `next_action`
- `source`, `source_ref`, `completed_at`

규칙:
- 날짜를 말하지 않았으면 `due_date = null`
- `오늘`이면 Asia/Seoul 기준 오늘 날짜
- `급함`, `오늘 꼭`, 마감 임박이면 `urgent = true`
- 완료는 삭제하지 말고 `status='done'`으로 갱신
- 같은 의미의 기존 일이 있으면 중복 생성하지 말고 기존 행 갱신
- Grok이 만든/수정한 일은 `source='grok'`

### API 읽기

`GET /assistant-api?resource=tasks`

`GET /assistant-api?resource=calendar`

모든 요청에 `x-assistant-key: <SUBIN_ASSISTANT_KEY>` 헤더를 넣는다.

### API 쓰기 예시

새 할 일 또는 기존 external_id 갱신:

```json
{
  "action": "upsert_task",
  "task": {
    "external_id": "고유하고-안정적인-id",
    "title": "할 일 제목",
    "category": "work",
    "due_date": null,
    "priority": 100,
    "urgent": false,
    "status": "todo",
    "source": "grok"
  }
}
```

부분 수정:

```json
{
  "action": "update_task",
  "external_id": "기존-id",
  "patch": {"due_date": "2026-09-15", "urgent": true}
}
```

완료/완료취소:

```json
{"action":"complete_task","external_id":"기존-id","done":true}
```

순서 변경:

```json
{"action":"reorder","category":"dev","ordered_ids":["id1","id2","id3"]}
```

## 사이트 UI/기능 수정

현재 라이브 코드의 기준 사본은 `subin-assistant-site/`의 `index.html`, `style.css`, `app-base.js`, `app-render.js`다. 사용자가 화면, 달력, 탭, 버튼, 정렬, 디자인, 동작 수정을 요청하면 이 폴더와 현재 라이브 사이트를 먼저 확인하고 기존 디자인과 정상 기능을 유지한 채 요청 부분만 바꾼다. 저장소 루트의 오래된 `index.html`로 사이트를 교체하지 않는다.

현재 사이트는 Supabase 공용 API를 읽으며 완료 체크, 날짜 변경, 오늘 하기, 순서 변경도 DB에 저장한다. 민감한 데이터나 API secret을 코드에 하드코딩하지 않는다.

Vercel과 GitHub는 자동 배포 링크가 설정되어 있지 않을 수 있다. GitHub만 수정해 놓고 사이트까지 반영됐다고 말하지 않는다. Vercel 접근 권한이 있으면 같은 `subin-assistant` 프로젝트 production에 실제 배포하고 `https://subin-assistant.vercel.app`에서 확인한다. Vercel 접근 권한이 없으면 커밋까지만 하고 배포 대기라고 명확히 말한다.

## 🎯 의뢰서 마감 트래커

- 기획: `sbp37/mytodo` 저장소 README. 사이트 헤더의 🎯 버튼 또는 `/#tracker`로 연다.
- 코드: `subin-assistant-site/tracker.js`, `tracker.css` (기존 파일은 헤더 버튼·로드 태그만 수정)
- 트래커 버튼에는 `data-done` 같은 기존 앱 속성을 쓰지 않는다 (`app-render.js`가 문서 전체의 `[data-done]`에 클릭을 묶는다). 트래커는 `data-tdone` 등을 쓴다.
- DB: `tracker_seasons`, `tracker_concepts`, `tracker_items`, `tracker_sessions`, `tracker_days` (스키마는 `supabase/migrations/`), 썸네일은 비공개 Storage 버킷 `tracker-thumbs`
- API: 기존 `assistant-api`에 `GET ?resource=tracker`, `POST action=tracker_upsert|tracker_delete|tracker_thumb` 추가. 트래커 로직은 `supabase/functions/assistant-api/tracker.ts`. 배포된 `index.ts`는 인증 해시가 있어서 저장소에 두지 않는다.
- 폴더째 올리면 폴더 이름이 컨셉이 된다. 같은 시즌에 같은 품목 코드가 있으면 새 버전으로 갱신한다(중복 생성 안 함).
- 갤러리 순서는 `tracker_items.sort_order`(드래그), 난이도 칸은 `difficulty`(S 쉬움 / M 중간 / L 어려움). 정렬은 SortableJS(cdnjs)로 한다.
- 묶음(`tracker_groups`, `tracker_items.group_id`): 같은 참고 자료를 쓰는 의뢰서. 난이도 칸 안에서 묶인 카드는 그 묶음의 첫 카드 자리에 한 줄(묶음 줄)로 모인다. 1건 이하가 되면 자동으로 풀린다. 묶인 의뢰서는 "지금 이거부터"에서 연달아 추천한다.
- ⭐ 우선순위 칸: `tracker_items.pinned_at`이 있는 미완료 의뢰서. 난이도는 그대로 두고 칸만 맨 위로, 그 칸의 순서대로 "지금 이거부터"·오늘 목록 맨 앞에 들어간다(목표를 넘어도).
- 컨셉별 마감: 시즌 `settings.concept_deadlines[컨셉id]`(설정 컨셉 줄의 날짜 칸, 비우면 시즌 마감). 제작 마감은 컨셉 마감에도 같은 검수 여유일을 적용. 마감이 여러 개면 오늘 목표·하루 필요량·내일 목표는 마감 이른 순으로 "그 마감까지 끝내야 할 양 ÷ 그때까지 남은 제작일" 중 가장 큰 값(묶음은 안의 가장 이른 마감). 추천은 우선순위·이월 다음으로 마감 이른 컨셉 먼저. 작업일은 가장 늦은 제작 마감까지.
- 작업 수: 안 묶인 의뢰서 + 묶음 수(묶음 = 1, 안의 의뢰서가 전부 끝나야 완료). 오늘 목표는 작업 수 기준으로 "오늘 아침 남은 작업 ÷ 남은 제작일". 밀린 건 다음 날에 한꺼번에 얹지 않고 남은 날에 나눠 담는다(이월 의뢰서는 추천 순서만 앞으로).
- "오늘 못 하면 내일 N건": 지금 남은 걸 내일 남는 제작일로 나눈 값. 하루 필요량 칸은 오늘 아침 기준으로 고정하고, 오늘 몫을 채우면 초록 줄 + "✓ 오늘 완료".
- 🕘 오늘 시간표(원형, 12시간 벽시계): 근무 시간(settings.work, 기본 8:00–17:00 · 점심 12–13) 위에 끝낸 것(초록) → 지금 재는 칸(굵은 테두리) → 하루 순서대로 남은 칸. 하루 순서 = 시즌 `settings.day_seq`={date,keys:["t:할일id","u:작업키"…]} (시간표 옆 목록이나 할 일 목록에서 ⠿로 끌어서 정함, 할 일 목록의 🎯 줄을 끌면 오늘 의뢰서들이 한 덩어리로 움직임). 없으면 할 일 목록 순서 + 🎯 자리(옛 day_req, 없으면 맨 뒤). 오늘 할 의뢰서 그림 카드 번호·"지금 이거부터"도 이 순서를 따른다. 칸 길이는 기본값 없이 내가 정한 분만 쓴다: 의뢰서는 시즌 `settings.plan_min[작업 키]`(묶음 g:id, 아니면 의뢰서 id), 할 일은 tasks.estimate_min. 안 정한 칸은 "시간 미정"으로 계산에서 빠진다(옆 목록에서 칸마다 분 입력, "모두 N분씩"). 제목에 시각("3시 회의", "15:30")이 있으면 그 자리에 📌 고정, 1~7시는 오후. 아무것도 안 재는 중이면 남은 칸은 지금부터 이어 붙인다. 가운데에 예상 끝 시각, 퇴근을 넘는 칸은 빨강 + "야근 +N분". 30초마다 다시 그린다.
- ▶ 시작 / ■ 종료: 옆 목록 칸마다. 의뢰서는 정한 분으로 타이머(tracker_sessions, 안 정했으면 고르기 창, 실제 흐른 시간으로 잼 — 점심시간에 일해도 흐름), 할 일은 시즌 `settings.todo_run`={id,start,date}(시작 기록 `todo_starts`). 재는 칸은 시작한 때부터 정한 분, 넘기면 지금까지 늘어나 뒤 칸이 밀린다. 시간이 되면 알림. ■ 종료 = 완료(의뢰서 칸이 묶음이면 묶음 전체), ⏸ 멈춤 = 완료 없이 멈춤.
- 야근: 시즌 `settings.overtime`({date,start,end}, 오늘 날짜만 유효). 오늘 목표는 정규 근무 기준 그대로, 야근 중에는 야근 끝까지로 여유를 계산한다. 퇴근~야근 시작 사이는 쉼으로 계산에서 뺀다. 목표를 다 했으면 보너스 타임(더 한 만큼 내일 목표가 줄어듦).
- 걸린 시간은 기본으로 완료 시각으로 센다: 그날 바로 앞에 끝낸 것(없으면 출근)부터 근무 분(점심·쉼 제외).
- ⏱ 타이머(원할 때만): 카드의 ⏱를 누르면 "몇 분 안에?"를 고른다(15/20/30/45/60분·직접, 시간표에 정한 분 → 없으면 지난번 고른 시간이 골라져 있음, 고르면 그 칸 분도 같이 저장). 목표 분은 시즌 `settings.timer_goals[세션 id]`, 마지막 고른 분은 `settings.timer_last`. 카운트다운 → 0이 되면 소리·브라우저 알림·토스트 한 번, 그 뒤로는 빨간 "+초과". ✓ 완료하면 자동으로 멈춰 `tracker_sessions.focus_sec`에 저장(실제 흐른 시간), "+5분"은 목표 연장, "■ 멈춤"은 완료 없이 기록만. 타이머가 켜져 있으면 시간표(여유) 카드 대신 타이머 카드가 맨 위에 나온다.
- 📝 오늘 할 일: 트래커 오늘 탭에서 적지만 저장은 비서 `public.tasks`(external_id `trk-날짜-…`, category work, due_date 오늘, source `tracker`, 줄에 적은 "30분/1시간"은 estimate_min). 그래서 메인 "오늘 꼭 할 일"·Grok에도 보인다. 오늘 날짜인 다른 할 일(Grok이 넣은 것 등)도 같이 나온다. 하루 처음 열면 "☀️ 오늘 시작" 카드(한 줄에 하나, ⌘Enter로 시작) → 시즌 `settings.day_start`에 오늘 날짜를 남기고 체크리스트 카드로 바뀐다. ×는 지우지 않고 due_date만 비운다. 지난 2주 안의 못 한 `trk-` 할 일은 "못 한 거 가져오기"로 오늘로 옮긴다. 남은 할 일 시간은 ⏳ 여유에서 뺀다.
- 오늘 할 의뢰서·오늘 완료는 큰 그림 카드(추천 순서 번호, 아래쪽 ⏱·완료 버튼, − + 로 크기 조절 `tzoom`).
- 하루 마무리: 퇴근(야근이면 야근 끝) 뒤 오늘 화면의 시간표 자리에 "오늘 N건 완료 · 건당 M분 · 내일 목표 K건" + 오늘 타임라인.
- 완료 예상일: 최근 제작일(오늘 빼고 최대 5일, 첫 완료일부터) 하루 평균 작업 수로 남은 작업을 이어 담아 본 날짜. 오늘 몫을 다 했거나 퇴근 뒤면 오늘도 평균에 넣는다. 시즌 탭 위·하루 마무리에 보인다.
- 🧩 비슷한 것끼리: 썸네일의 "FG 참고자료" 칸 그림을 잘라 비교해 같은 그림 쓰는 카드를 옆에 붙인다.
- 컨셉 색은 시즌 `settings.concept_colors`(설정에서 선택), 없으면 컨셉 이름 키워드(클로버=초록, 런드리=주황, 장미·러블리=분홍…)로 정한다. 컨셉 순서는 `tracker_concepts.sort`(설정 ▲▼).
- 맥 폴더 이름은 한글이 NFD로 들어오므로 이름·코드는 NFC로 맞춰 비교한다.
- `.ai` 원본과 썸네일은 GitHub에 커밋하지 않는다.

## 🏠 부동산 탭

- 사이트를 열면 항상 이 탭부터 보인다. 하위 화면: 요약(오늘의 부동산 신문·시장·내 예산) / 신문 / 단지(정렬·필터) / 단지 상세 / 비교(최대 4곳) / 계획(단계별 할 일·토허제·추가 비용·자금 계산기·주의점·팁·시장 일정·내 메모) / 분양권·기준.
- 코드: `subin-assistant-site/realestate.js`, `realestate.css`, `lock.js` (기존 파일은 탭 버튼·로드 태그·`render()` 분기·`pinHeader`만 수정). 로드 순서는 `app-base.js` → `lock.js` → `realestate.js` → `app-render.js`.
- 버튼 속성은 `data-re-*`만 쓴다. 상태 표시 클래스는 `s-top`처럼 `s-`를 붙인다(`style.css`의 `.top`은 상단 헤더라 겹치면 깨진다).
- 서버 로직: `supabase/functions/assistant-api/realestate.ts`, `lock.ts`. 데이터는 비공개 Storage 버킷 `re-data`의 JSON 파일이다(버킷은 첫 저장 때 만든다).
  - `seed.json` — 조사 내용(단지·시장 요약·계획·일정). 예산·관심 단지가 드러나는 개인 조사 내용이라 **저장소에 커밋하지 않는다.** 고칠 때는 관리용 키로 `POST action=re_seed_put {seed}` 한다(직전 내용은 `seed.prev.json`에 남는다). 함수를 다시 배포할 필요가 없다.
  - `user.json` — 내가 고친 값. 단지별 `memo`, `target`(억), `star`, `status`, `links`, `listings`(내가 본 매물), `visit`(임장 기록) + 전체 `note`, `compare`, `calc`.
  - `agent.json` — 에이전트(피클)가 올린 신문·단지 소식·새 단지. 쌓기만 하고 지우는 건 주인만 된다.
  - `pin.json` — 가족 비밀번호 틀린 횟수.
  - `trades.json` — 국토부 실거래 자동 수집 결과(단지별, 기준 면적 ±3㎡, 최근 24개월). `config.json` — 공공데이터포털 인증키(저장소에 두지 않는다).
- 국토부 실거래 자동 수집: `supabase/functions/assistant-api/rt.ts`. "아파트 매매 실거래가 상세 자료" API(`RTMSDataSvcAptTradeDev`)를 쓴다.
  - 부동산 화면을 열 때 마지막 수집이 6시간보다 오래됐으면 서버가 뒤에서 최근 3개월을 다시 받는다(예약 작업 없음). 실패하면 10분 동안 다시 시도하지 않는다.
  - 단지는 조사 내용의 `rt: {code: 시군구 코드, seq: [국토부 단지 일련번호(aptSeq)], names?: [이름 일부]}`로 찾는다. 여러 단지를 묶은 항목은 `seq` 첫 번째가 대표 단지다. `rt`가 없는 단지(피클이 추가한 단지)는 구 이름과 단지 이름·동이 같은 거래를 찾는다.
  - 화면의 "최근 가격"은 최근 3개월(없으면 6개월) 대표 단지 거래의 중앙값이다. 취소·직거래는 뺀다. 이미 모으던 단지에 새로 나타난 거래는 `seen`(수집한 날)이 붙어 7일 동안 "새 실거래"로 보인다.
  - 바로 받기: `POST action=re_trades_sync` (지난 달을 채울 때는 관리용 키로 `months: ["202601", …]`(4개까지), `quiet: true`). 인증키 넣기: 관리용 키로 `action=re_config_put {data_go_kr_key}`.
  - 분양권·입주권은 수집 대상이 아니다.
- API: `GET ?resource=realestate` → `{seed, user, agent}`. `POST action=re_patch {id, patch}`, `re_my_put {note?, compare?, calc?}`, `re_brief_add`, `re_news_add`, `re_complex_put`, `re_agent_delete`. 에이전트용 설명은 `PICKLE.md`.
- `GET ?resource=re_version`은 인증 없이 `{version, complexes, sha256}`만 돌려준다. `re_seed_put` 뒤 `sha256`이 올린 내용의 `JSON.stringify` 해시와 같은지로 확인한다.
- 키는 네 가지이고 해시만 `index.ts`(배포본에만 있음)에 둔다.
  - 주인 키: 전부 가능.
  - 에이전트 키(`pk_…`): 주인과 같되 올린 글 지우기(`re_agent_delete`)와 `re_my_put`은 안 된다.
  - 가족 키(`fam_…`): 부동산 읽기만 된다. 이때 서버가 개인 기록(메모·본 매물·임장 기록·자금 계산 값)을 빼고 준다. `x-assistant-pin` 헤더의 비밀번호가 맞으면 주인과 같아진다(5번 틀리면 10분 막힘). 공유 주소는 `https://subin-assistant.vercel.app/#key=<가족 키>`.
  - 관리용 키(`mt_…`): `re_seed_put`, `re_config_put`, `re_trades_sync`만 된다.
- 단지 필드: `cm`은 `[역삼 최소시간, 환승, 역삼 최소환승, 환승, 잠실 최소시간, 환승, 잠실 최소환승, 환승]`(없으면 null), 가격은 억 단위(`p24` 2024년 하반기 중앙값, `p26` 최근 실거래 중앙값, `peak` 2021년 고점, `target` 관심 매수가 제안값), `status`는 `top|watch|dip|hold|out|presale`. `p26`의 기준 기간은 `docs.priceBasis`에 적고 화면에 그대로 보여준다.
- 평면도·사진은 저작권 때문에 사이트에 넣지 않고 링크로 연다(네이버부동산·호갱노노·평면도 검색·카카오맵). 단지 페이지 주소를 "링크 고치기"에 넣으면 그 주소로 바로 열린다.
- 네이버부동산·호갱노노·당근부동산은 자동 수집을 막아 두었으므로 긁어 오지 않는다. 호가·매물 수는 피클이 `re_news_add`로 올린다.

## 캘린더

Google Calendar는 별도 자동 동기화 흐름이 `public.calendar_events`를 갱신한다. Google Calendar 원본을 GitHub에 커밋하지 않는다.

## 보안

- Supabase service-role key, `SUBIN_ASSISTANT_KEY`, GitHub token, 비밀번호를 public GitHub에 절대 커밋하지 않는다.
- 사용자에게 secret을 다시 보여줄 필요가 없으면 출력하지 않는다.
- public 저장소에 개인정보, 회사 내부자료, 개인 일정 원문을 넣지 않는다.
- 사용자 요청 없이 데이터를 삭제하거나 전체 초기화하지 않는다.
