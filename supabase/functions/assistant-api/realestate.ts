// 부동산 탭 — assistant-api 안에서 resource=realestate / action=re_* 를 처리한다.
// index.ts의 인증(x-assistant-key)을 통과한 뒤 service-role 클라이언트(db)로만 호출된다.
// 비공개 Storage 버킷 re-data:
//   seed.json  — 조사 내용(단지·시장 요약·계획·일정). 개인 조사 내용이라 저장소에 두지 않고, 관리용 키로 re_seed_put 해서 올린다.
//   user.json  — 내가 고친 값(메모·관심 매수가·별표·상태·링크·내가 본 매물·임장 기록, 전체 메모·비교 목록·자금 계산 값)
//   agent.json — 에이전트(피클 등)가 올린 신문·단지별 소식·새 단지. 쌓기만 하고, 지우는 건 주인 키만 된다.
//   pin.json   — 가족 키 비밀번호를 틀린 횟수(lock.ts)
//   trades.json, config.json — 국토부 실거래 수집 결과와 인증키(rt.ts)
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 're-data'
const SEED_FILE = 'seed.json'
const SEED_BACKUP = 'seed.prev.json'
const USER_FILE = 'user.json'
const AGENT_FILE = 'agent.json'
const LINK_KEYS = ['naver', 'hogang', 'plan', 'road']
const STATUSES = ['top', 'watch', 'dip', 'hold', 'out', 'presale']
export const BRIEF_CATEGORIES = ['policy', 'loan', 'market', 'subscription', 'deal', 'etc']
export const NEWS_KINDS = ['ask', 'listings', 'trade', 'catalyst', 'risk', 'review', 'floorplan', 'etc']
const REGIONS = ['서울', '경기', '인천']
const KINDS = ['apt', 'jusang', 'presale']
const MAX_BRIEFS = 400, MAX_NEWS = 3000, MAX_COMPLEXES = 200

const VISIT_RATES = ['slope', 'parking', 'noise', 'shops', 'manage', 'home', 'overall']
const CALC_KEYS = ['cash', 'loan', 'price', 'repair', 'rate', 'years', 'etc', 'card']

export type Role = 'owner' | 'agent' | 'maint'
type Row = Record<string, unknown>
type Seed = { version: number; complexes: Row[]; docs: Row }
type UserState = { complexes: Record<string, Row>; note?: string; note_at?: string; compare?: string[]; calc?: Row; updated_at?: string }
type AgentState = { briefs: Row[]; news: Row[]; complexes: Row[]; updated_at?: string }

// 잘못된 요청은 index.ts가 400으로 돌려준다.
class BadRequest extends Error {
  constructor(message: string) { super(message); this.name = 'BadRequest' }
}

