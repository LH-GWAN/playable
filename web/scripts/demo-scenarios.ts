// 실데이터에서 "원래 조건 0건 → 조건 1개만 바꾸면 확인된 강좌가 생기는" 사례를 찾아
// docs/evidence/demo_scenarios.md 로 기록한다. (보고서 대표 사례용 — 가상 사례 금지)
// 실행: node scripts/demo-scenarios.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  alternatives, blockers, EMPTY_QUERY, funnel, makeCtx, search, type Query,
} from '../src/engine/engine.ts'
import { CATEGORY_LABEL, COND_LABEL, TARGET_LABEL, TIME_LABEL, WEEKDAY_LABEL, won } from '../src/engine/labels.ts'
import type { Facility, Meta, Program, TimeBucket, Weekday } from '../src/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'public', 'data')
const load = <T>(n: string): T => JSON.parse(readFileSync(join(dataDir, n), 'utf-8')) as T
const programs = load<Program[]>('programs.json')
const facilities = load<Facility[]>('facilities.json')
const meta = load<Meta>('meta.json')
const ctx = makeCtx(programs, facilities, meta)
const SITE = 'https://lh-gwan.github.io/playable/'

function qs(q: Query): string {
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

function describe(q: Query): string {
  const parts: string[] = []
  const sg = q.regions.map((c) => ctx.sg.get(c)?.name).join(', ')
  parts.push(`지역 ${q.sido} ${sg}`)
  if (q.category) parts.push(`종목 ${CATEGORY_LABEL[q.category]}`)
  if (q.target) parts.push(`대상 ${TARGET_LABEL[q.target]}`)
  if (q.weekdays.length) parts.push(`요일 ${q.weekdays.map((d) => WEEKDAY_LABEL[d]).join('·')}`)
  if (q.times.length) parts.push(`시간대 ${q.times.map((t) => TIME_LABEL[t]).join('·')}`)
  if (q.budget !== null) parts.push(`월 ${won(q.budget)} 이하`)
  if (q.walkMax !== null) parts.push(`역·정류장 도보 ${q.walkMax}분 이내`)
  return parts.join(' / ')
}

const DAY_SETS: Weekday[][] = [['tue', 'thu'], ['mon', 'wed', 'fri'], ['sat'], ['tue', 'thu', 'sat']]
const TIMES: TimeBucket[][] = [['evening'], ['morning'], ['dawn']]
const BUDGETS = [40000, 50000, 60000]
const CATS = ['swim', 'yoga', 'pilates', 'badminton', 'tabletennis', 'fitness', 'dance']

type Found = { q: Query; score: number }
const found: Found[] = []
const sgList = [...meta.sigungu].filter((s) => s.prog >= 150)
for (const s of sgList) {
  for (const c of CATS) {
    for (const wd of DAY_SETS) {
      for (const tb of TIMES) {
        for (const b of BUDGETS) {
          const q: Query = {
            ...EMPTY_QUERY, sido: s.sido, regions: [s.code], category: c, target: 'adult',
            weekdays: wd, times: tb, budget: b, flexible: ['region', 'weekday', 'time', 'budget'],
          }
          const r = search(ctx, q)
          if (r.match.length !== 0) continue
          const alt = alternatives(ctx, q, r)
          if (alt.level !== 1 || !alt.options.length || alt.options[0].match < 1) continue
          const strong = alt.options.filter((o) => o.match > 0).length
          found.push({ q, score: strong * 10 + Math.min(alt.options[0].match, 10) - r.check.length * 0.01 })
        }
      }
    }
  }
}
found.sort((a, b) => b.score - a.score)

// 시군구·종목이 겹치지 않게 5개
const picked: Found[] = []
for (const f of found) {
  if (picked.some((p) => p.q.regions[0] === f.q.regions[0] || p.q.category === f.q.category)) continue
  picked.push(f)
  if (picked.length === 5) break
}

const L: string[] = [
  '# 대표 사례 후보 (실데이터 자동 탐색)',
  '',
  `- 생성: scripts/demo-scenarios.ts · 데이터 기준일 ${meta.refDate} · 강좌 ${meta.counts.programs.toLocaleString()}개`,
  `- 탐색 범위: 강좌 150개 이상 시군구 ${sgList.length}곳 × 종목 ${CATS.length} × 요일 ${DAY_SETS.length} × 시간대 ${TIMES.length} × 예산 ${BUDGETS.length} (대상 성인)`,
  `- 조건: 원래 조건으로 '조건에 맞음' 0건이고, 조건 1개만 바꾸면 확인된 강좌가 생기는 경우 ${found.length.toLocaleString()}건 중 상위 5건`,
  '- 바꿔도 됨: 지역·요일·시간대·예산 / 꼭 지킴: 종목·대상',
  '',
]
picked.forEach(({ q }, i) => {
  const r = search(ctx, q)
  const fn = funnel(ctx, r)
  const bl = blockers(r)
  const alt = alternatives(ctx, q, r)
  L.push(`## 사례 ${i + 1}`, '', `**입력:** ${describe(q)}`, '', `**바로 보기:** ${SITE}${qs(q)}`, '')
  L.push(`**결과:** 조건에 맞음 ${r.match.length} · 확인 필요 ${r.check.length} · 맞지 않음 ${r.fail.length.toLocaleString()}`, '')
  L.push('**어디서 줄어들었나:** ' + fn.map((s) => `${s.key === 'all' ? '전체' : COND_LABEL[s.key]} ${s.remaining.toLocaleString()}`).join(' → '), '')
  L.push('**막는 조건:** ' + (bl.map((b) => `${COND_LABEL[b.key]}만 아니면 ${b.only}개`).join(', ') || '없음'), '')
  L.push('**대안(조건 1개만 변경):**', '')
  L.push('| 바꾸는 조건 | 내용 | 확인된 강좌 | 확인 필요 |', '|---|---|---|---|')
  for (const o of alt.options.slice(0, 5)) {
    const c = o.changes[0]
    L.push(`| ${COND_LABEL[c.key]} | ${c.label}${c.detail ? ` (${c.detail})` : ''} | ${o.match} | ${o.check} |`)
  }
  const best = alt.options[0]
  const shown = search(ctx, best.query).match.slice(0, 3)
  L.push('', `**첫 번째 대안으로 확인된 강좌 예시:**`, '')
  for (const e of shown) {
    L.push(`- ${e.f.nm}(${e.f.sg}) 「${e.p.n}」 ${e.p.wdr ?? ''} ${e.p.tm ?? ''} 월 ${e.p.pm !== null ? won(e.p.pm) : '-'} — 원본 ${e.p.row}번째 줄`)
  }
  L.push('')
})
const out = join(here, '..', '..', 'docs', 'evidence', 'demo_scenarios.md')
writeFileSync(out, L.join('\n') + '\n', 'utf-8')
console.log(`found ${found.length}, wrote ${out}`)
