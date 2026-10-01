import { useMemo, type ReactNode } from 'react'
import { BUCKETS, WEEKDAYS, type CondKey, type Ctx, type Query } from '../engine/engine'
import { TARGET_LABEL, TIME_LABEL, TIME_RANGE, WEEKDAY_LABEL } from '../engine/labels'
import type { TargetGroup } from '../types'

interface Props {
  ctx: Ctx
  query: Query
  onChange: (q: Query) => void
}

const TARGETS = Object.keys(TARGET_LABEL) as TargetGroup[]
const WALKS = [5, 10, 15, 20]

function FlexToggle({ k, query, onChange }: { k: CondKey; query: Query; onChange: (q: Query) => void }) {
  const flex = query.flexible.includes(k)
  const set = (v: boolean) =>
    onChange({ ...query, flexible: v ? [...new Set([...query.flexible, k])] : query.flexible.filter((x) => x !== k) })
  return (
    <div className="flex-toggle" role="radiogroup" aria-label="이 조건을 바꿔도 되나요">
      <button type="button" role="radio" aria-checked={!flex} className={!flex ? 'on keep' : ''} onClick={() => set(false)}>
        꼭 지킴
      </button>
      <button type="button" role="radio" aria-checked={flex} className={flex ? 'on flex' : ''} onClick={() => set(true)}>
        바꿔도 됨
      </button>
    </div>
  )
}

function Row({ label, hint, toggle, children }: { label: string; hint?: string; toggle?: ReactNode; children: ReactNode }) {
  return (
    <div className="q-row">
      <div className="q-head">
        <span className="q-label">{label}</span>
        {toggle}
      </div>
      {children}
      {hint && <p className="q-hint">{hint}</p>}
    </div>
  )
}

export function QueryForm({ ctx, query, onChange }: Props) {
  const sidos = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of ctx.meta.sigungu) m.set(s.sido, (m.get(s.sido) ?? 0) + s.prog)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [ctx])
  const sigungus = ctx.meta.sigungu.filter((s) => s.sido === query.sido).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const cats = ctx.meta.categories.filter((c) => c.count > 0).sort((a, b) => b.count - a.count)
  const set = (patch: Partial<Query>) => onChange({ ...query, ...patch })
  const extraRegions = query.regions.slice(1).map((c) => ctx.sg.get(c)?.name).filter(Boolean)

  return (
    <form className="query" onSubmit={(e) => e.preventDefault()} aria-label="강좌 찾기 조건">
      <Row label="지역" toggle={<FlexToggle k="region" query={query} onChange={onChange} />}
        hint={extraRegions.length ? `대안으로 함께 찾는 지역: ${extraRegions.join(', ')}` : undefined}>
        <div className="two">
          <select aria-label="시도" value={query.sido ?? ''}
            onChange={(e) => set({ sido: e.target.value || null, regions: [] })}>
            <option value="">시도 선택</option>
            {sidos.map(([sd]) => <option key={sd} value={sd}>{sd}</option>)}
          </select>
          <select aria-label="시군구" value={query.regions[0] ?? ''} disabled={!query.sido}
            onChange={(e) => set({ regions: e.target.value ? [e.target.value] : [] })}>
            <option value="">{query.sido ? '시군구 전체' : '시도를 먼저 선택'}</option>
            {sigungus.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.prog.toLocaleString()}</option>)}
          </select>
        </div>
      </Row>

      <Row label="종목" toggle={query.category ? <FlexToggle k="category" query={query} onChange={onChange} /> : undefined}>
        <select aria-label="종목" value={query.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
          <option value="">종목 상관없음</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Row>

      <Row label="대상" hint={query.target ? '대상(연령)은 바꾸라고 제안하지 않아요.' : undefined}>
        <select aria-label="대상" value={query.target ?? ''} onChange={(e) => set({ target: (e.target.value || null) as TargetGroup | null })}>
          <option value="">대상 상관없음</option>
          {TARGETS.map((t) => <option key={t} value={t}>{TARGET_LABEL[t]}</option>)}
        </select>
      </Row>

      <Row label="다닐 수 있는 요일" hint="강좌의 모든 수업 요일이 여기 포함되어야 맞는 것으로 봐요(예: 화·목 강좌는 화와 목 모두 선택)."
        toggle={query.weekdays.length ? <FlexToggle k="weekday" query={query} onChange={onChange} /> : undefined}>
        <div className="chips" role="group" aria-label="요일">
          {WEEKDAYS.map((d) => {
            const on = query.weekdays.includes(d)
            return (
              <button key={d} type="button" aria-pressed={on} className={`chip ${on ? 'on' : ''}`}
                onClick={() => set({ weekdays: WEEKDAYS.filter((x) => (x === d ? !on : query.weekdays.includes(x))) })}>
                {WEEKDAY_LABEL[d]}
              </button>
            )
          })}
        </div>
      </Row>

      <Row label="다닐 수 있는 시간대"
        toggle={query.times.length ? <FlexToggle k="time" query={query} onChange={onChange} /> : undefined}>
        <div className="chips" role="group" aria-label="시간대">
          {BUCKETS.map((b) => {
            const on = query.times.includes(b)
            return (
              <button key={b} type="button" aria-pressed={on} className={`chip wide ${on ? 'on' : ''}`}
                onClick={() => set({ times: BUCKETS.filter((x) => (x === b ? !on : query.times.includes(x))) })}>
                {TIME_LABEL[b]}<small>{TIME_RANGE[b]}</small>
              </button>
            )
          })}
        </div>
      </Row>

      <Row label="한 달 예산" toggle={query.budget !== null ? <FlexToggle k="budget" query={query} onChange={onChange} /> : undefined}>
        <div className="money">
          <input type="number" inputMode="numeric" min={0} step={5000} placeholder="제한 없음" aria-label="한 달 예산(원)"
            value={query.budget ?? ''} onChange={(e) => set({ budget: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
          <span>원 이하</span>
          {query.budget !== null && <button type="button" className="link" onClick={() => set({ budget: null })}>지우기</button>}
        </div>
      </Row>

      <Row label="역·정류장에서" toggle={query.walkMax !== null ? <FlexToggle k="transit" query={query} onChange={onChange} /> : undefined}>
        <select aria-label="역·정류장 도보 거리" value={query.walkMax ?? ''} onChange={(e) => set({ walkMax: e.target.value ? Number(e.target.value) : null })}>
          <option value="">거리 상관없음</option>
          {WALKS.map((w) => <option key={w} value={w}>도보 {w}분 이내</option>)}
          {query.walkMax !== null && !WALKS.includes(query.walkMax) && <option value={query.walkMax}>도보 {query.walkMax}분 이내</option>}
        </select>
      </Row>
    </form>
  )
}