/* ---------- 저장 ---------- */
export async function readJson(db: SupabaseClient, file: string): Promise<Row | null> {
  const { data, error } = await db.storage.from(BUCKET).download(file)
  if (error || !data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

export async function writeJson(db: SupabaseClient, file: string, value: unknown) {
  const put = () => db.storage.from(BUCKET).upload(file, new Blob([JSON.stringify(value)], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '0' })
  let { error } = await put()
  if (error) {
    // 버킷이 아직 없으면 만들고 한 번 더
    const made = await db.storage.createBucket(BUCKET, { public: false })
    if (made.error && !/exist/i.test(made.error.message)) throw new Error(made.error.message)
    ;({ error } = await put())
  }
  if (error) throw new Error(error.message)
}

// 조사 내용은 Storage에서 읽고 1분 동안 기억해 둔다. 읽지 못하면 직전에 읽은 것을 쓴다.
const EMPTY_SEED: Seed = { version: 0, complexes: [], docs: {} }
let seedCache: { at: number; seed: Seed } | null = null
async function loadSeed(db: SupabaseClient, fresh = false): Promise<Seed> {
  if (!fresh && seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed
  const parsed = await readJson(db, SEED_FILE)
  if (parsed && Array.isArray(parsed.complexes)) {
    seedCache = { at: Date.now(), seed: parsed as Seed }
    return seedCache.seed
  }
  return seedCache?.seed ?? EMPTY_SEED
}

async function readUser(db: SupabaseClient): Promise<UserState> {
  const parsed = (await readJson(db, USER_FILE)) || {}
  const complexes = parsed.complexes
  // 모르는 값도 그대로 들고 있다가 다시 쓴다(다른 action이 넣은 값을 지우지 않게).
  return { ...parsed, complexes: complexes && typeof complexes === 'object' ? complexes as Record<string, Row> : {} } as UserState
}

async function readAgent(db: SupabaseClient): Promise<AgentState> {
  const parsed = await readJson(db, AGENT_FILE)
  const list = (v: unknown) => Array.isArray(v) ? v as Row[] : []
  return { briefs: list(parsed?.briefs), news: list(parsed?.news), complexes: list(parsed?.complexes), updated_at: parsed?.updated_at as string | undefined }
}

/* ---------- 검사 ---------- */
const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

function text(v: unknown, max: number, label: string, required = true) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) { if (required) throw new BadRequest(`${label} is required`); return '' }
  if (s.length > max) throw new BadRequest(`${label} is too long (max ${max} characters)`)
  return s
}
function httpsUrl(v: unknown, label: string, required = true) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) { if (required) throw new BadRequest(`${label} is required (the https link you got this from)`); return '' }
  if (!/^https:\/\/[^\s<>"']+$/.test(s) || s.length > 600) throw new BadRequest(`${label} must be an https URL`)
  return s
}
function isoDate(v: unknown, label: string) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new BadRequest(`${label} is required as YYYY-MM-DD`)
  const today = seoulToday()
  if (s > addDays(today, 1)) throw new BadRequest(`${label} is in the future`)
  if (s < addDays(today, -400)) throw new BadRequest(`${label} is more than 400 days old`)
  return s
}
function num(v: unknown, label: string, min: number, max: number) {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`${label} must be a number between ${min} and ${max}`)
  return n
}
function pick(v: unknown, allowed: string[], label: string, fallback?: string) {
  if ((v === undefined || v === null || v === '') && fallback) return fallback
  if (typeof v !== 'string' || !allowed.includes(v)) throw new BadRequest(`${label} must be one of: ${allowed.join(', ')}`)
  return v
}
function textList(v: unknown, label: string, maxItems = 8, maxLen = 200) {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new BadRequest(`${label} must be a list of strings`)
  if (v.length > maxItems) throw new BadRequest(`${label} has too many items (max ${maxItems})`)
  return v.map((x, i) => text(x, maxLen, `${label}[${i}]`))
}
// 누가 올렸는지 표시(뱃지). 모르는 값은 pickle로 본다.
const byOf = (v: unknown) => v === 'claude' ? 'claude' : 'pickle'
const knownComplex = (seed: Seed, agent: AgentState, id: unknown) => typeof id === 'string' && (seed.complexes.some(c => c.id === id) || agent.complexes.some(c => c.id === id))

function cleanPatch(patch: Row) {
  const out: Row = {}
  if ('memo' in patch) out.memo = String(patch.memo ?? '').slice(0, 4000)
  if ('target' in patch) {
    const n = patch.target === null || patch.target === '' ? null : Number(patch.target)
    if (n !== null && !(Number.isFinite(n) && n > 0 && n < 100)) throw new BadRequest('target must be a price in 억')
    out.target = n
  }
  if ('star' in patch) out.star = !!patch.star
  if ('status' in patch) {
    if (patch.status !== null && !STATUSES.includes(String(patch.status))) throw new BadRequest('unknown status')
    out.status = patch.status
  }
  if ('links' in patch) {
    const links: Record<string, string> = {}
    const src = (patch.links && typeof patch.links === 'object' ? patch.links : {}) as Row
    for (const k of LINK_KEYS) {
      const v = httpsUrl(src[k], `links.${k}`, false)
      if (v) links[k] = v
    }
    out.links = links
  }
  if ('listings' in patch) out.listings = cleanListings(patch.listings)
  if ('visit' in patch) out.visit = cleanVisit(patch.visit)
  return out
}

