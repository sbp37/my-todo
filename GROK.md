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
- 작업 수: 안 묶인 의뢰서 + 묶음 수(묶음 = 1, 안의 의뢰서가 전부 끝나야 완료). 오늘 목표는 작업 수 기준으로 "오늘 아침 남은 작업 ÷ 남은 제작일". 밀린 건 다음 날에 한꺼번에 얹지 않고 남은 날에 나눠 담는다(이월 의뢰서는 추천 순서만 앞으로).
- "오늘 못 하면 내일 N건": 지금 남은 걸 내일 남는 제작일로 나눈 값. 하루 필요량 칸은 오늘 아침 기준으로 고정하고, 오늘 몫을 채우면 초록 줄 + "✓ 오늘 완료".
- 오늘 시간표: 시즌 `settings.work`(기본 출근 8:00 · 퇴근 17:00 · 점심 12~13시). 마지막으로 끝낸 시각부터 퇴근까지(점심 제외)를 오늘 남은 건수로 똑같이 나눠 "지금 하는 건 남은 N분"을 보여준다. 30초마다 다시 그린다.
- 야근: 시즌 `settings.overtime`({date,start,end}, 오늘 날짜만 유효). 오늘 목표는 정규 근무 기준 그대로, 야근 중에는 야근 시작부터 끝까지를 남은 건수로 새로 나눈다. 퇴근~야근 시작 사이는 쉼으로 계산에서 뺀다. 목표를 다 했으면 보너스 타임(더 한 만큼 내일 목표가 줄어듦).
- 걸린 시간은 기본으로 완료 시각으로 센다: 그날 바로 앞에 끝낸 것(없으면 출근)부터 근무 분(점심·쉼 제외).
- ⏱ 타이머(원할 때만): 지금 이거부터·목록·상세에서 ⏱를 누르면 `tracker_sessions`에 시작을 남기고, 그 의뢰서를 ✓ 완료하면 자동으로 멈춰 `focus_sec`에 저장(점심·쉼 겹친 시간은 뺌). 일시정지는 없고 "끄기"는 기록을 지운다. 타이머로 잰 건 기록에 "⏱ N분"으로 나온다.
- 하루 마무리: 퇴근(야근이면 야근 끝) 뒤 오늘 화면의 시간표 자리에 "오늘 N건 완료 · 건당 M분 · 내일 목표 K건" + 오늘 타임라인.
- 완료 예상일: 최근 제작일(오늘 빼고 최대 5일, 첫 완료일부터) 하루 평균 작업 수로 남은 작업을 이어 담아 본 날짜. 오늘 몫을 다 했거나 퇴근 뒤면 오늘도 평균에 넣는다. 시즌 탭 위·하루 마무리에 보인다.
- 🧩 비슷한 것끼리: 썸네일의 "FG 참고자료" 칸 그림을 잘라 비교해 같은 그림 쓰는 카드를 옆에 붙인다.
- 컨셉 색은 시즌 `settings.concept_colors`(설정에서 선택), 없으면 컨셉 이름 키워드(클로버=초록, 런드리=주황, 장미·러블리=분홍…)로 정한다. 컨셉 순서는 `tracker_concepts.sort`(설정 ▲▼).
- 맥 폴더 이름은 한글이 NFD로 들어오므로 이름·코드는 NFC로 맞춰 비교한다.
- `.ai` 원본과 썸네일은 GitHub에 커밋하지 않는다.

## 캘린더

Google Calendar는 별도 자동 동기화 흐름이 `public.calendar_events`를 갱신한다. Google Calendar 원본을 GitHub에 커밋하지 않는다.

## 보안

- Supabase service-role key, `SUBIN_ASSISTANT_KEY`, GitHub token, 비밀번호를 public GitHub에 절대 커밋하지 않는다.
- 사용자에게 secret을 다시 보여줄 필요가 없으면 출력하지 않는다.
- public 저장소에 개인정보, 회사 내부자료, 개인 일정 원문을 넣지 않는다.
- 사용자 요청 없이 데이터를 삭제하거나 전체 초기화하지 않는다.
