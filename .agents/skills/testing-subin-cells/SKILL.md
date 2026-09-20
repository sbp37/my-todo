---
name: testing-subin-cells
description: How to run and test the SUBIN CELLS static pixel-office dashboard (subin-cells-site/) locally
---

# Testing SUBIN CELLS (subin-cells-site/)

## Run
- Static site, no build. `cd subin-cells-site && python3 -m http.server <port>`, open `http://localhost:<port>/?demo`.
- `?demo` seeds 10 sample tasks + 2 calendar events, no API key needed. Without `?demo` (and no stored key) the page shows the 🔐 개인 비서 연결 setup card.
- Shares localStorage key `subin-assistant-api-key-v1` with subin-assistant-site; UI prefs in `subin-cells-state-v1` (e.g. `filterCat` dept filter persists across reloads — reset by clicking 전체).

## Gotchas
- Rooms live on a single `<canvas id="plan">` — there are no DOM room cards. Click rooms via canvas hit-test (`planRects`); compute screen coords from the canvas bounding rect + cell grid (CW=110, CH=76, GAP=6, PAD=10, CORR=26 between rows, LOBBY_H=48 strip at bottom).
- The 450ms animation tick (`animTick`) is a global accessible in DevTools console. Screenshots an even number of ticks apart produce identical frames — diff screenshots ~1s apart or an odd-tick delta; the corridor runner moves 7px/tick and is the easiest motion check.
- Demo mutations (✓ 완료, 오늘 하기, 날짜 변경) are in-memory only and get RESET every 60s by the auto-refresh re-seeding `demoData()` — verify stats right after each action.
- Chrome for Testing won't resize below ~532px window width (~500px viewport). For the ≤640px mobile breakpoint that's enough; for true 390px use DevTools device emulation (F12 → Ctrl+Shift+M).
- `roomState()` priority: done→sleep > overdue|urgent→panic > today|doing→type > waiting|later→wait > else coffee. 오늘 하기 flips a later-status room to type.

## Devin Secrets Needed
- None for ?demo. Real API mode needs the assistant connection key (`x-assistant-key` / `subin-assistant-api-key-v1`), which only the user has.