// 과거 날짜 제한 없이 형식만 본다(내가 적는 기록용).
function plainDate(v: unknown, label: string) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new BadRequest(`${label} must be YYYY-MM-DD`)
  return s
}

// 내가 직접 확인한 매물. 통째로 바꿔 쓴다(화면이 목록을 들고 있다).
function cleanListings(v: unknown): Row[] {
  if (v === null || v === undefined) return []
  if (!Array.isArray(v) || v.length > 30) throw new BadRequest('listings must be a list of up to 30')
  return (v as Row[]).map((it, i) => {
    const p = `listings[${i}]`
    const price = num(it?.price, `${p}.price`, 0.5, 200)
    if (price === undefined) throw new BadRequest(`${p}.price is required (억)`)
    const out: Row = { id: typeof it.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(it.id) ? it.id : `l_${crypto.randomUUID().slice(0, 8)}`, price }
    const date = plainDate(it.date, `${p}.date`)
    if (date) out.date = date
    const area = num(it.area, `${p}.area`, 10, 300)
    if (area !== undefined) out.area = area
    for (const [k, max] of [['where', 40], ['state', 80], ['agent', 80], ['note', 400]] as [string, number][]) {
      const s = text(it[k], max, `${p}.${k}`, false)
      if (s) out[k] = s
    }
    const url = httpsUrl(it.url, `${p}.url`, false)
    if (url) out.url = url
    if (it.gone) out.gone = true
    return out
  })
}

// 임장 기록: 직접 가서 느낀 것. 점수는 1~5.
function cleanVisit(v: unknown): Row | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object') throw new BadRequest('visit must be an object')
  const src = v as Row, out: Row = {}
  const date = plainDate(src.date, 'visit.date')
  if (date) out.date = date
  const walk = num(src.walk, 'visit.walk', 0, 90)
  if (walk !== undefined) out.walk = walk
  const rate: Record<string, number> = {}
  const given = (src.rate && typeof src.rate === 'object' ? src.rate : {}) as Row
  for (const k of VISIT_RATES) {
    const n = num(given[k], `visit.rate.${k}`, 1, 5)
    if (n !== undefined) rate[k] = Math.round(n)
  }
  if (Object.keys(rate).length) out.rate = rate
  const note = text(src.note, 4000, 'visit.note', false)
  if (note) out.note = note
  return Object.keys(out).length ? out : null
}

/* ---------- 에이전트가 올리는 것 ---------- */
function cleanBrief(seed: Seed, agent: AgentState, body: Row): Row {
  const date = isoDate(body.date, 'date')
  const raw = Array.isArray(body.items) ? body.items as Row[] : []
  if (!raw.length || raw.length > 20) throw new BadRequest('items must have 1 to 20 entries')
  const items = raw.map((it, i) => {
    const out: Row = {
      category: pick(it?.category, BRIEF_CATEGORIES, `items[${i}].category`),
      title: text(it?.title, 120, `items[${i}].title`),
      body: text(it?.body, 1200, `items[${i}].body`),
      source_url: httpsUrl(it?.source_url, `items[${i}].source_url`),
    }
    const name = text(it?.source_name, 60, `items[${i}].source_name`, false)
    if (name) out.source_name = name
    if (it?.complex_id) {
      if (!knownComplex(seed, agent, it.complex_id)) throw new BadRequest(`items[${i}].complex_id is not a known complex`)
      out.complex_id = it.complex_id
    }
    return out
  })
  const brief: Row = { id: `b_${crypto.randomUUID()}`, date, title: text(body.title, 80, 'title', false) || `${date} 부동산 신문`, by: byOf(body.by), created_at: new Date().toISOString(), items }
  const lead = text(body.lead, 400, 'lead', false)
  if (lead) brief.lead = lead
  return brief
}

