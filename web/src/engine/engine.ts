// 판정 엔진: 조건별 3상 판정 → 강좌 분류 → 막는 조건 분석 → 최소 변경 대안.
// 순수 함수만 둔다(UI와 분리, Vitest로 검증).
import type { Facility, Meta, Program, Sigungu, TargetGroup, TimeBucket, Weekday } from '../types'
import { CATEGORY_LABEL, TIME_LABEL, WEEKDAY_LABEL, won } from './labels.ts'

export type CondKey = 'region' | 'category' | 'target' | 'weekday' | 'time' | 'budget' | 'transit'
export type Status = 'pass' | 'unknown' | 'fail'
export type Overall = 'match' | 'check' | 'fail'

/** 깔때기·화면 표시 순서 */
export const COND_ORDER: CondKey[] = ['region', 'category', 'target', 'weekday', 'time', 'budget', 'transit']
/** 대상(연령)은 바꾸라고 제안하지 않는다 */
export const RELAXABLE: CondKey[] = ['region', 'category', 'weekday', 'time', 'budget', 'transit']
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const BUCKETS: TimeBucket[] = ['dawn', 'morning', 'afternoon', 'evening']

export interface Query {
  sido: string | null
  regions: string[] // 시군구 코드
  category: string | null
  target: TargetGroup | null
  weekdays: Weekday[] // 다닐 수 있는 요일
  times: TimeBucket[] // 다닐 수 있는 시간대
  budget: number | null // 월 예산 상한(원)
  walkMax: number | null // 역·정류장에서 도보 N분 이내
  flexible: CondKey[] // '바꿔도 됨'으로 표시한 조건
}

export const EMPTY_QUERY: Query = {
  sido: null,
  regions: [],
  category: null,
  target: null,
  weekdays: [],
  times: [],
  budget: null,
  walkMax: null,
  flexible: ['region', 'weekday', 'time', 'budget', 'transit'],
}

export interface Ctx {
  programs: Program[]
  facilities: Facility[]
  meta: Meta
  sg: Map<string, Sigungu>
}

export function makeCtx(programs: Program[], facilities: Facility[], meta: Meta): Ctx {
  return { programs, facilities, meta, sg: new Map(meta.sigungu.map((s) => [s.code, s])) }
}

export function activeConds(q: Query): CondKey[] {
  return COND_ORDER.filter((k) => {
    switch (k) {
      case 'region': return q.regions.length > 0 || q.sido !== null
      case 'category': return q.category !== null
      case 'target': return q.target !== null
      case 'weekday': return q.weekdays.length > 0
      case 'time': return q.times.length > 0
      case 'budget': return q.budget !== null
      case 'transit': return q.walkMax !== null
    }
  })
}

export interface CondResult {
  status: Status
  reason?: string
}

export interface Evaluation {
  p: Program
  f: Facility
  overall: Overall
  conds: Partial<Record<CondKey, CondResult>>
  cautions: string[] // 조건과 무관하게 항상 확인이 필요한 사항
}

const PRICE_UNKNOWN: Record<string, (p: Program) => string> = {
  zero: () => '0원으로 표기됨 — 무료인지 미기재인지 확인 필요',
  multi_month: (p) => `가격유형 '${p.pt}' — 월 단위가 아니어서 월 예산과 비교하지 않음`,
  per_session: (p) => `가격유형 '${p.pt}' — 회당 가격이어서 월 예산과 비교하지 않음`,
  long_period: () => '회차 기간이 1개월을 넘어 월 가격으로 비교하지 않음',
  shifted: () => '원본 가격 값에 오류가 의심되어 비교하지 않음',
  missing: () => '가격 정보 없음',
}

/** 대상이 둘 이상의 연령대에 걸친 강좌 — 원본의 단일 가격이 대상별 요금 중 낮은 쪽일 수 있다 */
export function isMultiTier(p: Program): boolean {
  return p.tg !== null && p.tg.length > 1
}

export const MULTI_TIER_REASON = '대상이 여러 연령대라 표시 가격이 청소년·감면 요금일 수 있음 — 성인 요금 확인 필요'

