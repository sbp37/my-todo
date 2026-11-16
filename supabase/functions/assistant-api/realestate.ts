// 부동산 탭 — assistant-api 안에서 resource=realestate / action=re_* 를 처리한다.
// index.ts의 인증(x-assistant-key)을 통과한 뒤 service-role 클라이언트(db)로만 호출된다.
// 조사 내용(단지·일정)은 realestate_seed.ts에 있고 배포본에만 둔다(개인 조사 내용이라 저장소에 커밋하지 않는다).
// 내가 고친 값(메모·관심 매수가·별표·링크)만 비공개 Storage 버킷 re-data/user.json에 저장한다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { SEED } from './realestate_seed.ts'

const BUCKET = 're-data'
const USER_FILE = 'user.json'
const LINK_KEYS = ['naver', 'hogang', 'plan', 'road']
const STATUSES = ['top', 'watch', 'dip', 'hold', 'out', 'presale']

type UserState = { complexes: Record<string, Record<string, unknown>>; updated_at?: string }

async function readUser(db: SupabaseClient): Promise<UserState> {
  const { data, error } = await db.storage.from(BUCKET).download(USER_FILE)
  if (error || !data) return { complexes: {} }
  try {
    const parsed = JSON.parse(await data.text())
    return { complexes: parsed?.complexes && typeof parsed.complexes === 'object' ? parsed.complexes : {}, updated_at: parsed?.updated_at }
  } catch {
    return { complexes: {} }
  }
}

async function writeUser(db: SupabaseClient, user: UserState) {
  const put = () => db.storage.from(BUCKET).upload(USER_FILE, new Blob([JSON.stringify(user)], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '0' })
  let { error } = await put()
  if (error) {
    // 버킷이 아직 없으면 만들고 한 번 더
    const made = await db.storage.createBucket(BUCKET, { public: false })
    if (made.error && !/exist/i.test(made.error.message)) throw new Error(made.error.message)
    ;({ error } = await put())
  }
  if (error) throw new Error(error.message)
}

function cleanPatch(patch: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if ('memo' in patch) out.memo = String(patch.memo ?? '').slice(0, 4000)
  if ('target' in patch) {
    const n = patch.target === null || patch.target === '' ? null : Number(patch.target)
    if (n !== null && !(Number.isFinite(n) && n > 0 && n < 100)) throw new Error('target must be a price in 억')
    out.target = n
  }
  if ('star' in patch) out.star = !!patch.star
  if ('status' in patch) {
    if (patch.status !== null && !STATUSES.includes(String(patch.status))) throw new Error('unknown status')
    out.status = patch.status
  }
  if ('links' in patch) {
    const links: Record<string, string> = {}
    const src = (patch.links && typeof patch.links === 'object' ? patch.links : {}) as Record<string, unknown>
    for (const k of LINK_KEYS) {
      const v = String(src[k] ?? '').trim()
      if (!v) continue
      if (!/^https:\/\//.test(v) || v.length > 500) throw new Error('link must be an https URL')
      links[k] = v
    }
    out.links = links
  }
  return out
}

// 배포된 조사 데이터가 원본과 같은지 확인하는 용도. 건수와 해시만 돌려주므로 인증 없이 열어 둔다.
export async function realestateVersion() {
  const bytes = new TextEncoder().encode(JSON.stringify(SEED))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  return { version: SEED.version, complexes: SEED.complexes.length, sha256 }
}

export async function realestateGet(db: SupabaseClient) {
  return { realestate: true, seed: SEED, user: await readUser(db) }
}

// action이 re_* 가 아니면 null을 돌려준다.
// deno-lint-ignore no-explicit-any
export async function realestatePost(db: SupabaseClient, body: any): Promise<Record<string, unknown> | null> {
  const action = body?.action
  if (typeof action !== 'string' || !action.startsWith('re_')) return null

  if (action === 're_patch') {
    const id = body.id
    if (typeof id !== 'string' || !SEED.complexes.some((c: { id: string }) => c.id === id)) throw new Error('unknown complex id')
    const patch = cleanPatch(body.patch && typeof body.patch === 'object' ? body.patch : {})
    const user = await readUser(db)
    user.complexes[id] = { ...(user.complexes[id] || {}), ...patch }
    user.updated_at = new Date().toISOString()
    await writeUser(db, user)
    return { ok: true, user }
  }

  throw new Error('unknown realestate action')
}