function cleanNews(seed: Seed, agent: AgentState, it: Row, i: number, by: string): Row {
  const p = `items[${i}]`
  if (!knownComplex(seed, agent, it?.complex_id)) throw new BadRequest(`${p}.complex_id is not a known complex (GET ?resource=re_agent lists the ids)`)
  const out: Row = {
    id: `n_${crypto.randomUUID()}`,
    complex_id: it.complex_id,
    date: isoDate(it.date, `${p}.date`),
    kind: pick(it.kind, NEWS_KINDS, `${p}.kind`),
    title: text(it.title, 120, `${p}.title`),
    source_url: httpsUrl(it.source_url, `${p}.source_url`),
    by,
    created_at: new Date().toISOString(),
  }
  const body = text(it.body, 1200, `${p}.body`, false)
  if (body) out.body = body
  const name = text(it.source_name, 60, `${p}.source_name`, false)
  if (name) out.source_name = name
  for (const [k, min, max] of [['ask', 0.5, 200], ['ask_prev', 0.5, 200], ['listings', 0, 5000], ['area', 10, 300]] as [string, number, number][]) {
    const n = num(it[k], `${p}.${k}`, min, max)
    if (n !== undefined) out[k] = k === 'listings' ? Math.round(n) : n
  }
  if (it.links !== undefined) {
    if (!Array.isArray(it.links) || it.links.length > 5) throw new BadRequest(`${p}.links must be a list of up to 5 {label, url}`)
    out.links = (it.links as Row[]).map((l, n) => ({ label: text(l?.label, 30, `${p}.links[${n}].label`), url: httpsUrl(l?.url, `${p}.links[${n}].url`) }))
  }
  return out
}

function cleanComplex(seed: Seed, agent: AgentState, c: Row, by: string): Row {
  const name = text(c.name, 60, 'complex.name')
  let id = typeof c.id === 'string' ? c.id.trim() : ''
  if (id) {
    if (!/^pk-[a-z0-9-]{3,40}$/.test(id)) throw new BadRequest('complex.id must look like pk-abc123 (omit it to get a new one)')
  } else {
    id = `pk-${crypto.randomUUID().slice(0, 8)}`
  }
  const sameName = (x: { name?: unknown }) => typeof x.name === 'string' && x.name.replace(/\s/g, '') === name.replace(/\s/g, '')
  const inSeed = seed.complexes.find(sameName as (x: unknown) => boolean) as { id: string } | undefined
  if (inSeed) throw new BadRequest(`this complex already exists as "${inSeed.id}". Add news to it with re_news_add instead`)
  const twin = agent.complexes.find(x => sameName(x) && x.id !== id)
  if (twin) throw new BadRequest(`this complex already exists as "${twin.id}". Send that id to update it`)
  const out: Row = {
    id, name,
    region: pick(c.region, REGIONS, 'complex.region'),
    gu: text(c.gu, 30, 'complex.gu'),
    dong: text(c.dong, 30, 'complex.dong'),
    kind: pick(c.kind, KINDS, 'complex.kind', 'apt'),
    area: num(c.area, 'complex.area', 10, 300) ?? 59,
    status: 'watch',
    one: text(c.one, 140, 'complex.one'),
    cat: textList(c.cat, 'complex.cat'), pros: textList(c.pros, 'complex.pros'), cons: textList(c.cons, 'complex.cons'),
    tips: textList(c.tips, 'complex.tips'), checks: textList(c.checks, 'complex.checks'),
    source_url: httpsUrl(c.source_url, 'complex.source_url'),
    date: isoDate(c.date, 'complex.date'),
    by, agent: true,
  }
  for (const [k, from, min, max] of [['built', 'built', 1960, 2035], ['hh', 'hh', 1, 20000], ['p26', 'price', 0.5, 200], ['walk', 'walk', 0, 60]] as [string, string, number, number][]) {
    const n = num(c[from], `complex.${from}`, min, max)
    if (n !== undefined) out[k] = n
  }
  for (const [k, max] of [['range', 80], ['st', 60]] as [string, number][]) {
    const s = text(c[k], max, `complex.${k}`, false)
    if (s) out[k] = s
  }
  if (c.cm !== undefined && c.cm !== null) {
    // [역삼 최소시간, 환승, 역삼 최소환승, 환승, 잠실 최소시간, 환승, 잠실 최소환승, 환승]
    if (!Array.isArray(c.cm) || c.cm.length !== 8) throw new BadRequest('complex.cm must have 8 entries (see PICKLE.md)')
    const cm = (c.cm as unknown[]).map((v, i) => v === null ? null : num(v, `complex.cm[${i}]`, 0, 300) ?? null)
    if (cm[0] === null || cm[1] === null || cm[4] === null || cm[5] === null) throw new BadRequest('complex.cm needs the fastest route for both stations (entries 0, 1, 4, 5)')
    out.cm = cm
  }
  return out
}