export function evalCond(k: CondKey, p: Program, f: Facility, q: Query): CondResult {
  switch (k) {
    case 'region':
      if (q.regions.length) return { status: q.regions.includes(f.sgc) ? 'pass' : 'fail' }
      return { status: f.sd === q.sido ? 'pass' : 'fail' }
    case 'category': {
      const cat = q.category as string
      if (!p.c) return { status: 'unknown', reason: '종목 정보가 없어 강좌명으로도 분류하지 못함' }
      if (p.cs === 'facility')
        return p.c.includes(cat)
          ? { status: 'unknown', reason: `종목명이 없어 시설 종류(${f.ty})로만 추정` }
          : { status: 'fail' }
      return { status: p.c.includes(cat) ? 'pass' : 'fail' }
    }
    case 'target': {
      const t = q.target as TargetGroup
      if (!p.tg) return { status: 'unknown', reason: '수강 대상 정보가 없거나 해석하지 못함' }
      if (p.tg.includes(t)) return { status: 'pass' }
      if (t === 'senior' && p.tg.includes('adult'))
        return { status: 'unknown', reason: '성인 대상 강좌 — 어르신 수강 가능 여부 확인 필요' }
      if (t === 'preschool' && p.tg.includes('child'))
        return { status: 'unknown', reason: '어린이 대상 강좌 — 미취학 아동 수강 가능 여부 확인 필요' }
      return { status: 'fail' }
    }
    case 'weekday':
      if (!p.wd) return { status: 'unknown', reason: '요일 정보가 없거나 해석하지 못함' }
      return { status: p.wd.every((d) => q.weekdays.includes(d)) ? 'pass' : 'fail' }
    case 'time':
      if (!p.tb) return { status: 'unknown', reason: '시간 정보가 없음' }
      return { status: q.times.includes(p.tb) ? 'pass' : 'fail' }
    case 'budget':
      if (p.pm === null) return { status: 'unknown', reason: (PRICE_UNKNOWN[p.pb] ?? PRICE_UNKNOWN.missing)(p) }
      if (p.pm > (q.budget as number)) return { status: 'fail' }
      // 정확도 점검(20건)에서 대상이 여러 연령대인 강좌 9건 중 6건은 원본 가격이 청소년·감면 요금이었고
      // 성인 요금은 더 높았다 → 예산 안이어도 '맞음'으로 확정하지 않는다.
      if (isMultiTier(p)) return { status: 'unknown', reason: MULTI_TIER_REASON }
      return { status: 'pass' }
    case 'transit':
      if (!f.tr) return { status: 'unknown', reason: '가까운 역·정류장 정보 없음' }
      return { status: f.tr.min <= (q.walkMax as number) ? 'pass' : 'fail' }
  }
}

export function fmtYmd(s: string | null): string {
  return s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : '-'
}

export function cautionsOf(p: Program, f: Facility): string[] {
  const c: string[] = []
  if (p.st === 'next')
    c.push(`마지막 회차가 ${fmtYmd(p.e)}에 끝남 — 다음 회차 개설 여부 확인 필요(최근 ${p.rec}개월 연속 개설)`)
  if (p.iss?.includes('shifted')) c.push('원본의 시간·가격 값에 오류가 의심됨')
  if (p.iss?.includes('closed_notice')) c.push('원본에 임시휴장 안내가 있음')
  if (f.d2?.state) c.push(`시설 상태 확인 필요(${f.d2.state})`)
  return c
}

export function evaluate(p: Program, ctx: Ctx, q: Query, conds = activeConds(q)): Evaluation {
  const f = ctx.facilities[p.f]
  const out: Evaluation['conds'] = {}
  let fail = false
  let unknown = false
  for (const k of conds) {
    const r = evalCond(k, p, f, q)
    out[k] = r
    if (r.status === 'fail') fail = true
    else if (r.status === 'unknown') unknown = true
  }
  const cautions = cautionsOf(p, f)
  const overall: Overall = fail ? 'fail' : unknown || cautions.length ? 'check' : 'match'
  return { p, f, overall, conds: out, cautions }
}

