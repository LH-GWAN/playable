import { activeConds, COND_ORDER, evaluate, fmtYmd, type Ctx, type Query } from '../engine/engine'
import { CATEGORY_LABEL, COND_LABEL, PRICE_BASIS_LABEL, TARGET_LABEL, won } from '../engine/labels'
import { dayText, priceText, timeText } from './ProgramCard'

const STATUS_TEXT = { pass: '맞음', unknown: '확인 필요', fail: '맞지 않음' } as const
const CS_TEXT = { name: '강좌명 키워드', type: '프로그램유형명 키워드', facility: '시설 종류로 추정(확인 필요)' } as const

function telHref(t: string) {
  return `tel:${t.replace(/[^0-9+]/g, '')}`
}

function urlHref(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function ProgramDetail({ ctx, id, query, onClose }: { ctx: Ctx; id: number; query: Query; onClose: () => void }) {
  const p = ctx.programs[id]
  if (!p) return <section className="detail"><p>강좌를 찾을 수 없어요.</p><button onClick={onClose}>돌아가기</button></section>
  const f = ctx.facilities[p.f]
  const e = evaluate(p, ctx, query)
  const conds = activeConds(query)
  const d1 = ctx.meta.datasets.D1
  const d2 = ctx.meta.datasets.D2
  const mapQ = encodeURIComponent(f.addr ? `${f.addr}` : f.nm)

  return (
    <section className="detail" aria-labelledby="pd-title">
      <button type="button" className="back" onClick={onClose}>← 결과로 돌아가기</button>
      <h2 id="pd-title">{p.n}</h2>
      <p className="fac">{f.nm} · {f.sd} {f.sg}</p>

      {conds.length > 0 && (
        <div className="box">
          <h3>내 조건과 비교</h3>
          <ul className="cond-list">
            {COND_ORDER.filter((k) => e.conds[k]).map((k) => (
              <li key={k} className={e.conds[k]!.status}>
                <span>{COND_LABEL[k]}</span>
                <strong>{STATUS_TEXT[e.conds[k]!.status]}</strong>
                {e.conds[k]!.reason && <small>{e.conds[k]!.reason}</small>}
              </li>
            ))}
            {e.cautions.map((c) => <li key={c} className="unknown"><span>주의</span><strong>확인 필요</strong><small>{c}</small></li>)}
          </ul>
        </div>
      )}

      <div className="box">
        <h3>원본 값과 서비스 해석</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>항목</th><th>공단 데이터 원본 값</th><th>서비스가 읽은 값</th></tr></thead>
            <tbody>
              <tr><td>프로그램명</td><td>{p.n ?? '-'}</td><td>{p.n ?? '-'}</td></tr>
              <tr><td>종목</td><td>유형명: {p.ty ?? '(없음)'}</td>
                <td>{p.c ? p.c.map((c) => CATEGORY_LABEL[c] ?? c).join(', ') : '분류 못 함'}{p.cs && <small> · 근거: {CS_TEXT[p.cs]}</small>}</td></tr>
              <tr><td>대상</td><td>{p.tgr ?? '(없음)'}</td><td>{p.tg ? p.tg.map((t) => TARGET_LABEL[t]).join(', ') : '해석 못 함'}</td></tr>
              <tr><td>개설요일</td><td>{p.wdr ?? '(없음)'}</td><td>{dayText(p)}</td></tr>
              <tr><td>시간대</td><td>{p.tmr ?? '(없음)'}</td><td>{timeText(p)}</td></tr>
              <tr><td>가격</td><td>{p.p !== null ? won(p.p) : '(없음)'}{p.pt && <small> · 가격유형: {p.pt}</small>}</td>
                <td>{priceText(p)}<small> · {PRICE_BASIS_LABEL[p.pb]}</small></td></tr>
              <tr><td>회차 기간</td><td>{p.b ?? '-'} ~ {p.e}</td><td>{fmtYmd(p.b)} ~ {fmtYmd(p.e)} ({p.st === 'cur' ? '현재 회차' : '다음 회차 확인 필요'})</td></tr>
              <tr><td>모집인원</td><td>{p.cap ?? '(없음)'}</td><td>{p.cap !== null ? `${p.cap}명 모집 — 남은 자리가 아니에요` : '-'}</td></tr>
              <tr><td>개설 이력</td><td colSpan={2}>최근 {p.rec}개월 연속 개설(월별 회차 기준)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="box">
        <h3>시설과 문의처</h3>
        <dl className="kv">
          <dt>주소</dt>
          <dd>{f.addr ?? '정보 없음'}
            <span className="links">
              <a href={`https://map.kakao.com/link/search/${mapQ}`} target="_blank" rel="noreferrer">카카오맵</a>
              <a href={`https://map.naver.com/p/search/${mapQ}`} target="_blank" rel="noreferrer">네이버지도</a>
            </span>
          </dd>
          <dt>전화</dt>
          <dd>{f.tel ? <><a href={telHref(f.tel)}>{f.tel}</a> <small>({f.telSrc === 'D2' ? '전국공공체육시설 데이터 담당부서 번호' : '프로그램 정보 시설 번호'})</small></> : '정보 없음'}</dd>
          <dt>홈페이지</dt>
          <dd>{f.url ? <><a href={urlHref(f.url)} target="_blank" rel="noreferrer">{f.url}</a> <small>({f.urlSrc === 'D2' ? '전국공공체육시설 데이터' : '프로그램 정보'})</small></> : '정보 없음'}</dd>
          <dt>가까운 교통</dt>
          <dd>{f.tr ? `${f.tr.nm} (${f.tr.kind ?? ''}) 도보 약 ${f.tr.min}분${f.tr.m ? `, ${f.tr.m}m` : ''}` : '정보 없음'}</dd>
          {f.d2 && <>
            <dt>시설 정보</dt>
            <dd>{f.d2.name}{f.d2.owner && ` · 소유 ${f.d2.owner}`}{f.d2.dept && ` · 담당 ${f.d2.dept}`}
              <small> (전국공공체육시설 데이터와 {f.d2.how === 'name' ? '시설명·시군구' : '좌표·시설명'}로 연결)</small>
              {f.d2.state && <strong className="warn"> 시설 상태 확인 필요: {f.d2.state}</strong>}
            </dd>
          </>}
        </dl>
      </div>

      <div className="box checklist">
        <h3>신청 전에 시설에 확인하세요</h3>
        <ul>
          <li>지금 접수 중인지, 접수 기간과 방법(온라인·방문·추첨)</li>
          <li>남은 자리 — 데이터의 모집인원은 잔여 정원이 아니에요</li>
          <li>수강 대상과 수준(초급 여부), 관내 거주자 우선·제한 여부</li>
          <li>실제 요일·시간과 휴강 일정</li>
          <li>수강료와 할인(어르신·장애인·다자녀 등), 스포츠강좌이용권 사용 가능 여부</li>
        </ul>
      </div>

      <div className="box source">
        <h3>데이터 출처</h3>
        <p>강좌: <a href={d1.url} target="_blank" rel="noreferrer">{d1.provider} 「{d1.name}」</a> — 원본 파일 {p.row.toLocaleString()}번째 줄</p>
        <p>시설 보강: <a href={d2.url} target="_blank" rel="noreferrer">{d2.provider} 「{d2.name}」</a></p>
        <p className="small">데이터 등록 {d1.registered} · 내려받음 {d1.downloaded} · 판정 기준일 {ctx.meta.refDate}. 실시간 정보가 아니에요.</p>
      </div>
    </section>
  )
}