/* ---------- 읽기 ---------- */
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// 올라가 있는 조사 데이터가 원본과 같은지 확인하는 용도. 건수와 해시만 돌려주므로 인증 없이 열어 둔다.
export async function realestateVersion(db: SupabaseClient) {
  const seed = await loadSeed(db, true)
  return { version: seed.version, complexes: seed.complexes.length, sha256: await sha256Hex(JSON.stringify(seed)) }
}

// locked: 가족 키로 비밀번호 없이 보는 중. 개인 기록(메모·본 매물·임장 기록·자금 계산)은 빼고 준다.
export async function realestateGet(db: SupabaseClient, locked = false) {
  const [seed, user, agent] = await Promise.all([loadSeed(db), readUser(db), readAgent(db)])
  let mine: UserState = user
  if (locked) {
    const complexes: Record<string, Row> = {}
    for (const [id, c] of Object.entries(user.complexes)) {
      const { memo: _m, listings: _l, visit: _v, ...rest } = c
      complexes[id] = rest
    }
    mine = { complexes, compare: user.compare, updated_at: user.updated_at }
  }
  return { realestate: true, seed: seed.version ? seed : null, user: mine, agent }
}

// 실거래 수집(rt.ts)이 쓰는 단지 목록. rt: { code: 시군구 코드, seq: 국토부 단지 일련번호들, names: 이름에 들어가는 말 }
export async function rtTargets(db: SupabaseClient) {
  const [seed, agent] = await Promise.all([loadSeed(db), readAgent(db)])
  return [...seed.complexes, ...agent.complexes].map(c => ({ id: c.id, name: c.name, gu: c.gu, dong: c.dong, area: c.area, kind: c.kind, rt: c.rt }))
}

// 에이전트가 글을 올리기 전에 읽는 안내: 단지 id, 쓸 수 있는 분류, 최근에 올린 것.
export async function realestateAgentGet(db: SupabaseClient) {
  const [seed, agent] = await Promise.all([loadSeed(db), readAgent(db)])
  const row = (c: Row) => ({ id: c.id, name: c.name, gu: c.gu, dong: c.dong, area: c.area, added_by: c.by ?? null })
  return {
    today: seoulToday(),
    complexes: [...seed.complexes.map(row), ...agent.complexes.map(row)],
    brief_categories: BRIEF_CATEGORIES,
    news_kinds: NEWS_KINDS,
    recent_briefs: agent.briefs.slice(-7).map(b => ({ date: b.date, title: b.title, by: b.by })),
    recent_news: agent.news.slice(-20).map(n => ({ complex_id: n.complex_id, date: n.date, kind: n.kind, title: n.title })),
  }
}

