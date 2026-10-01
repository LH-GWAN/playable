// 파이프라인(pipeline/build.py) 출력 JSON 형식

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type TimeBucket = 'dawn' | 'morning' | 'afternoon' | 'evening'
export type TargetGroup = 'preschool' | 'child' | 'teen' | 'adult' | 'senior'
export type PriceBasis =
  | 'period' | 'type' | 'zero' | 'multi_month' | 'per_session' | 'long_period' | 'shifted' | 'missing'

export interface Program {
  id: number
  f: number // facility id
  n: string | null // 프로그램명
  ty: string | null // 프로그램유형명(원본)
  c: string[] | null // 종목 id
  cs: 'name' | 'type' | 'facility' | null // 종목 분류 근거
  tg: TargetGroup[] | null
  tgr: string | null // 대상(원본)
  wd: Weekday[] | null
  wdr: string | null // 요일(원본)
  tm: string | null // 'HH:MM~HH:MM' 또는 'HH:MM'(강좌명에서 추출)
  tsrc: 'col' | 'name' | null
  tb: TimeBucket | null
  tmr: string | null // 시간대(원본)
  b: string | null // 시작일 YYYYMMDD
  e: string // 종료일 YYYYMMDD
  p: number | null // 회차 가격
  pm: number | null // 월 예산과 비교 가능한 월 가격
  pb: PriceBasis
  pt: string | null // 가격유형(원본)
  cap: number | null // 모집인원(잔여 정원 아님)
  rec: number // 최근 연속 개설 개월 수
  st: 'cur' | 'next'
  iss: ('shifted' | 'closed_notice')[] | null
  row: number // 원본 CSV 줄 번호
}

export interface Transit {
  nm: string
  kind: string | null
  min: number
  m: number | null
}

export interface Facility {
  id: number
  nm: string
  ty: string | null
  sd: string
  sgc: string
  sg: string
  emd: string | null
  addr: string | null
  tel: string | null
  telSrc: 'D1' | 'D2' | null
  url: string | null
  urlSrc: 'D1' | 'D2' | null
  lat: number | null
  lng: number | null
  tr: Transit | null
  d2: { how: 'name' | 'coord'; name: string; owner: string | null; dept: string | null; state: string | null } | null
}

export interface Sigungu {
  code: string
  sido: string
  name: string
  fac: number
  prog: number
  clat: number | null
  clng: number | null
  near: { code: string; km: number }[]
}

export interface Dataset {
  name: string
  provider: string
  url: string
  portalUrl: string
  registered: string
  downloaded: string
  file: string
}

export interface Meta {
  refDate: string
  builtAt: string
  buildCommit: string | null
  datasets: Record<'D1' | 'D2', Dataset>
  counts: {
    d1Rows: number
    d2Rows: number
    distinctPrograms: number
    programs: number
    current: number
    nextUnconfirmed: number
    excludedEnded: number
    facilities: number
    facilitiesD2Matched: number
    sido: number
    sigungu: number
    priceBasis: Record<string, number>
    categorySource: Record<string, number>
    timeSource: Record<string, number>
    unknownByField: Record<string, number>
    shiftedRows: number
  }
  rules: { nextWindowDays: number; nextMinRecurrence: number; monthlyMaxDays: number }
  categories: { id: string; label: string; count: number }[]
  sigungu: Sigungu[]
}

export interface DataBundle {
  programs: Program[]
  facilities: Facility[]
  meta: Meta
}
