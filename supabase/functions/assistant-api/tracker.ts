// 의뢰서 마감 트래커 — assistant-api 안에서 resource=tracker / action=tracker_* 를 처리한다.
// index.ts의 인증(x-assistant-key)을 통과한 뒤 service-role 클라이언트(db)로만 호출된다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'tracker-thumbs'
const THUMB_TTL = 60 * 60 * 12

const TABLES: Record<string, string[]> = {
  tracker_seasons: ['id', 'name', 'deadline', 'review_days', 'start_date', 'holidays', 'settings', 'active'],
  tracker_concepts: ['id', 'season_id', 'name', 'target', 'sort'],
  tracker_groups: ['id', 'season_id', 'name', 'sort'],
  tracker_items: ['id', 'season_id', 'concept_id', 'code', 'item_type', 'file_name', 'difficulty', 'important', 'pinned_at', 'status', 'auto_done', 'auto_score', 'confirmed', 'completed_at', 'note', 'sort_order', 'group_id'],
  tracker_sessions: ['id', 'item_id', 'season_id', 'started_at', 'ended_at', 'paused_ms', 'pause_started_at', 'focus_sec'],
  tracker_days: ['id', 'season_id', 'date', 'goal', 'carry', 'share', 'picks'],
}
// 부모 → 자식 순서 (FK 때문에 upsert는 이 순서로)
const ORDER = Object.keys(TABLES)

function clean(table: string, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of TABLES[table]) if (k in row) out[k] = row[k]
  return out
}

async function signThumbs(db: SupabaseClient, items: { id: string; thumb_path: string | null }[]) {
  const withThumb = items.filter(i => i.thumb_path)
  const urls: Record<string, string> = {}
  if (!withThumb.length) return urls
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(withThumb.map(i => i.thumb_path!), THUMB_TTL)
  if (error) throw new Error(error.message)
  data?.forEach((d, n) => { if (d.signedUrl) urls[withThumb[n].id] = d.signedUrl })
  return urls
}

async function removeThumbs(db: SupabaseClient, paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p)
  if (list.length) await db.storage.from(BUCKET).remove(list)
}

export async function trackerGet(db: SupabaseClient) {
  const read = async (table: string, order: string) => {
    const { data, error } = await db.from(table).select('*').order(order)
    if (error) throw new Error(error.message)
    return data || []
  }
  const [seasons, concepts, groups, items, sessions, days] = await Promise.all([
    read('tracker_seasons', 'created_at'),
    read('tracker_concepts', 'sort'),
    read('tracker_groups', 'created_at'),
    read('tracker_items', 'created_at'),
    read('tracker_sessions', 'started_at'),
    read('tracker_days', 'date'),
  ])
  return { tracker: true, seasons, concepts, groups, items, sessions, days, thumb_urls: await signThumbs(db, items) }
}

// action이 tracker_* 가 아니면 null을 돌려준다.
// deno-lint-ignore no-explicit-any
export async function trackerPost(db: SupabaseClient, body: any): Promise<Record<string, unknown> | null> {
  const action = body?.action
  if (typeof action !== 'string' || !action.startsWith('tracker_')) return null

  if (action === 'tracker_upsert') {
    // { table, rows } 하나 또는 { batches: [{table, rows}] } 여러 개
    const batches = Array.isArray(body.batches) ? body.batches : [{ table: body.table, rows: body.rows }]
    for (const b of batches) if (!TABLES[b?.table] || !Array.isArray(b.rows)) throw new Error('valid table and rows required')
    batches.sort((a: { table: string }, b: { table: string }) => ORDER.indexOf(a.table) - ORDER.indexOf(b.table))
    for (const b of batches) {
      const rows = b.rows.map((r: Record<string, unknown>) => clean(b.table, r)).filter((r: Record<string, unknown>) => typeof r.id === 'string' && r.id)
      if (!rows.length) continue
      const { error } = await db.from(b.table).upsert(rows, { onConflict: 'id' })
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  }

  if (action === 'tracker_delete') {
    const table = body.table, ids: string[] = Array.isArray(body.ids) ? body.ids : []
    if (!TABLES[table] || !ids.length) throw new Error('valid table and ids required')
    // 지워질 의뢰서의 썸네일도 함께 정리
    const col = table === 'tracker_items' ? 'id' : table === 'tracker_concepts' ? 'concept_id' : table === 'tracker_seasons' ? 'season_id' : null
    if (col) {
      const { data, error } = await db.from('tracker_items').select('thumb_path').in(col, ids)
      if (error) throw new Error(error.message)
      await removeThumbs(db, (data || []).map(r => r.thumb_path))
    }
    const { error } = await db.from(table).delete().in('id', ids)
    if (error) throw new Error(error.message)
    return { ok: true }
  }

  if (action === 'tracker_thumb') {
    const itemId = body.item_id, b64 = body.data
    if (!itemId || typeof b64 !== 'string') throw new Error('item_id and data required')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    if (bytes.length > 1048576) throw new Error('thumbnail too large')
    const { data: item, error: readErr } = await db.from('tracker_items').select('id,thumb_path').eq('id', itemId).single()
    if (readErr) throw new Error(readErr.message)
    const path = `${crypto.randomUUID()}.jpg`
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' })
    if (upErr) throw new Error(upErr.message)
    const { error } = await db.from('tracker_items').update({ thumb_path: path }).eq('id', itemId)
    if (error) { await removeThumbs(db, [path]); throw new Error(error.message) }
    await removeThumbs(db, [item.thumb_path])
    const urls = await signThumbs(db, [{ id: itemId, thumb_path: path }])
    return { ok: true, thumb_path: path, url: urls[itemId] || null }
  }

  throw new Error('unknown tracker action')
}