// 조사 내용 통째로 바꾸기(관리용). 모양이 맞는지 보고, 직전 것은 seed.prev.json에 남긴다.
function cleanSeed(v: unknown): Seed {
  const s = (v && typeof v === 'object' ? v : {}) as Row
  if (!Number.isInteger(s.version) || (s.version as number) < 1) throw new BadRequest('seed.version must be a positive integer')
  const list = Array.isArray(s.complexes) ? s.complexes as Row[] : []
  if (!list.length || list.length > 300) throw new BadRequest('seed.complexes must have 1 to 300 entries')
  const ids = new Set<string>()
  list.forEach((c, i) => {
    const id = c?.id
    if (typeof id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(id) || id.startsWith('pk-')) throw new BadRequest(`seed.complexes[${i}].id is not valid`)
    if (ids.has(id)) throw new BadRequest(`seed.complexes has a duplicate id: ${id}`)
    ids.add(id)
    for (const k of ['name', 'region', 'gu', 'dong', 'one']) if (typeof c[k] !== 'string' || !c[k]) throw new BadRequest(`seed.complexes[${i}].${k} is required`)
    if (typeof c.area !== 'number') throw new BadRequest(`seed.complexes[${i}].area must be a number`)
  })
  const d = (s.docs && typeof s.docs === 'object' ? s.docs : {}) as Row
  for (const k of ['market', 'rules', 'timeline', 'presale', 'limits']) if (!Array.isArray(d[k])) throw new BadRequest(`seed.docs.${k} must be a list`)
  if (typeof d.asOf !== 'string' || !Array.isArray((d.budget as Row | undefined)?.lines)) throw new BadRequest('seed.docs.asOf and seed.docs.budget.lines are required')
  return { version: s.version as number, complexes: list, docs: d }
}

