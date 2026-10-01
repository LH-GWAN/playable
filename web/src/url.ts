// 검색 조건 ↔ URL 쿼리(공유·재현용). 시군구 단위까지만 담는다.
import { BUCKETS, COND_ORDER, EMPTY_QUERY, WEEKDAYS, type CondKey, type Query } from './engine/engine'
import type { TargetGroup, TimeBucket, Weekday } from './types'

const TARGETS: TargetGroup[] = ['preschool', 'child', 'teen', 'adult', 'senior']

function list(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

function num(v: string | null): number | null {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export function queryFromSearch(search: string): Query {
  const s = new URLSearchParams(search)
  if (![...s.keys()].length) return EMPTY_QUERY
  const t = s.get('t')
  return {
    sido: s.get('sd'),
    regions: list(s.get('rg')),
    category: s.get('c'),
    target: TARGETS.includes(t as TargetGroup) ? (t as TargetGroup) : null,
    weekdays: list(s.get('wd')).filter((d): d is Weekday => WEEKDAYS.includes(d as Weekday)),
    times: list(s.get('tb')).filter((b): b is TimeBucket => BUCKETS.includes(b as TimeBucket)),
    budget: num(s.get('b')),
    walkMax: num(s.get('w')),
    flexible: s.has('fx')
      ? list(s.get('fx')).filter((k): k is CondKey => COND_ORDER.includes(k as CondKey))
      : EMPTY_QUERY.flexible,
  }
}

export function queryToSearch(q: Query): string {
  const s = new URLSearchParams()
  if (q.sido) s.set('sd', q.sido)
  if (q.regions.length) s.set('rg', q.regions.join(','))
  if (q.category) s.set('c', q.category)
  if (q.target) s.set('t', q.target)
  if (q.weekdays.length) s.set('wd', q.weekdays.join(','))
  if (q.times.length) s.set('tb', q.times.join(','))
  if (q.budget !== null) s.set('b', String(q.budget))
  if (q.walkMax !== null) s.set('w', String(q.walkMax))
  s.set('fx', q.flexible.join(','))
  return `?${s.toString()}`
}
