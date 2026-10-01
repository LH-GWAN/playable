// 테스트 전용 가상 픽스처 — 배포 데이터에는 포함되지 않는다.
import { describe, expect, it } from 'vitest'
import type { Facility, Meta, Program } from '../types'
import { activeConds, alternatives, blockers, EMPTY_QUERY, evaluate, funnel, makeCtx, search, type Query } from './engine'

function fac(id: number, sgc: string, over: Partial<Facility> = {}): Facility {
  return {
    id, nm: `시설${id}`, ty: '체육관', sd: '서울특별시', sgc, sg: `구${sgc}`, emd: null, addr: null,
    tel: null, telSrc: null, url: null, urlSrc: null, lat: null, lng: null,
    tr: { nm: '정류장', kind: '버스', min: 5, m: 300 }, d2: null, ...over,
  }
}

function prog(id: number, f: number, over: Partial<Program> = {}): Program {
  return {
    id, f, n: `강좌${id}`, ty: null, c: ['swim'], cs: 'name', tg: ['adult'], tgr: '성인',
    wd: ['tue', 'thu'], wdr: '화목', tm: '19:00~19:50', tsrc: 'col', tb: 'evening', tmr: '19:00~19:50',
    b: '20261001', e: '20261031', p: 60000, pm: 60000, pb: 'period', pt: null, cap: 20, rec: 6,
    st: 'cur', iss: null, row: id + 2, ...over,
  }
}

const meta = {
  sigungu: [
    { code: 'A', sido: '서울특별시', name: 'A구', fac: 1, prog: 1, clat: 37.5, clng: 127.0, near: [] },
    { code: 'B', sido: '서울특별시', name: 'B구', fac: 1, prog: 1, clat: 37.52, clng: 127.02, near: [] },
    { code: 'C', sido: '서울특별시', name: 'C구', fac: 1, prog: 1, clat: 37.7, clng: 127.3, near: [] },
  ],
} as unknown as Meta

const facilities = [fac(0, 'A'), fac(1, 'B'), fac(2, 'C')]

function q(over: Partial<Query>): Query {
  return { ...EMPTY_QUERY, ...over }
}

describe('조건별 3상 판정', () => {
  const ctx = makeCtx([], facilities, meta)

  it('요일 복수값: 강좌 요일이 모두 가능한 요일 안에 있어야 통과', () => {
    const p = prog(0, 0, { wd: ['tue', 'thu'] })
    expect(evaluate(p, ctx, q({ weekdays: ['tue', 'thu'] })).conds.weekday?.status).toBe('pass')
    expect(evaluate(p, ctx, q({ weekdays: ['tue'] })).conds.weekday?.status).toBe('fail')
  })

  it('요일 미상은 unknown(불충족 아님)', () => {
    const e = evaluate(prog(0, 0, { wd: null }), ctx, q({ weekdays: ['mon'] }))
    expect(e.conds.weekday?.status).toBe('unknown')
    expect(e.overall).toBe('check')
  })

  it('0원과 가격 없음은 둘 다 확인 필요지만 사유가 다르다', () => {
    const zero = evaluate(prog(0, 0, { p: 0, pm: null, pb: 'zero' }), ctx, q({ budget: 50000 }))
    const miss = evaluate(prog(1, 0, { p: null, pm: null, pb: 'missing' }), ctx, q({ budget: 50000 }))
    expect(zero.conds.budget?.status).toBe('unknown')
    expect(miss.conds.budget?.status).toBe('unknown')
    expect(zero.conds.budget?.reason).not.toBe(miss.conds.budget?.reason)
  })

  it('회당·다개월 가격은 월 예산과 비교하지 않는다', () => {
    const per = evaluate(prog(0, 0, { p: 5000, pm: null, pb: 'per_session', pt: '회당' }), ctx, q({ budget: 1000 }))
    const multi = evaluate(prog(1, 0, { p: 150000, pm: null, pb: 'multi_month', pt: '성인 (3개월)' }), ctx, q({ budget: 1000 }))
    expect(per.conds.budget?.status).toBe('unknown')
    expect(multi.conds.budget?.status).toBe('unknown')
  })

  it('월 가격(회차 기간 기준)은 예산과 비교한다', () => {
    const p = prog(0, 0, { pm: 70000, pb: 'period' })
    expect(evaluate(p, ctx, q({ budget: 70000 })).conds.budget?.status).toBe('pass')
    expect(evaluate(p, ctx, q({ budget: 69999 })).conds.budget?.status).toBe('fail')
  })

  it('다음 회차 미확인 강좌는 조건을 모두 통과해도 확인 필요', () => {
    const e = evaluate(prog(0, 0, { st: 'next', e: '20260930' }), ctx, q({ category: 'swim' }))
    expect(e.overall).toBe('check')
    expect(e.cautions.length).toBe(1)
  })

  it('모든 조건이 비어 있으면 판정할 조건이 없다', () => {
    expect(activeConds(EMPTY_QUERY)).toEqual([])
    const e = evaluate(prog(0, 0), ctx, EMPTY_QUERY)
    expect(e.overall).toBe('match')
  })

  it('어르신이 성인 강좌를 찾으면 확인 필요', () => {
    expect(evaluate(prog(0, 0), ctx, q({ target: 'senior' })).conds.target?.status).toBe('unknown')
    expect(evaluate(prog(0, 0), ctx, q({ target: 'child' })).conds.target?.status).toBe('fail')
  })
})