/* ---------- 쓰기 ---------- */
// action이 re_* 가 아니면 null을 돌려준다.
// deno-lint-ignore no-explicit-any
export async function realestatePost(db: SupabaseClient, body: any, role: Role = 'owner'): Promise<Row | null> {
  const action = body?.action
  if (typeof action !== 'string' || !action.startsWith('re_')) return null

  if (action === 're_seed_put') {
    if (role !== 'maint' && role !== 'owner') throw new BadRequest('not allowed')
    const next = cleanSeed(body.seed)
    const raw = JSON.stringify(next)
    if (raw.length > 600_000) throw new BadRequest('seed is too large')
    const prev = await readJson(db, SEED_FILE)
    if (prev) await writeJson(db, SEED_BACKUP, prev)
    await writeJson(db, SEED_FILE, next)
    seedCache = { at: Date.now(), seed: next }
    return { ok: true, version: next.version, complexes: next.complexes.length, sha256: await sha256Hex(raw) }
  }
  if (role === 'maint') throw new BadRequest('not allowed')

  const seed = await loadSeed(db)

  // 단지와 상관없는 내 기록: 전체 메모, 비교할 단지, 자금 계산 값. 주인(또는 비밀번호를 푼 가족)만 쓴다.
  if (action === 're_my_put') {
    if (role !== 'owner') throw new BadRequest('only the site owner can change this')
    const user = await readUser(db)
    if ('note' in body) {
      const note = typeof body.note === 'string' ? body.note : ''
      if (note.length > 20000) throw new BadRequest('note is too long (max 20000 characters)')
      user.note = note
      user.note_at = new Date().toISOString()
    }
    if ('compare' in body) {
      const ids: unknown[] = Array.isArray(body.compare) ? body.compare : []
      if (ids.length > 4) throw new BadRequest('compare takes up to 4 complexes')
      const agent = await readAgent(db)
      for (const id of ids) if (!knownComplex(seed, agent, id)) throw new BadRequest('unknown complex id in compare')
      user.compare = [...new Set(ids as string[])]
    }
    if ('calc' in body) {
      const src = (body.calc && typeof body.calc === 'object' ? body.calc : {}) as Row
      const calc: Row = {}
      for (const k of CALC_KEYS) {
        const n = num(src[k], `calc.${k}`, 0, 100000)
        if (n !== undefined) calc[k] = n
      }
      user.calc = calc
    }
    user.updated_at = new Date().toISOString()
    await writeJson(db, USER_FILE, user)
    return { ok: true, user }
  }

  if (action === 're_patch') {
    const id = body.id
    const agent = await readAgent(db)
    if (!knownComplex(seed, agent, id)) throw new BadRequest('unknown complex id')
    const patch = cleanPatch(body.patch && typeof body.patch === 'object' ? body.patch : {})
    const user = await readUser(db)
    user.complexes[id] = { ...(user.complexes[id] || {}), ...patch }
    user.updated_at = new Date().toISOString()
    await writeJson(db, USER_FILE, user)
    return { ok: true, user }
  }

  if (action === 're_brief_add') {
    const agent = await readAgent(db)
    const brief = cleanBrief(seed, agent, body)
    const sig = (b: Row) => `${b.date}|${((b.items as Row[]) || []).map(i => i.title).join('|')}`
    if (agent.briefs.some(b => sig(b) === sig(brief))) return { ok: true, duplicate: true }
    agent.briefs = [...agent.briefs, brief].slice(-MAX_BRIEFS)
    agent.updated_at = new Date().toISOString()
    await writeJson(db, AGENT_FILE, agent)
    return { ok: true, id: brief.id }
  }

  if (action === 're_news_add') {
    const agent = await readAgent(db)
    const raw: Row[] = Array.isArray(body.items) ? body.items : [body]
    if (!raw.length || raw.length > 30) throw new BadRequest('items must have 1 to 30 entries')
    const by = byOf(body.by)
    const cleaned = raw.map((it, i) => cleanNews(seed, agent, it, i, by))
    const sig = (n: Row) => `${n.complex_id}|${n.date}|${n.kind}|${n.title}`
    const seen = new Set(agent.news.map(sig))
    const fresh = cleaned.filter(n => { const s = sig(n); if (seen.has(s)) return false; seen.add(s); return true })
    if (fresh.length) {
      agent.news = [...agent.news, ...fresh].slice(-MAX_NEWS)
      agent.updated_at = new Date().toISOString()
      await writeJson(db, AGENT_FILE, agent)
    }
    return { ok: true, added: fresh.length, duplicates: cleaned.length - fresh.length, ids: fresh.map(n => n.id) }
  }

  if (action === 're_complex_put') {
    const agent = await readAgent(db)
    const next = cleanComplex(seed, agent, body.complex && typeof body.complex === 'object' ? body.complex : {}, byOf(body.by))
    const now = new Date().toISOString()
    const at = agent.complexes.findIndex(c => c.id === next.id)
    if (at >= 0) {
      // 고칠 때는 이전 내용을 history에 남긴다(최근 5개).
      const { history, ...prev } = agent.complexes[at] as Row & { history?: Row[] }
      agent.complexes[at] = { ...next, created_at: prev.created_at, updated_at: now, history: [...(history || []), prev].slice(-5) }
    } else {
      if (agent.complexes.length >= MAX_COMPLEXES) throw new BadRequest(`too many added complexes (max ${MAX_COMPLEXES})`)
      agent.complexes.push({ ...next, created_at: now })
    }
    agent.updated_at = now
    await writeJson(db, AGENT_FILE, agent)
    return { ok: true, id: next.id, updated: at >= 0 }
  }

  if (action === 're_agent_delete') {
    // 쌓기만 하는 원칙을 지키려고, 지우는 건 사이트 주인 키로만 된다.
    if (role !== 'owner') throw new BadRequest('only the site owner can delete added items')
    const agent = await readAgent(db)
    const id = body.id
    if (typeof id !== 'string') throw new BadRequest('id is required')
    if (body.type === 'brief') agent.briefs = agent.briefs.filter(b => b.id !== id)
    else if (body.type === 'news') agent.news = agent.news.filter(n => n.id !== id)
    else if (body.type === 'complex') {
      agent.complexes = agent.complexes.filter(c => c.id !== id)
      agent.news = agent.news.filter(n => n.complex_id !== id)
    } else throw new BadRequest('type must be brief, news or complex')
    agent.updated_at = new Date().toISOString()
    await writeJson(db, AGENT_FILE, agent)
    return { ok: true, agent }
  }

  throw new BadRequest('unknown realestate action')
}
