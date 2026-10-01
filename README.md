# 운동가능 — 다닐 수 있는 공공체육 강좌 찾기

**https://lh-gwan.github.io/playable/**

원하는 지역·요일·시간대·예산·종목·대상에 맞는 공공체육시설 강좌를 찾아 주고, 맞는 강좌가 없으면 "0건"으로 끝내지 않습니다.
**어떤 조건이 막고 있는지** 보여 주고, 이용자가 "바꿔도 됨"으로 표시한 조건만 **최소한으로 바꾼 대안**을 비교해 보여 준 뒤, 시설 공식 홈페이지·전화로 확인할 수 있게 연결합니다.

2026 국민체육진흥공단 공공데이터 활용 경진대회 서비스 개발 부문 출품작입니다.

## 사용한 공공데이터

| 데이터 | 제공 | 쓰는 곳 |
|---|---|---|
| [공공체육시설 프로그램 정보](https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=c3b8fb69-307d-4ae7-ab42-d0314c89ef47) (202608) | 국민체육진흥공단 체육종합빅데이터센터 | 강좌 후보, 요일·시간·가격·대상 판정, 대안 계산, 가까운 역·정류장 |
| [전국공공체육시설 데이터](https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=b5880ea0-247a-4258-9f7b-79eab6751591) (202607) | 서울올림픽기념국민체육진흥공단 | 시설 연결, 전화·홈페이지 보강, 시설 상태 확인 |

원본 CSV는 데이터 이용 약정(정보 보안관리 약정서)에 따라 이 저장소에 올리지 않습니다. 서비스에 필요한 항목만 가공한 JSON(`web/public/data/`)만 포함합니다.

## 구조

```
pipeline/            원본 CSV → 정규화 JSON (Python)
  normalize.py       요일·시간·가격·대상·종목 정규화 규칙
  build.py           월별 반복 행 통합, D1-D2 시설 결합, 시군구 거리표, 데이터 프로파일
  evidence.py        정확도 점검표·사용성 테스트 기록표 템플릿
  tests/             pytest
web/                 정적 웹 (Vite + React + TypeScript)
  src/engine/        판정 엔진(3상 판정·막는 조건·최소 변경 대안) + Vitest
  scripts/           실데이터 대표 사례 자동 탐색
docs/evidence/       출품 증빙(데이터 프로파일, 대표 사례, 점검표)
```

판정은 모두 브라우저에서 실행됩니다. 로그인·서버·외부 분석 도구가 없고 입력값을 저장하지 않습니다. 생성형 AI를 쓰지 않습니다.

## 실행

```bash
# 1) 데이터 빌드 (원본 CSV는 저장소 밖 ../data/raw/ 에 둔다)
python3 pipeline/build.py --ref 2026-10-01
python3 pipeline/evidence.py
python3 -m pytest pipeline/tests

# 2) 웹
cd web
npm install
npm test
npm run dev        # http://localhost:5173/playable/
node scripts/demo-scenarios.ts   # docs/evidence/demo_scenarios.md 갱신
```

## 데이터 갱신

프로그램 정보는 매월 갱신됩니다. 새 원본을 받아 `../data/raw/`에 두고 `pipeline/build.py`의 파일명·등록일을 바꾼 뒤 빌드하고 `main`에 푸시하면 GitHub Actions가 Pages로 배포합니다.

## 한계

- 실시간 정보가 아닙니다. 모집인원은 잔여 정원이 아닙니다.
- 공단 데이터에 등록된 시설(9개 시도 57개 시군구)만 찾습니다. 여기 없다고 지역에 강좌가 없다는 뜻은 아닙니다.
- 정보가 없거나 해석할 수 없는 값은 추정하지 않고 "확인 필요"로 표시합니다.
