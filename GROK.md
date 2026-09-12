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

## 캘린더

Google Calendar는 별도 자동 동기화 흐름이 `public.calendar_events`를 갱신한다. Google Calendar 원본을 GitHub에 커밋하지 않는다.

## 보안

- Supabase service-role key, `SUBIN_ASSISTANT_KEY`, GitHub token, 비밀번호를 public GitHub에 절대 커밋하지 않는다.
- 사용자에게 secret을 다시 보여줄 필요가 없으면 출력하지 않는다.
- public 저장소에 개인정보, 회사 내부자료, 개인 일정 원문을 넣지 않는다.
- 사용자 요청 없이 데이터를 삭제하거나 전체 초기화하지 않는다.
