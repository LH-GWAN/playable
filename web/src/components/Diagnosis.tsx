import { alternatives, blockers, funnel, type Alternative, type Ctx, type Query, type SearchResult } from '../engine/engine'
import { COND_LABEL } from '../engine/labels'

interface Props {
  ctx: Ctx
  query: Query
  result: SearchResult
  onApply: (a: Alternative) => void
}

const STEP_LABEL = { all: '제공 중인 전체 강좌', ...COND_LABEL }

export function Diagnosis({ ctx, query, result, onApply }: Props) {
  // 지역을 고른 경우 깔때기는 지역 안 강좌부터 보여 준다(전국 수 대비 막대가 너무 작아지지 않게)
  const allSteps = funnel(ctx, result)
  const steps = allSteps[1]?.key === 'region' ? allSteps.slice(1) : allSteps
  const blocks = blockers(result)
  const alt = alternatives(ctx, query, result)
  const max = steps[0]?.remaining || 1
  const keep = result.conds.filter((k) => !query.flexible.includes(k) || k === 'target')

  return (
    <section className="diagnosis" aria-labelledby="dx-title">
      <h2 id="dx-title">
        {result.check.length
          ? `조건을 모두 확인할 수 있는 강좌는 없지만, 정보가 빠져 확인이 필요한 강좌가 ${result.check.length.toLocaleString()}개 있어요`
          : '지금 조건에 딱 맞는 강좌는 없어요'}
      </h2>

      <div className="dx-grid">
        <div>
          <h3>어디서 줄어들었나요</h3>
          <ol className="funnel">
            {steps.map((s, i) => (
              <li key={s.key}>
                <span className="f-label">{i === 0 ? (s.key === 'region' ? '선택한 지역 강좌' : STEP_LABEL.all) : `+ ${STEP_LABEL[s.key]}`}</span>
                <span className="f-bar"><span style={{ width: `${Math.max(2, (s.remaining / max) * 100)}%` }} /></span>
                <span className="f-num">{s.remaining.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="small">막대는 판정 결과가 '맞지 않음'이 아닌 강좌(확인 필요 포함) 수예요.</p>
        </div>
        <div>
          <h3>무엇이 막고 있나요</h3>
          {blocks.length ? (
            <ul className="blockers">
              {blocks.map((b, i) => (
                <li key={b.key} className={i === 0 ? 'main' : ''}>
                  {b.key === 'region' ? (
                    <>다른 지역에는 나머지 조건이 맞는 강좌가 <strong>{b.only.toLocaleString()}개</strong> 있어요</>
                  ) : (
                    <><strong>{COND_LABEL[b.key]}</strong> 조건 하나만 아니면 <strong>{b.only.toLocaleString()}개</strong>가 남아요</>
                  )}
                  {i === 0 && <em>주된 걸림돌</em>}
                </li>
              ))}
            </ul>
          ) : (
            <p>조건 하나만 맞지 않는 강좌는 없어요. 여러 조건이 함께 맞지 않아요.</p>
          )}
        </div>
      </div>

      <h3>이렇게 하면 다닐 수 있는 강좌가 있어요</h3>
      {keep.length > 0 && <p className="small">꼭 지킴: {keep.map((k) => COND_LABEL[k]).join(', ')} — 이 조건은 바꾸지 않았어요.</p>}
      {alt.level === 2 && <p className="small">조건 하나만 바꿔서는 찾지 못해, 두 가지를 함께 바꾼 경우를 보여 드려요.</p>}
      {alt.level === 0 ? (
        <div className="empty">
          <p><strong>‘바꿔도 됨’으로 둔 조건 안에서는 대안을 찾지 못했어요.</strong></p>
          <p>다른 조건을 ‘바꿔도 됨’으로 바꿔 보거나, 이 지역·조건의 강좌 공급이 부족할 수 있어요.</p>
          <p className="small">우리 데이터에 없다는 것이 지역에 강좌가 없다는 뜻은 아니에요. 공단 공공데이터에 등록된 {ctx.meta.counts.sigungu}개 시군구, 시설 {ctx.meta.counts.facilities}곳의 강좌({ctx.meta.refDate} 기준)만 찾았어요.</p>
        </div>
      ) : (
        <ul className="alts">
          {alt.options.map((o, i) => (
            <li key={i} className="alt">
              <div className="alt-changes">
                {o.changes.map((c) => (
                  <p key={c.key + c.label}>
                    <span className="tag">{COND_LABEL[c.key]}</span> {c.label}
                    {c.detail && <small> ({c.detail})</small>}
                  </p>
                ))}
              </div>
              <p className="alt-count">
                <strong>확인된 강좌 {o.match.toLocaleString()}개</strong>
                {o.check > 0 && <span> · 확인 필요 {o.check.toLocaleString()}개</span>}
              </p>
              <button type="button" onClick={() => onApply(o)}>이 조건으로 보기</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
