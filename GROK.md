# SUBIN ASSISTANT 작업 규칙

이 저장소는 사용자의 개인 업무 비서 사이트와 연결된 코드 저장소다.

## 핵심 구조

- 사이트: https://subin-assistant.vercel.app
- GitHub 저장소: `sbp37/my-todo`
- 기본 브랜치: `main`
- 업무 데이터 저장소: Supabase 프로젝트 `subin-assistant`
- Supabase project ref: `ctthdtsbjjqovtmhrzzj`
- 업무 데이터는 GitHub JSON 파일에 새로 쌓지 않는다.

## 역할 구분

### 1. 사이트 UI/기능 수정
사용자가 화면, 버튼, 달력, 탭, 정렬, 디자인, 동작 수정 등을 요청하면 GitHub의 현재 코드를 먼저 읽고 기존 구조를 유지한 채 필요한 부분만 수정한다.

절대 하지 말 것:
- 현재 사이트를 새 프로젝트로 대체
- 기존 정상 기능을 편의상 제거
- 업무/개발/개인 데이터 초기화
- 민감한 일정이나 할 일을 public GitHub 파일에 직접 기록

### 2. 할 일/일정 등록
사용자가 대화 중 다음처럼 말하면 Supabase `public.tasks`에 반영한다.

예:
- `이거 해야 돼`
- `금요일까지`
- `나중에 해야 돼`
- `이거 완료`
- `개발 일정으로 넣어`

분류:
- `work`: 회사 업무
- `dev`: 개인 앱/게임 개발
- `personal`: 개인 일정, 약속, 생활 할 일

주요 필드:
- `external_id`
- `title`
- `category`
- `due_date`
- `end_date`
- `priority`
- `urgent`
- `status`
- `estimate_min`
- `note`
- `next_action`
- `source`
- `source_ref`

상태:
- `todo`
- `doing`
- `waiting`
- `done`
- `later`

규칙:
- 날짜를 말하지 않았으면 임의로 만들지 말고 `due_date = null`
- `오늘`이면 한국 시간 기준 오늘 날짜
- `급함`, `오늘 꼭`, 마감 임박이면 `urgent = true`
- 완료했다고 말하면 행을 삭제하지 말고 `status='done'`, `completed_at` 기록
- 같은 의미의 기존 할 일이 있으면 중복 생성하지 말고 기존 행을 갱신
- `source='grok'` 사용

## 캘린더
Google Calendar 원본 일정은 별도 동기화 흐름으로 관리한다. GitHub에 개인 캘린더 원문을 상시 저장하지 않는다.

## 수정 전 체크
1. 현재 main 코드 읽기
2. 기존 사이트 동작 보존
3. 사용자가 지정한 부분만 수정
4. 모바일 화면 확인
5. 데이터 초기화/중복 여부 확인

## 보안
- Supabase service-role key, GitHub token, 비밀번호를 코드나 채팅에 노출하지 않는다.
- public 저장소에 개인정보, 회사 내부자료, 개인 일정 원문을 직접 커밋하지 않는다.
- Supabase 접근은 연결된 Supabase 도구/보안된 서버 경로를 사용한다.
