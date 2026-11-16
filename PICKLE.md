# PICKLE.md — 부동산 탭에 글 올리는 방법 (에이전트용)

피클(또는 다른 에이전트)이 조사한 내용을 SUBIN ASSISTANT의 🏠 부동산 탭에 올릴 때 읽는 문서다.
GitHub 저장소를 고치지 않는다. 아래 API로만 올린다.

## 연결

- 주소: `https://ctthdtsbjjqovtmhrzzj.supabase.co/functions/v1/assistant-api`
- 헤더: `x-assistant-key: <에이전트 키>` (`pk_`로 시작. 이 문서나 저장소에는 적지 않는다. 에이전트의 비밀 설정에만 넣는다)
- 올릴 때: `POST`, `content-type: application/json`, 본문에 `action`
- 응답: 성공 `200 {"ok":true,…}`, 잘못된 요청 `400 {"error":"이유"}`, 키 오류 `401`

```bash
curl -sS "$API?resource=re_agent" -H "x-assistant-key: $PICKLE_KEY"
```

## 지켜야 할 것

1. **출처 링크와 날짜는 필수다.** 모든 항목에 `source_url`(https)과 `date`(`YYYY-MM-DD`, 그 내용을 확인한 날)를 넣는다. 없으면 서버가 400으로 거절한다.
2. **덮어쓰지 않는다.** 신문과 소식은 쌓이기만 한다. 고칠 게 있으면 새 글로 올린다. 지우는 건 사이트 주인만 할 수 있다.
3. **기존 조사 단지는 고칠 수 없다.** 기존 단지에는 `re_news_add`로 소식만 붙인다. 새로 추가한 단지(`pk-…`)만 `re_complex_put`으로 고칠 수 있고, 이전 내용은 기록으로 남는다.
4. 올린 글에는 사이트에서 "피클 추가" 뱃지가 붙는다.
5. **접속을 막아 둔 사이트를 우회해서 긁지 않는다.** 네이버부동산·호갱노노·당근부동산은 자동 수집을 막고 있다. 정상적으로 열람할 수 있는 범위에서 확인한 내용만 올리고, 확인하지 못한 값은 지어내지 않는다. 실거래가는 국토부 실거래가 공개시스템이 기준이다.
6. 추측과 사실을 구분해서 쓴다. 호가는 "호가", 실거래는 "실거래"로 적고 면적(㎡)을 같이 적는다.
7. 같은 날 같은 제목의 글을 다시 보내면 중복으로 보고 넣지 않는다(`duplicate`). 다시 시도해도 안전하다.

## 0. 올리기 전에 읽기 — `GET ?resource=re_agent`

단지 id, 쓸 수 있는 분류, 최근에 올린 글을 돌려준다. 단지 id는 반드시 여기서 확인한다.

```json
{
  "today": "2026-11-16",
  "complexes": [{ "id": "dandae-prugio", "name": "단대푸르지오", "gu": "성남 수정구", "dong": "단대동", "area": 59, "added_by": null }],
  "brief_categories": ["policy", "loan", "market", "subscription", "deal", "etc"],
  "news_kinds": ["ask", "listings", "trade", "catalyst", "risk", "review", "floorplan", "etc"],
  "recent_briefs": [], "recent_news": []
}
```

전체 내용(단지 설명, 내 관심 매수가 등)이 필요하면 `GET ?resource=realestate`.

## 1. 오늘의 부동산 신문 — `re_brief_add`

하루에 한 번, 그날 알아야 할 것을 1~20개 항목으로 올린다. 사이트 첫 화면 맨 위에 보인다.

```json
{
  "action": "re_brief_add",
  "date": "2026-11-17",
  "title": "11월 17일 부동산 신문",
  "lead": "오늘의 한 줄 요약 (선택, 400자까지)",
  "items": [
    {
      "category": "policy",
      "title": "토허제 연장 여부 12월 결론",
      "body": "무슨 일이고, 내 매수 계획에 어떤 영향이 있는지 2~4문장.",
      "source_url": "https://…",
      "source_name": "뉴스핌 (11월 13일)",
      "complex_id": "dandae-prugio"
    }
  ]
}
```

| `category` | 화면 표시 | 넣을 내용 |
|---|---|---|
| `policy` | 정책 | 토허제, 세금, 규제, 공급 대책 |
| `loan` | 대출 | 주담대 한도·금리, DSR, 정책 대출 |
| `market` | 시장 | 주간 시세, 거래량, 전세, 입주 물량 |
| `subscription` | 청약·줍줍 | 무순위·잔여 세대, 청약 일정 |
| `deal` | 급매 | 관심 단지의 눈에 띄는 급매 |
| `etc` | 기타 | 그 밖의 것 |

- `title` 120자, `body` 1,200자까지. `complex_id`는 특정 단지 이야기일 때만 넣는다(선택).
- 사이트 주인의 조건(예산·일정·선호 지역)은 `GET ?resource=realestate`의 `seed.docs`(`budget`, `plan`, `rules`)에 있다. 그 조건에 영향이 있는 소식을 먼저 싣는다. 이 조건을 저장소나 다른 곳에 옮겨 적지 않는다.

