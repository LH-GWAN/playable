import { COND_ORDER, fmtYmd, type Evaluation } from '../engine/engine'
import { COND_LABEL, PRICE_BASIS_LABEL, WEEKDAY_LABEL, won } from '../engine/labels'
import type { Program } from '../types'

export function priceText(p: Program): string {
  if (p.pm !== null) return `월 ${won(p.pm)}`
  if (p.p === null) return '가격 정보 없음'
  if (p.p === 0) return '0원 표기(확인 필요)'
  return `${won(p.p)} · ${PRICE_BASIS_LABEL[p.pb]}`
}

export function dayText(p: Program): string {
  if (p.wd) return p.wd.map((d) => WEEKDAY_LABEL[d]).join('·')
  return p.wdr ? `요일 미상(원문: ${p.wdr})` : '요일 정보 없음'
}

export function timeText(p: Program): string {
  if (!p.tm) return '시간 정보 없음'
  return p.tsrc === 'name' ? `${p.tm} 시작(강좌명 기준)` : p.tm
}

export function ProgramCard({ e, onOpen }: { e: Evaluation; onOpen: (id: number) => void }) {
  const { p, f } = e
  const unknowns = COND_ORDER.flatMap((k) => (e.conds[k]?.status === 'unknown' ? [`${COND_LABEL[k]}: ${e.conds[k]?.reason}`] : []))
  const fails = COND_ORDER.filter((k) => e.conds[k]?.status === 'fail')
  return (
    <article className={`card ${e.overall}`}>
      <header>
        <h3>{p.n}</h3>
        <p className="fac">{f.nm} · {f.sg}</p>
      </header>
      <dl className="facts">
        <div><dt>요일</dt><dd>{dayText(p)}</dd></div>
        <div><dt>시간</dt><dd>{timeText(p)}</dd></div>
        <div><dt>가격</dt><dd>{priceText(p)}</dd></div>
        <div><dt>대상</dt><dd>{p.tgr ?? '정보 없음'}</dd></div>
        <div><dt>회차</dt><dd>{fmtYmd(p.b)} ~ {fmtYmd(p.e)}</dd></div>
        {f.tr && <div><dt>교통</dt><dd>{f.tr.nm} {f.tr.kind ?? ''} 도보 약 {f.tr.min}분</dd></div>}
      </dl>
      {e.overall === 'check' && (
        <ul className="why check" aria-label="확인이 필요한 이유">
          {[...unknowns, ...e.cautions].map((u) => <li key={u}>{u}</li>)}
        </ul>
      )}
      {e.overall === 'fail' && (
        <p className="why fail">맞지 않는 조건: {fails.map((k) => COND_LABEL[k]).join(', ')}</p>
      )}
      <button type="button" className="ghost" onClick={() => onOpen(p.id)}>근거·문의처 보기</button>
    </article>
  )
}
