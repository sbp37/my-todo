// 가족 공유용 잠금 — 가족 키로는 부동산만 볼 수 있고, 비밀번호가 맞으면 나머지도 열린다.
// 키·비밀번호의 해시는 index.ts에만 있다(저장소에 두지 않는다).
// 연달아 틀리면 잠시 막아서 네 자리 숫자를 차례로 넣어 보는 것을 어렵게 한다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { readJson, writeJson } from './realestate.ts'

const FILE = 'pin.json'
const MAX_FAILS = 5
const BLOCK_MIN = 10

export type PinResult = { ok: boolean; state: 'ok' | 'wrong' | 'blocked'; minutes?: number; left?: number }

// pinHash: 받은 비밀번호의 해시, expected: 맞는 비밀번호의 해시
export async function checkPin(db: SupabaseClient, pinHash: string, expected: string): Promise<PinResult> {
  const saved = (await readJson(db, FILE)) || {}
  const now = Date.now()
  const until = Number(saved.until) || 0
  let fails = Number(saved.fails) || 0
  // 막힌 동안에는 맞는 비밀번호도 받지 않는다.
  if (until > now) return { ok: false, state: 'blocked', minutes: Math.ceil((until - now) / 60000) }
  if (pinHash === expected) {
    if (fails || until) await writeJson(db, FILE, { fails: 0, until: 0 })
    return { ok: true, state: 'ok' }
  }
  fails += 1
  if (fails >= MAX_FAILS) {
    await writeJson(db, FILE, { fails: 0, until: now + BLOCK_MIN * 60000 })
    return { ok: false, state: 'blocked', minutes: BLOCK_MIN }
  }
  await writeJson(db, FILE, { fails, until: 0 })
  return { ok: false, state: 'wrong', left: MAX_FAILS - fails }
}
