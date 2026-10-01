import type { PriceBasis, TargetGroup, TimeBucket, Weekday } from '../types'

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
}

export const TIME_LABEL: Record<TimeBucket, string> = {
  dawn: '새벽·이른 아침', morning: '오전', afternoon: '오후', evening: '저녁',
}

export const TIME_RANGE: Record<TimeBucket, string> = {
  dawn: '~9시', morning: '9~12시', afternoon: '12~18시', evening: '18시~',
}

export const TARGET_LABEL: Record<TargetGroup, string> = {
  preschool: '유아(미취학)', child: '어린이(초등)', teen: '청소년(중·고)', adult: '성인', senior: '어르신',
}

export const COND_LABEL = {
  region: '지역',
  category: '종목',
  target: '대상',
  weekday: '요일',
  time: '시간대',
  budget: '월 예산',
  transit: '역·정류장 거리',
} as const

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  period: '회차 기간이 1개월 이내라 회차 가격을 월 가격으로 봄',
  type: '가격유형에 1개월 표기',
  zero: '0원 표기(무료/미기재 불명)',
  multi_month: '다개월 가격',
  per_session: '회당 가격',
  long_period: '회차 기간 1개월 초과',
  shifted: '원본 값 오류 의심',
  missing: '가격 없음',
}

// 파이프라인 normalize.CATEGORIES와 같은 목록
export const CATEGORY_LABEL: Record<string, string> = {
  aquarobics: '아쿠아로빅', swim: '수영', yoga: '요가', pilates: '필라테스', fitness: '헬스·피트니스',
  dance: '댄스·에어로빅', badminton: '배드민턴', tabletennis: '탁구', tennis: '테니스', squash: '스쿼시·라켓볼',
  golf: '골프', soccer: '축구·풋살', basketball: '농구', volleyball: '배구', taekwondo: '태권도',
  martial: '무술·격투', ice: '빙상', climbing: '클라이밍', gymnastics: '체조·스트레칭', jumprope: '줄넘기',
}

export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}
