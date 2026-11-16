// 국토부 아파트 매매 실거래가(공공데이터포털 "아파트 매매 실거래가 상세 자료") 자동 수집.
// 눈여겨보는 단지의 거래만 골라 비공개 Storage 버킷 re-data의 trades.json에 쌓는다.
//   - 부동산 화면을 열 때 마지막 수집이 6시간보다 오래됐으면 뒤에서 새로 받는다(따로 예약 작업이 없어도 된다).
//   - action=re_trades_sync 로 바로 받을 수도 있다.
// 인증키는 저장소에 두지 않는다: 환경변수 DATA_GO_KR_KEY 또는 Storage의 config.json(action=re_config_put).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { readJson, writeJson, rtTargets } from './realestate.ts'

const FILE = 'trades.json'
const CONFIG = 'config.json'
const API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
const STALE_MS = 6 * 3600_000 // 이보다 오래되면 다시 받는다
const LOCK_MS = 10 * 60_000 // 받는 중 표시가 이보다 오래되면 실패한 것으로 본다
const KEEP_MONTHS = 24
const AREA_BAND = 3 // 단지의 기준 면적 ±3㎡만 모은다
// rt 정보가 없는 단지(에이전트가 추가한 단지)는 구 이름으로 법정동 코드 앞 5자리를 찾는다.
const GU: Record<string, string> = {
  '종로구': '11110', '중구': '11140', '용산구': '11170', '성동구': '11200', '광진구': '11215', '동대문구': '11230', '중랑구': '11260',
  '성북구': '11290', '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380', '서대문구': '11410', '마포구': '11440',
  '양천구': '11470', '강서구': '11500', '구로구': '11530', '금천구': '11545', '영등포구': '11560', '동작구': '11590', '관악구': '11620',
  '서초구': '11650', '강남구': '11680', '송파구': '11710', '강동구': '11740',
  '성남 수정구': '41131', '성남 중원구': '41133', '성남 분당구': '41135', '광명시': '41210', '구리시': '41310', '남양주시': '41360',
  '하남시': '41450', '과천시': '41290', '안양 만안구': '41171', '안양 동안구': '41173', '부천시': '41190',
}

type Row = Record<string, unknown>
// k: 거래 구분 키, d: 계약일, p: 가격(억), a: 전용면적, f: 층,
// n·i: 여러 단지를 묶은 항목일 때 단지 이름과 순번(0이 대표 단지),
// dg: 직거래, x: 취소된 거래, seen: 처음 수집한 날(새 실거래 표시용. 처음 한꺼번에 받은 것은 없음)
type Trade = { k: string; d: string; p: number; a: number; f?: number; n?: string; i?: number; dg?: 1; x?: 1; seen?: string }
type State = { synced_at?: string; syncing_at?: string; error?: string; error_at?: string; by: Record<string, Trade[]> }
type Target = { id: string; name: string; gu: string; dong: string; area: number; kind?: unknown; rt?: { code?: string; seq?: string[]; names?: string[] } }

class BadRequest extends Error {
  constructor(message: string) { super(message); this.name = 'BadRequest' }
}