## 2. 단지별 소식 — `re_news_add`

단지 화면의 "최근 소식"에 쌓인다. 한 번에 1~30건.

```json
{
  "action": "re_news_add",
  "items": [
    {
      "complex_id": "dandae-prugio",
      "date": "2026-11-17",
      "kind": "ask",
      "title": "59㎡ 최저 호가 3천만 하락",
      "body": "105동 중층 남향, 올수리. 7월 입주 가능 매물.",
      "source_url": "https://…",
      "source_name": "네이버부동산",
      "area": 59,
      "ask": 12.3,
      "ask_prev": 12.6,
      "listings": 14,
      "links": [{ "label": "평면도", "url": "https://…" }]
    }
  ]
}
```

| `kind` | 화면 표시 | 같이 넣으면 좋은 값 |
|---|---|---|
| `ask` | 호가 | `ask`(지금 최저 호가, 억), `ask_prev`(이전 호가, 억), `area` |
| `listings` | 매물 수 | `listings`(건), `area` |
| `trade` | 실거래 | 제목·본문에 거래가·층·계약일, `area` |
| `catalyst` | 호재 | 교통, 정비사업, 개발 계획 |
| `risk` | 악재 | 입주 물량, 규제, 하자, 소송 |
| `review` | 실거주 평가 | 주민 후기 요약(출처 필수) |
| `floorplan` | 평면도 | `links`에 평면도·사진 주소 |
| `etc` | 기타 | |

- 가격은 **억 단위 숫자**다(12억 3천만 → `12.3`). `ask`와 `ask_prev`를 같이 넣으면 화면에 ▲▼가 표시된다.
- 평면도·사진은 이미지를 올리지 않고 `links`에 주소로 넣는다(최대 5개, `label` 30자).
- `ask`·`listings`를 넣은 최신 소식은 단지 화면의 "최근 호가", "매물 수" 칸과 비교 화면에도 쓰인다.

## 3. 새 단지 추가·수정 — `re_complex_put`

목록에 없는 단지를 찾았을 때. `id`를 빼고 보내면 새 id(`pk-…`)가 만들어지고, 받은 id를 넣어 다시 보내면 그 단지가 고쳐진다.
이미 있는 단지 이름이면 400으로 거절하고 기존 id를 알려 준다.

```json
{
  "action": "re_complex_put",
  "complex": {
    "name": "○○아파트",
    "region": "서울",
    "gu": "강동구",
    "dong": "천호동",
    "kind": "apt",
    "area": 59,
    "built": 2012,
    "hh": 820,
    "price": 11.8,
    "range": "11.5~12.1억",
    "st": "천호역(5·8호선)",
    "walk": 6,
    "cm": [28, 1, null, null, 12, 0, null, null],
    "one": "한 줄 평 (140자까지)",
    "cat": ["호재"], "pros": ["장점"], "cons": ["단점"], "tips": ["주민 정보"], "checks": ["계약 전 확인할 것"],
    "source_url": "https://…",
    "date": "2026-11-17"
  }
}
```

- 필수: `name`, `region`(`서울`·`경기`·`인천`), `gu`, `dong`, `one`, `source_url`, `date`.
- `kind`: `apt`(아파트)·`jusang`(주상복합)·`presale`(분양권·입주권). `price`는 최근 실거래(억).
- `cm`은 통근 시간 8칸이다: `[역삼 최소시간(분), 환승 수, 역삼 최소환승 경로(분), 환승 수, 잠실 최소시간(분), 환승 수, 잠실 최소환승 경로(분), 환승 수]`. 최소환승 경로가 따로 없으면 그 두 칸은 `null`. 도보 포함, 환승은 2회까지만 본다.
- 목록 5개(`cat`·`pros`·`cons`·`tips`·`checks`)는 각각 8개, 한 줄 200자까지.
- 어떤 단지를 넣고 빼는지는 `seed.docs.rules`와 `seed.docs.agentGuide`의 기준을 따른다.

## 실거래는 올리지 않아도 된다

국토부 실거래가는 사이트가 공식 API로 6시간마다 자동으로 받는다(`GET ?resource=realestate`의 `trades`).
피클은 자동으로 받을 수 없는 것에 집중한다: **호가(`ask`), 매물 수(`listings`), 청약·줍줍 일정(`subscription`), 호재·악재, 실거주 후기.**
특히 호가와 매물 수는 단지 카드와 비교 화면에 바로 보이므로, 관심 단지는 주 1~2회 `kind: "ask"`와 `kind: "listings"`로 숫자를 함께 올린다.
청약·줍줍은 신문(`re_brief_add`)의 `subscription` 분류로 올리면 첫 화면 "청약 · 줍줍" 칸에 2주 동안 따로 모여 보인다.

## 할 수 없는 것

- 올린 글 지우기, 기존 조사 단지 내용 고치기, 사이트 주인의 메모·비교 목록·자금 계산 값 바꾸기.
- 지워야 할 글이 있으면 사이트 주인에게 알린다(주인이 화면의 "지우기"로 지운다).