export interface SearchResult {
  conds: CondKey[]
  match: Evaluation[]
  check: Evaluation[]
  fail: Evaluation[]
}

function unknownCount(e: Evaluation): number {
  return Object.values(e.conds).filter((r) => r?.status === 'unknown').length + e.cautions.length
}

export function search(ctx: Ctx, q: Query): SearchResult {
  const conds = activeConds(q)
  const res: SearchResult = { conds, match: [], check: [], fail: [] }
  for (const p of ctx.programs) {
    const e = evaluate(p, ctx, q, conds)
    res[e.overall].push(e)
  }
  const byPrice = (a: Evaluation, b: Evaluation) =>
    (a.p.pm ?? Number.MAX_SAFE_INTEGER) - (b.p.pm ?? Number.MAX_SAFE_INTEGER) || b.p.rec - a.p.rec
  res.match.sort(byPrice)
  res.check.sort((a, b) => unknownCount(a) - unknownCount(b) || byPrice(a, b))
  return res
}

export function countOnly(ctx: Ctx, q: Query): { match: number; check: number } {
  const conds = activeConds(q)
  let match = 0
  let check = 0
  for (const p of ctx.programs) {
    const o = evaluate(p, ctx, q, conds).overall
    if (o === 'match') match++
    else if (o === 'check') check++
  }
  return { match, check }
}

// ── 막는 조건 분석 ─────────────────────────────────────
export interface FunnelStep {
  key: CondKey | 'all'
  remaining: number // fail 없이 남은 강좌(확인 필요 포함)
}

export function funnel(ctx: Ctx, r: SearchResult): FunnelStep[] {
  const all = [...r.match, ...r.check, ...r.fail]
  const steps: FunnelStep[] = [{ key: 'all', remaining: all.length }]
  let alive = all
  for (const k of r.conds) {
    alive = alive.filter((e) => e.conds[k]?.status !== 'fail')
    steps.push({ key: k, remaining: alive.length })
  }
  void ctx
  return steps
}

/** 이 조건 하나만 아니었으면 남았을 강좌 수 */
export function blockers(r: SearchResult): { key: CondKey; only: number }[] {
  const counts = new Map<CondKey, number>()
  for (const e of r.fail) {
    const fails = r.conds.filter((k) => e.conds[k]?.status === 'fail')
    if (fails.length === 1) counts.set(fails[0], (counts.get(fails[0]) ?? 0) + 1)
  }
  return r.conds
    .filter((k) => counts.get(k))
    .map((key) => ({ key, only: counts.get(key) as number }))
    .sort((a, b) => b.only - a.only)
}

// ── 최소 변경 대안 ─────────────────────────────────────
export interface Change {
  key: CondKey
  label: string // "목요일도 다닐 수 있다면"
  detail?: string // "중심 간 약 4.2km"
}

export interface Alternative {
  changes: Change[]
  query: Query
  match: number
  check: number
}

export interface Alternatives {
  level: 0 | 1 | 2 // 0 = 바꿀 수 있는 조건 안에서 대안 없음
  options: Alternative[]
}

/** 인근 지역 대안은 시설 중심 간 이 거리 안에서만 제안한다 */
export const MAX_REGION_KM = 25

type Proposal = { change: Change; apply: (q: Query) => Query; sortKey: number }