const seoul = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const norm = (s: string) => s.replace(/[\s()·\-,.]|아파트|단지/g, '').toLowerCase()
function monthsBack(n: number) {
  const [y, m] = seoul().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}` })
}

export async function tradesRead(db: SupabaseClient): Promise<State> {
  const parsed = (await readJson(db, FILE)) || {}
  return { ...parsed, by: parsed.by && typeof parsed.by === 'object' ? parsed.by as Record<string, Trade[]> : {} } as State
}
// 화면에 주는 모양
export const tradesView = (s: State) => ({ by: s.by, synced_at: s.synced_at || null, error: s.error || null })
export const tradesStale = (s: State) => {
  const now = Date.now()
  const fresh = s.synced_at && now - Date.parse(s.synced_at) < STALE_MS
  const busy = s.syncing_at && now - Date.parse(s.syncing_at) < LOCK_MS
  // 실패한 직후에는 10분 동안 다시 시도하지 않는다.
  const failed = s.error_at && now - Date.parse(s.error_at) < LOCK_MS
  return !fresh && !busy && !failed
}

async function apiKey(db: SupabaseClient) {
  const env = Deno.env.get('DATA_GO_KR_KEY')
  if (env) return env
  const cfg = await readJson(db, CONFIG)
  return typeof cfg?.data_go_kr_key === 'string' ? cfg.data_go_kr_key : ''
}

async function fetchMonth(key: string, code: string, ym: string): Promise<Row[]> {
  const items: Row[] = []
  for (let page = 1; page <= 10; page++) {
    const url = `${API}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${code}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000&_type=json`
    let text = ''
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(25_000) })
        text = await res.text()
        break
      } catch (e) {
        if (attempt >= 2) throw e
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
      }
    }
    let body: Row | undefined, code0 = ''
    try {
      const parsed = JSON.parse(text)
      code0 = String(parsed?.response?.header?.resultCode ?? '')
      body = parsed?.response?.body
      if (code0 !== '000') throw new Error(String(parsed?.response?.header?.resultMsg || parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg || 'api error'))
    } catch (e) {
      // 키 오류 등은 XML로 온다.
      const m = text.match(/<returnAuthMsg>([^<]*)<|<errMsg>([^<]*)</)
      throw new Error(m ? (m[1] || m[2]) : e instanceof Error ? e.message : 'bad response')
    }
    const raw = (body?.items as Row | undefined)?.item
    const list: Row[] = Array.isArray(raw) ? raw : raw ? [raw as Row] : []
    items.push(...list)
    if (!list.length || items.length >= Number(body?.totalCount || 0)) break
  }
  return items
}

const codeOf = (t: Target) => t.rt?.code || (t.kind === 'presale' ? '' : GU[t.gu] || '')
// 맞으면 묶음 안의 순번(0부터), 아니면 -1
function matchIndex(t: Target, it: Row) {
  const seq = String(it.aptSeq || ''), name = norm(String(it.aptNm || ''))
  const at = t.rt?.seq ? t.rt.seq.indexOf(seq) : -1
  if (at >= 0) return at
  if (t.rt?.names?.some(n => name.includes(norm(n)))) return 0
  if (t.rt) return -1
  return name === norm(t.name) && String(it.umdNm || '') === t.dong ? 0 : -1
}

// months: 받을 계약 월(YYYYMM). quiet: 처음 한꺼번에 채울 때 "새 실거래"로 표시하지 않는다.
export async function tradesSync(db: SupabaseClient, opts: { months?: string[]; quiet?: boolean } = {}) {
  const state = await tradesRead(db)
  const fail = async (message: string) => {
    const latest = await tradesRead(db)
    await writeJson(db, FILE, { ...latest, syncing_at: undefined, error: message, error_at: new Date().toISOString() })
    return { ok: false, error: message }
  }
  const key = await apiKey(db)
  if (!key) return await fail('data.go.kr key is not set')
  await writeJson(db, FILE, { ...state, syncing_at: new Date().toISOString() })

  const targets = (await rtTargets(db) as Target[]).filter(t => codeOf(t) && typeof t.area === 'number')
  const codes = [...new Set(targets.map(codeOf))]
  const months = opts.months?.length ? opts.months : monthsBack(3)
  const jobs = codes.flatMap(code => months.map(ym => ({ code, ym })))
  const today = seoul()
  let failed = 0, matched = 0, added = 0, cancelled = 0, lastError = ''
  const by: Record<string, Map<string, Trade>> = {}
  const known = new Set(Object.keys(state.by))
  for (const t of targets) by[t.id] = new Map((state.by[t.id] || []).map(x => [x.k, x]))

  // 한 번에 4개씩 받는다.
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      let items: Row[]
      try { items = await fetchMonth(key, job.code, job.ym) } catch (e) { failed++; lastError = e instanceof Error ? e.message : String(e); continue }
      for (const it of items) {
        const area = Number(it.excluUseAr)
        for (const t of targets) {
          if (codeOf(t) !== job.code || Math.abs(area - t.area) > AREA_BAND) continue
          const at = matchIndex(t, it)
          if (at < 0) continue
          matched++
          const d = `${it.dealYear}-${String(it.dealMonth).padStart(2, '0')}-${String(it.dealDay).padStart(2, '0')}`
          const won = Number(String(it.dealAmount || '').replace(/[^\d]/g, ''))
          if (!won) continue
          const k = `${it.aptSeq}|${d}|${won}|${area}|${it.floor}`
          const isCancel = String(it.cdealType || '').trim() !== ''
          const had = by[t.id].get(k)
          if (had) {
            if (isCancel && !had.x) { had.x = 1; cancelled++ }
            continue
          }
          const tr: Trade = { k, d, p: Math.round(won / 100) / 100, a: area }
          const floor = Number(it.floor)
          if (Number.isFinite(floor)) tr.f = floor
          if ((t.rt?.seq?.length || 0) > 1 || t.rt?.names) { tr.n = String(it.aptNm || ''); tr.i = at }
          if (String(it.dealingGbn || '').includes('직거래')) tr.dg = 1
          if (isCancel) tr.x = 1
          // 이미 모으던 단지에 새로 나타난 거래만 "새 실거래"로 표시한다.
          if (!opts.quiet && known.has(t.id)) tr.seen = today
          by[t.id].set(k, tr)
          added++
        }
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  if (jobs.length && failed === jobs.length) return await fail(lastError || 'all calls failed')

  const [y, m] = today.split('-').map(Number)
  const cut = new Date(Date.UTC(y, m - 1 - KEEP_MONTHS, 1)).toISOString().slice(0, 10)
  const out: Record<string, Trade[]> = {}
  for (const [id, map] of Object.entries(by)) out[id] = [...map.values()].filter(t => t.d >= cut).sort((a, b) => b.d.localeCompare(a.d) || b.p - a.p)
  const now = new Date().toISOString()
  const partial = failed ? `${failed} of ${jobs.length} calls failed: ${lastError}` : undefined
  // 옛 달만 채우는 호출(months 지정)은 "마지막 수집 시각"을 바꾸지 않는다.
  const synced_at = opts.months?.length ? state.synced_at : now
  await writeJson(db, FILE, { synced_at, by: out, error: partial, error_at: partial ? now : undefined })
  return { ok: true, calls: jobs.length, failed, matched, added, cancelled, complexes: targets.length, synced_at: synced_at || null, error: partial || null }
}

// 뒤에서 돌린다(응답을 기다리게 하지 않는다).
export function tradesSyncInBackground(db: SupabaseClient) {
  const p = tradesSync(db).catch(() => {})
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
}

// action이 여기 것이 아니면 null을 돌려준다.
// deno-lint-ignore no-explicit-any
export async function tradesPost(db: SupabaseClient, body: any, role: string): Promise<Row | null> {
  const action = body?.action
  if (action === 're_config_put') {
    if (role !== 'maint' && role !== 'owner') throw new BadRequest('not allowed')
    const key = typeof body.data_go_kr_key === 'string' ? body.data_go_kr_key.trim() : ''
    if (!/^[A-Za-z0-9%+/=]{20,300}$/.test(key)) throw new BadRequest('data_go_kr_key does not look right')
    await writeJson(db, CONFIG, { data_go_kr_key: key, updated_at: new Date().toISOString() })
    return { ok: true }
  }
  if (action === 're_trades_sync') {
    const months: string[] | undefined = Array.isArray(body.months) ? body.months : undefined
    if (months && (months.length > 4 || months.some(m => !/^20\d{4}$/.test(String(m))))) throw new BadRequest('months must be up to 4 values like 202611')
    const quiet = !!body.quiet && (role === 'maint' || role === 'owner')
    return await tradesSync(db, { months, quiet })
  }
  return null
}
