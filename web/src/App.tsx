import { useCallback, useEffect, useMemo, useState } from 'react'
import { About } from './components/About'
import { Diagnosis } from './components/Diagnosis'
import { ProgramCard } from './components/ProgramCard'
import { ProgramDetail } from './components/ProgramDetail'
import { QueryForm } from './components/QueryForm'
import { loadData } from './data'
import { EMPTY_QUERY, makeCtx, search, type Alternative, type Ctx, type Query } from './engine/engine'
import { queryFromSearch, queryToSearch } from './url'

type Route = { page: 'home' } | { page: 'about' } | { page: 'program'; id: number }
type Tab = 'match' | 'check' | 'fail'

function parseHash(h: string): Route {
  if (h.startsWith('#/about')) return { page: 'about' }
  const m = h.match(/^#\/p\/(\d+)/)
  return m ? { page: 'program', id: Number(m[1]) } : { page: 'home' }
}

const PAGE = 20
const TAB_LABEL: Record<Tab, string> = { match: '조건에 맞음', check: '확인 필요', fail: '맞지 않음' }

export default function App() {
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<Query>(() => queryFromSearch(window.location.search))
  const [prevQuery, setPrevQuery] = useState<Query | null>(null)
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [tab, setTab] = useState<Tab>('match')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    loadData()
      .then((d) => setCtx(makeCtx(d.programs, d.facilities, d.meta)))
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    const onPop = () => setQuery(queryFromSearch(window.location.search))
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  const update = useCallback((q: Query, keepPrev = false) => {
    setQuery(q)
    if (!keepPrev) setPrevQuery(null)
    setShown(PAGE)
    window.history.replaceState(null, '', queryToSearch(q) + window.location.hash)
  }, [])

  const ready = query.sido !== null
  const result = useMemo(() => (ctx && ready ? search(ctx, query) : null), [ctx, query, ready])

  useEffect(() => {
    if (!result) return
    setTab(result.match.length ? 'match' : result.check.length ? 'check' : 'fail')
  }, [result])

  const applyAlt = (a: Alternative) => {
    setPrevQuery(query)
    update(a.query, true)
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
  }

  const go = (hash: string) => {
    window.location.hash = hash
  }

  if (error) return <main className="wrap"><p className="error">데이터를 불러오지 못했어요: {error}</p></main>
  if (!ctx) return <main className="wrap"><p className="loading">공공데이터를 불러오는 중…</p></main>

  const list = result ? result[tab] : []

  return (
    <>
      <header className="top">
        <div className="wrap">
          <a className="brand" href={`${import.meta.env.BASE_URL}`} onClick={(e) => { e.preventDefault(); go('#/'); }}>
            운동가능
          </a>
          <nav><a href="#/about">데이터·판정 방법</a></nav>
        </div>
      </header>

      <main className="wrap">
        {route.page === 'about' && <About meta={ctx.meta} onClose={() => go('#/')} />}
        {route.page === 'program' && <ProgramDetail ctx={ctx} id={route.id} query={query} onClose={() => window.history.back()} />}

        {route.page === 'home' && (
          <>
            <section className="intro">
              <h1>다닐 수 있는 공공체육 강좌, 없으면 <em>무엇을 바꾸면 되는지</em>까지</h1>
              <p>지역·요일·시간·예산에 맞는 강좌를 찾고, 없을 때는 어떤 조건이 막는지와 ‘바꿔도 되는’ 조건만 최소한으로 바꾼 대안을 보여 드려요.</p>
              <p className="small">국민체육진흥공단 공공데이터 · {ctx.meta.counts.sido}개 시도 {ctx.meta.counts.sigungu}개 시군구 · 강좌 {ctx.meta.counts.programs.toLocaleString()}개 · {ctx.meta.refDate} 기준</p>
            </section>

            <div className="layout">
              <aside className="panel">
                <QueryForm ctx={ctx} query={query} onChange={(q) => update(q)} />
                {result && (
                  <button type="button" className="jump" onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}>
                    결과 보기 · 맞음 {result.match.length.toLocaleString()} · 확인 필요 {result.check.length.toLocaleString()}
                  </button>
                )}
                {query !== EMPTY_QUERY && (
                  <button type="button" className="link reset" onClick={() => update(EMPTY_QUERY)}>조건 모두 지우기</button>
                )}
              </aside>

              <section id="results" className="results" aria-live="polite">
                {!result && (
                  <div className="empty">
                    <p><strong>시도를 먼저 골라 주세요.</strong></p>
                    <p>조건마다 ‘꼭 지킴’과 ‘바꿔도 됨’을 정할 수 있어요. 맞는 강좌가 없으면 ‘바꿔도 됨’ 조건 안에서만 대안을 찾아요.</p>
                  </div>
                )}

                {result && (
                  <>
                    {prevQuery && (
                      <div className="banner">
                        <span>대안 조건으로 보고 있어요.</span>
                        <button type="button" className="link" onClick={() => update(prevQuery)}>원래 조건으로 되돌리기</button>
                      </div>
                    )}

                    <div className="tabs" role="tablist" aria-label="판정 결과">
                      {(['match', 'check', 'fail'] as Tab[]).map((t) => (
                        <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab ${t} ${tab === t ? 'on' : ''}`}
                          onClick={() => { setTab(t); setShown(PAGE) }}>
                          {TAB_LABEL[t]} <strong>{result[t].length.toLocaleString()}</strong>
                        </button>
                      ))}
                    </div>

                    {result.match.length === 0 && result.conds.length > 1 && (
                      <Diagnosis ctx={ctx} query={query} result={result} onApply={applyAlt} />
                    )}

                    {tab === 'check' && list.length > 0 && (
                      <p className="small">빠진 정보 때문에 맞는지 판단할 수 없는 강좌예요. 각 카드에 확인할 내용을 적어 두었어요.</p>
                    )}
                    {tab === 'fail' && list.length > 0 && (
                      <p className="small">하나 이상의 조건이 맞지 않는 강좌예요.</p>
                    )}

                    <div className="cards">
                      {list.slice(0, shown).map((e) => <ProgramCard key={e.p.id} e={e} onOpen={(id) => go(`#/p/${id}`)} />)}
                    </div>
                    {list.length > shown && (
                      <button type="button" className="more" onClick={() => setShown(shown + PAGE)}>
                        더 보기 ({(list.length - shown).toLocaleString()}개 남음)
                      </button>
                    )}
                    {list.length === 0 && tab !== 'match' && <p className="small">이 탭에 해당하는 강좌가 없어요.</p>}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>로그인이 없고, 입력한 조건은 이 브라우저 안에서만 계산해요. 서버로 보내거나 저장하지 않아요. 건강·아동 정보와 상세 주소는 받지 않아요.</p>
          <p>데이터: 국민체육진흥공단 「공공체육시설 프로그램 정보」·「전국공공체육시설 데이터」 ({ctx.meta.refDate} 기준, 실시간 아님) · <a href="#/about">데이터·판정 방법</a></p>
        </div>
      </footer>
    </>
  )
}
