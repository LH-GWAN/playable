import type { Meta } from '../types'

const BASIS_ROWS: [string, string][] = [
  ['period', '회차 기간 35일 이하 → 회차 가격을 월 가격으로 비교'],
  ['type', '가격유형에 1개월 표기 → 월 가격으로 비교'],
  ['zero', '0원 표기 → 무료인지 미기재인지 몰라 확인 필요'],
  ['multi_month', '3개월 등 다개월 가격 → 비교하지 않음'],
  ['shifted', '시간대·가격유형 칸에 % 값(열 밀림 의심) → 비교하지 않음'],
]

export function About({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const c = meta.counts
  const commit = import.meta.env.VITE_COMMIT as string | undefined
  return (
    <section className="detail about" aria-labelledby="about-title">
      <button type="button" className="back" onClick={onClose}>← 찾기로 돌아가기</button>
      <h2 id="about-title">사용한 공공데이터와 처리 방법</h2>
      <p>운동가능의 모든 결과는 국민체육진흥공단 공공데이터로 계산해요. 생성형 AI가 결과를 만들지 않고, 아래 규칙으로만 판정해요.</p>

      <div className="box">
        <h3>데이터</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>데이터</th><th>제공</th><th>등록일</th><th>내려받은 날</th><th>원본 행 수</th><th>쓰는 곳</th></tr></thead>
            <tbody>
              <tr>
                <td><a href={meta.datasets.D1.url} target="_blank" rel="noreferrer">{meta.datasets.D1.name}</a></td>
                <td>{meta.datasets.D1.provider}</td><td>{meta.datasets.D1.registered}</td><td>{meta.datasets.D1.downloaded}</td>
                <td>{c.d1Rows.toLocaleString()}</td><td>강좌 후보, 요일·시간·가격·대상 판정, 대안 계산, 가까운 역·정류장</td>
              </tr>
              <tr>
                <td><a href={meta.datasets.D2.url} target="_blank" rel="noreferrer">{meta.datasets.D2.name}</a></td>
                <td>{meta.datasets.D2.provider}</td><td>{meta.datasets.D2.registered}</td><td>{meta.datasets.D2.downloaded}</td>
                <td>{c.d2Rows.toLocaleString()}</td><td>시설 연결, 전화·홈페이지 보강, 시설 상태 확인</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small">원본 파일은 이 사이트에 공개하지 않아요(데이터 이용 약정). 서비스에 필요한 항목만 가공해 사용해요.</p>
      </div>

      <div className="box">
        <h3>원본에서 서비스까지</h3>
        <ol className="lineage">
          <li>원본 {c.d1Rows.toLocaleString()}행 — 같은 강좌가 매월 새 행으로 들어 있어요.</li>
          <li>시설·강좌명·요일·시간·대상이 같은 행을 하나로 묶어 강좌 {c.distinctPrograms.toLocaleString()}개로 정리했어요.</li>
          <li>{meta.refDate} 기준으로 끝난 강좌 {c.excludedEnded.toLocaleString()}개를 뺐어요.</li>
          <li>남은 {c.programs.toLocaleString()}개: 현재 회차 {c.current.toLocaleString()}개 + 최근 끝났지만 {meta.rules.nextMinRecurrence}개월 이상 연속 열린 강좌 {c.nextUnconfirmed.toLocaleString()}개(다음 회차 확인 필요).</li>
          <li>시설 {c.facilities}곳 중 {c.facilitiesD2Matched}곳을 전국공공체육시설 데이터와 시설명·시군구로 연결했어요.</li>
          <li>제공 범위: {c.sido}개 시도, {c.sigungu}개 시군구.</li>
        </ol>
      </div>

      <div className="box">
        <h3>판정 규칙</h3>
        <ul>
          <li>조건마다 <strong>맞음 / 확인 필요 / 맞지 않음</strong>으로 판정해요. 정보가 없으면 ‘맞지 않음’이 아니라 ‘확인 필요’로 남겨, 정보 누락 때문에 결과가 0건이 되지 않게 해요.</li>
          <li>요일: 강좌의 모든 수업 요일이 다닐 수 있는 요일 안에 있어야 맞아요.</li>
          <li>시간: 시간대 칸 값을 쓰고, 비어 있으면 강좌명에 적힌 시작 시각(예: ‘19시’)을 써요({(c.timeSource.name ?? 0).toLocaleString()}개). 둘 다 없으면 확인 필요({(c.timeSource.none ?? 0).toLocaleString()}개).</li>
          <li>종목: 강좌명 → 프로그램유형명 키워드 순으로 분류해요. 수영장처럼 단일 종목 시설의 이름 없는 강좌는 시설 종류로 추정하되 ‘확인 필요’로만 보여요.</li>
          <li>대안: ‘꼭 지킴’ 조건은 바꾸지 않아요. 조건 하나만 바꾸는 경우를 먼저 찾고, 없을 때만 두 조건을 함께 바꿔요. 돈·요일·거리를 하나의 점수로 합치지 않고 나란히 보여 줘요.</li>
          <li>인근 지역: 시군구별 시설 좌표의 중심점 사이 거리로 가까운 순서를 정해요.</li>
          <li>대상별 요금: 원본에는 강좌당 가격이 하나뿐이에요. 표본 20건을 공식 사이트와 대조해 보니, 대상이 여러 연령대인 강좌 9건 중 6건은 원본 가격이 청소년·감면 요금이었고 성인 요금은 더 높았어요. 그래서 이런 강좌는 가격을 ‘~부터’로 표시하고, 예산 안이어도 ‘확인 필요’로 분류해요.</li>
        </ul>
        <h4>가격 판정</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>규칙</th><th>강좌 수</th></tr></thead>
            <tbody>
              {BASIS_ROWS.map(([k, label]) => <tr key={k}><td>{label}</td><td>{(c.priceBasis[k] ?? 0).toLocaleString()}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="box">
        <h3>한계</h3>
        <ul>
          <li>실시간 정보가 아니에요. 데이터는 월 1회(프로그램)·연 1회(시설) 갱신돼요.</li>
          <li>모집인원은 남은 자리가 아니에요. 접수 상태와 잔여 정원은 시설에 확인해야 해요.</li>
          <li>강좌 수준(초급 등), 거주지 제한, 할인 조건은 데이터에 없어요.</li>
          <li>공단 데이터에 등록된 시설만 찾아요. 여기 없다고 지역에 강좌가 없다는 뜻은 아니에요.</li>
        </ul>
      </div>

      <p className="small">데이터 빌드 {meta.builtAt}{meta.buildCommit && ` · 파이프라인 커밋 ${meta.buildCommit}`}{commit && ` · 배포 커밋 ${commit}`}</p>
    </section>
  )
}