describe('막는 조건과 최소 변경 대안', () => {
  // A구: 화목 6만원 / A구: 월수금 9만원 / B구: 화 5만원
  const programs = [
    prog(0, 0, { wd: ['tue', 'thu'], pm: 60000 }),
    prog(1, 0, { wd: ['mon', 'wed', 'fri'], pm: 90000 }),
    prog(2, 1, { wd: ['tue'], pm: 50000 }),
  ]
  const ctx = makeCtx(programs, facilities, meta)
  const base = q({ regions: ['A'], category: 'swim', weekdays: ['tue'], budget: 55000 })

  it('깔때기와 단독 걸림돌을 센다', () => {
    const r = search(ctx, base)
    expect(r.match.length).toBe(0)
    const fn = funnel(ctx, r)
    expect(fn.map((s) => s.remaining)).toEqual([3, 2, 2, 0, 0])
    // 0번: 요일(화목)과 예산 둘 다 fail, 1번: 요일·예산 fail, 2번: 지역만 fail
    expect(blockers(r)).toEqual([{ key: 'region', only: 1 }])
  })

  it('1개 변경 대안이 있으면 2개 조합을 내지 않는다', () => {
    const r = search(ctx, base)
    const alt = alternatives(ctx, base, r)
    expect(alt.level).toBe(1)
    expect(alt.options.every((o) => o.changes.length === 1)).toBe(true)
    expect(alt.options[0].changes[0].key).toBe('region')
    expect(alt.options[0].match).toBe(1)
  })

  it('꼭 지킴 조건은 대안에서 절대 바뀌지 않는다', () => {
    const strict = { ...base, flexible: ['weekday', 'budget'] as Query['flexible'] }
    const r = search(ctx, strict)
    const alt = alternatives(ctx, strict, r)
    expect(alt.level).toBe(2)
    for (const o of alt.options) {
      expect(o.changes.every((c) => strict.flexible.includes(c.key))).toBe(true)
      expect(o.query.regions).toEqual(['A'])
      expect(o.query.category).toBe('swim')
    }
    // 목요일 추가 + 월 6만원이 가장 작은 조합
    const best = alt.options[0]
    expect(best.query.weekdays).toEqual(['tue', 'thu'])
    expect(best.query.budget).toBe(60000)
  })

  it('다른 조건이 확인 필요뿐인 후보만 있어도 예산 대안을 만든다', () => {
    const ps = [prog(0, 0, { pm: 80000, tb: null, tm: null })]
    const c = makeCtx(ps, facilities, meta)
    const query = q({ regions: ['A'], times: ['evening'], budget: 50000 })
    const alt = alternatives(c, query, search(c, query))
    expect(alt.level).toBe(1)
    expect(alt.options[0].query.budget).toBe(80000)
    expect(alt.options[0].check).toBe(1)
  })

  it('바꿀 수 있는 조건이 없으면 대안 없음(level 0)', () => {
    const none = { ...base, flexible: [] }
    const r = search(ctx, none)
    expect(alternatives(ctx, none, r)).toEqual({ level: 0, options: [] })
  })

  it('결과 0건이지만 확인 필요만 있는 경우 대안 계산 없이 확인 필요로 보여 준다', () => {
    const ps = [prog(0, 0, { wd: null })]
    const c = makeCtx(ps, facilities, meta)
    const query = q({ regions: ['A'], weekdays: ['mon'] })
    const r = search(c, query)
    expect(r.match.length).toBe(0)
    expect(r.check.length).toBe(1)
    expect(alternatives(c, query, r).level).toBe(0)
  })
})