function distKm(ctx: Ctx, from: string[], to: string): number | null {
  const t = ctx.sg.get(to)
  if (!t || t.clat === null || t.clng === null) return null
  let best: number | null = null
  for (const code of from) {
    const s = ctx.sg.get(code)
    if (!s || s.clat === null || s.clng === null) continue
    const dLat = ((t.clat - s.clat) * Math.PI) / 180
    const dLng = ((t.clng - s.clng) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((s.clat * Math.PI) / 180) * Math.cos((t.clat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    const km = 2 * 6371 * Math.asin(Math.sqrt(a))
    if (best === null || km < best) best = km
  }
  return best
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

/** 후보 강좌들(해당 조건에서만 막힌 강좌)에서 그 조건의 구체적 최소 변경안을 만든다 */
function propose(key: CondKey, cands: Evaluation[], q: Query, ctx: Ctx, limit: number): Proposal[] {
  if (!cands.length) return []
  switch (key) {
    case 'region': {
      if (!q.regions.length) return []
      const groups = groupBy(cands, (e) => e.f.sgc)
      return [...groups.keys()]
        .map((code) => ({ code, km: distKm(ctx, q.regions, code) ?? Number.MAX_SAFE_INTEGER }))
        .filter(({ km }) => km <= MAX_REGION_KM)
        .sort((a, b) => a.km - b.km)
        .slice(0, limit)
        .map(({ code, km }) => {
          const s = ctx.sg.get(code) as Sigungu
          return {
            change: {
              key,
              label: `가까운 ${s.name}까지 넓히면`,
              detail: km < Number.MAX_SAFE_INTEGER ? `시설 중심 간 약 ${km.toFixed(1)}km` : undefined,
            },
            apply: (x) => ({ ...x, regions: [...new Set([...x.regions, code])] }),
            sortKey: km,
          }
        })
    }
    case 'weekday': {
      const need = (e: Evaluation) => (e.p.wd as Weekday[]).filter((d) => !q.weekdays.includes(d))
      const groups = groupBy(cands, (e) => need(e).join(','))
      return [...groups.entries()]
        .map(([k, es]) => ({ days: k.split(',') as Weekday[], n: es.length }))
        .sort((a, b) => a.days.length - b.days.length || b.n - a.n)
        .slice(0, limit)
        .map(({ days }) => ({
          change: { key, label: `${days.map((d) => WEEKDAY_LABEL[d]).join('·')}요일도 다닐 수 있다면` },
          apply: (x) => ({ ...x, weekdays: WEEKDAYS.filter((d) => x.weekdays.includes(d) || days.includes(d)) }),
          sortKey: days.length,
        }))
    }
    case 'time': {
      const gap = (b: TimeBucket) => Math.min(...q.times.map((t) => Math.abs(BUCKETS.indexOf(t) - BUCKETS.indexOf(b))))
      const groups = groupBy(cands, (e) => e.p.tb as string)
      return [...groups.entries()]
        .map(([b, es]) => ({ b: b as TimeBucket, n: es.length }))
        .sort((a, b) => gap(a.b) - gap(b.b) || b.n - a.n)
        .slice(0, limit)
        .map(({ b }) => ({
          change: { key, label: `${TIME_LABEL[b]} 시간대도 가능하다면` },
          apply: (x) => ({ ...x, times: BUCKETS.filter((t) => x.times.includes(t) || t === b) }),
          sortKey: gap(b),
        }))
    }
    case 'budget': {
      const prices = [...new Set(cands.map((e) => e.p.pm as number))].sort((a, b) => a - b)
      const picks = [prices[0]]
      // 두 번째 안: 선택지가 3개 이상 생기는 가장 낮은 가격
      const sorted = cands.map((e) => e.p.pm as number).sort((a, b) => a - b)
      if (sorted.length >= 3 && sorted[2] > prices[0]) picks.push(sorted[2])
      return picks.slice(0, limit).map((price) => ({
        change: {
          key,
          label: `월 ${won(price)}까지 쓸 수 있다면`,
          detail: `현재 예산보다 +${won(price - (q.budget as number))}`,
        },
        apply: (x) => ({ ...x, budget: price }),
        sortKey: price,
      }))
    }
    case 'transit': {
      const mins = [...new Set(cands.map((e) => (e.f.tr as { min: number }).min))].sort((a, b) => a - b)
      return mins.slice(0, 1).map((m) => ({
        change: { key, label: `역·정류장에서 도보 ${m}분까지 괜찮다면` },
        apply: (x) => ({ ...x, walkMax: m }),
        sortKey: m,
      }))
    }
    case 'category': {
      const counts = new Map<string, number>()
      for (const e of cands) for (const c of e.p.c ?? []) counts.set(c, (counts.get(c) ?? 0) + 1)
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([c, n]) => ({
          change: { key, label: `${CATEGORY_LABEL[c] ?? c}(으)로 바꾼다면` },
          apply: (x) => ({ ...x, category: c }),
          sortKey: -n,
        }))
    }
    case 'target':
      return [] // 대상은 바꾸라고 제안하지 않음
  }
}

export function alternatives(ctx: Ctx, q: Query, r: SearchResult): Alternatives {
  const flex = r.conds.filter((k) => q.flexible.includes(k) && RELAXABLE.includes(k))
  const failsOf = (e: Evaluation) => r.conds.filter((k) => e.conds[k]?.status === 'fail')

  // 1단계: 조건 하나만 바꾸는 대안
  const singles: Alternative[] = []
  for (const k of flex) {
    const cands = r.fail.filter((e) => {
      const fs = failsOf(e)
      return fs.length === 1 && fs[0] === k
    })
    if (!cands.length) continue
    // 다른 조건이 모두 '맞음'인 후보로 만든 안(확인된 강좌가 생기는 최소 변경)을 먼저, 이어서 전체 후보 기준 안
    const confirmed = cands.filter(
      (e) => !e.cautions.length && r.conds.every((x) => x === k || e.conds[x]?.status === 'pass'),
    )
    const seen = new Set<string>()
    for (const pr of [...propose(k, confirmed, q, ctx, 2), ...propose(k, cands, q, ctx, 3)]) {
      if (seen.has(pr.change.label)) continue
      seen.add(pr.change.label)
      const nq = pr.apply(q)
      const c = countOnly(ctx, nq)
      if (c.match + c.check > 0) singles.push({ changes: [pr.change], query: nq, ...c })
    }
  }
  if (singles.length) {
    // 조건 종류별로 묶어 각 종류 안에서는 '작은 변경'이 먼저 오게 두고(생성 순서),
    // 종류끼리는 확인된 강좌가 가장 많이 생기는 종류부터 보여 준다.
    const best = new Map<CondKey, number>()
    for (const o of singles) {
      const k = o.changes[0].key
      best.set(k, Math.max(best.get(k) ?? 0, o.match * 1e6 + o.check))
    }
    const order = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const perKey = order.map((k) => singles.filter((o) => o.changes[0].key === k).slice(0, 3))
    const out: Alternative[] = []
    for (let i = 0; out.length < 8 && perKey.some((g) => g[i]); i++)
      for (const g of perKey) if (g[i] && out.length < 8) out.push(g[i])
    return { level: 1, options: out }
  }

  // 2단계: 1개로 안 될 때만 두 조건 조합
  const pairs: Alternative[] = []
  for (let i = 0; i < flex.length; i++) {
    for (let j = i + 1; j < flex.length; j++) {
      const [a, b] = [flex[i], flex[j]]
      const cands = r.fail.filter((e) => {
        const fs = failsOf(e)
        return fs.length === 2 && fs.includes(a) && fs.includes(b)
      })
      if (!cands.length) continue
      // a를 바꾸는 안 각각에 대해, 그 안으로 살아나는 후보 안에서 b의 최소 변경안을 찾는다
      for (const pa of propose(a, cands, q, ctx, 2)) {
        const qa = pa.apply(q)
        const sub = cands.filter((e) => evalCond(a, e.p, e.f, qa).status !== 'fail')
        if (!sub.length) continue
        const pb = propose(b, sub, qa, ctx, 1)[0]
        if (!pb) continue
        const nq = pb.apply(qa)
        const c = countOnly(ctx, nq)
        if (c.match + c.check > 0) pairs.push({ changes: [pa.change, pb.change], query: nq, ...c })
      }
    }
  }
  if (pairs.length) {
    pairs.sort((x, y) => y.match - x.match || y.check - x.check)
    return { level: 2, options: pairs.slice(0, 6) }
  }
  return { level: 0, options: [] }
}
