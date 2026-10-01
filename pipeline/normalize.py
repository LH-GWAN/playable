"""공단 원본 값 → 서비스 판정용 값 정규화.

원칙: 해석할 수 없는 값은 추정하지 않고 None(=확인 필요)으로 돌려준다.
"""
from __future__ import annotations

import re
from datetime import date

# ── 요일 ─────────────────────────────────────────────
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_KOR_DAY = dict(zip("월화수목금토일", WEEKDAYS))


def parse_weekdays(raw: str | None) -> list[str] | None:
    """'화목' → ['tue','thu'], '요일월수금' → [...], '월~금' → 평일. 해석 불가면 None."""
    if raw is None:
        return None
    s = re.sub(r"\s+", "", str(raw))
    if s.startswith("요일"):
        s = s[2:]
    if not s:
        return None
    if s in ("매일", "월~일", "월-일"):
        return list(WEEKDAYS)
    if s == "평일":
        return WEEKDAYS[:5]
    if s == "주말":
        return WEEKDAYS[5:]
    m = re.fullmatch(r"([월화수목금토일])[~\-]([월화수목금토일])", s)
    if m:
        a, b = WEEKDAYS.index(_KOR_DAY[m[1]]), WEEKDAYS.index(_KOR_DAY[m[2]])
        return WEEKDAYS[a : b + 1] if a <= b else None
    s = re.sub(r"[,./·]", "", s)
    if s and re.fullmatch(r"[월화수목금토일]+", s):
        return [d for d in WEEKDAYS if any(_KOR_DAY[c] == d for c in s)]
    return None


# ── 시간대 ───────────────────────────────────────────
TIME_BUCKETS = [  # (id, 시작분, 끝분)
    ("dawn", 0, 9 * 60),
    ("morning", 9 * 60, 12 * 60),
    ("afternoon", 12 * 60, 18 * 60),
    ("evening", 18 * 60, 24 * 60),
]


def parse_time(raw: str | None) -> tuple[str, str] | None:
    """'10:00~10:50' / '16:00-16:50' → ('10:00','10:50'). 그 외는 None."""
    if raw is None:
        return None
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})\s*", str(raw))
    if not m:
        return None
    h1, m1, h2, m2 = map(int, m.groups())
    if not (0 <= h1 <= 24 and 0 <= h2 <= 24 and m1 < 60 and m2 < 60):
        return None
    if h2 * 60 + m2 <= h1 * 60 + m1:
        return None
    return f"{h1:02d}:{m1:02d}", f"{h2:02d}:{m2:02d}"


_NAME_HHMM = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
_NAME_HOUR = re.compile(r"(?<!\d)(\d{1,2})\s*시(?!간|설|작|즌|범|청|민|립|니)\s*(?:(\d{1,2})\s*분|(반))?")


def parse_time_from_name(name: str | None) -> str | None:
    """시간대 컬럼이 비었을 때 강좌명의 '19시', '14시30분', '07:00'에서 시작 시각만 추출.

    시각이 둘 이상 나오면 어느 것이 강좌 시간인지 알 수 없으므로 None.
    """
    if not name:
        return None
    s = str(name)
    found = {f"{int(h):02d}:{m}" for h, m in _NAME_HHMM.findall(s)}
    for h, m, half in _NAME_HOUR.findall(s):
        found.add(f"{int(h):02d}:{int(m) if m else (30 if half else 0):02d}")
    found = {t for t in found if 5 <= int(t[:2]) <= 23 and int(t[3:]) < 60}
    return found.pop() if len(found) == 1 else None


def time_bucket(start: str) -> str:
    """시작 시각이 속한 시간대 버킷."""
    h, m = map(int, start.split(":"))
    t = h * 60 + m
    for bid, a, b in TIME_BUCKETS:
        if a <= t < b:
            return bid
    return "evening"


# ── 가격 ─────────────────────────────────────────────
def is_shifted_row(time_raw: str | None, price_type_raw: str | None) -> bool:
    """'0/10%' 같은 값이 시간대·가격유형에 들어간 행은 열이 밀린 오류로 본다."""
    return any(v is not None and "%" in str(v) for v in (time_raw, price_type_raw))


def _ymd(s: str | None) -> date | None:
    if not s or not re.fullmatch(r"\d{8}", str(s)):
        return None
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:]))
    except ValueError:
        return None


def parse_price(
    price_raw: str | None,
    price_type_raw: str | None,
    begin: str | None,
    end: str | None,
    shifted: bool = False,
) -> dict:
    """회차 가격과 '월 예산과 비교 가능한 월 가격'을 판정한다.

    반환: {price, perMonth, basis}
      basis: type(가격유형에 1개월 표기) / period(회차 기간 35일 이하) /
             zero(0원 — 무료인지 미기재인지 불명) / multi_month / per_session /
             long_period / shifted / missing
    """
    if shifted:
        return {"price": None, "perMonth": None, "basis": "shifted"}
    try:
        price = int(round(float(price_raw))) if price_raw not in (None, "") else None
    except ValueError:
        price = None
    if price is None:
        return {"price": None, "perMonth": None, "basis": "missing"}
    if price == 0:
        return {"price": 0, "perMonth": None, "basis": "zero"}

    ty = re.sub(r"\s+", "", str(price_type_raw or ""))
    months = [int(n) for n in re.findall(r"(\d+)개월", ty)]
    if any(n >= 2 for n in months) or re.search(r"분기|반기|연간|년", ty):
        return {"price": price, "perMonth": None, "basis": "multi_month"}
    if re.search(r"회당|1회권|일일|일회", ty):
        return {"price": price, "perMonth": None, "basis": "per_session"}
    if 1 in months or re.search(r"월\d*회|월정|한달|1달", ty):
        return {"price": price, "perMonth": price, "basis": "type"}

    b, e = _ymd(begin), _ymd(end)
    if b and e and 0 <= (e - b).days <= 35:
        return {"price": price, "perMonth": price, "basis": "period"}
    return {"price": price, "perMonth": None, "basis": "long_period"}


# ── 대상 ─────────────────────────────────────────────
TARGET_GROUPS = ["preschool", "child", "teen", "adult", "senior"]
_TG_KEYWORDS = [  # (level, regex)
    (0, r"유아|유치|미취학"),
    (1, r"어린이|초등|아동|키즈|주니어"),
    (2, r"청소년|중학|고등|중고|중[-,.·/]?고|중등|고교"),
    (3, r"성인|일반|어른|대학"),
    (4, r"노인|경로|실버|어르신|시니어|노년"),
]


def _age_level(age: int) -> int:
    if age <= 6:
        return 0
    if age <= 12:
        return 1
    if age <= 18:
        return 2
    if age <= 64:
        return 3
    return 4


def parse_target(raw: str | None) -> list[str] | None:
    """자유 서술 대상명 → 연령대 그룹 목록. 해석 불가면 None."""
    if raw is None:
        return None
    s = re.sub(r"<br\s*/?>|\s+", "", str(raw))
    if not s:
        return None
    levels: set[int] = set()
    for lv, pat in _TG_KEYWORDS:
        if re.search(pat, s):
            levels.add(lv)
    for n in re.findall(r"(\d{1,2})세", s):
        levels.add(_age_level(int(n)))
    for a, b in re.findall(r"(\d{1,2})~(\d{1,2})세", s):
        levels.add(_age_level(int(a)))
        levels.add(_age_level(int(b)))
    if not levels:
        if re.search(r"전체|누구나|제한없음|남녀노소|전연령", s):
            return list(TARGET_GROUPS)
        return None
    lo, hi = min(levels), max(levels)
    if "~" in s or "-" in s:
        levels = set(range(lo, hi + 1))
    if "이상" in s:
        levels |= set(range(lo, max(hi, 3) + 1))
    return [TARGET_GROUPS[i] for i in sorted(levels)]


# ── 종목 ─────────────────────────────────────────────
CATEGORIES = [  # (id, 표시명, 키워드 정규식) — 앞에 있을수록 우선 아님, 모두 검사
    ("aquarobics", "아쿠아로빅", r"아쿠아"),
    ("swim", "수영", r"수영|수중|자유형|접영|평영|배영|50M"),
    ("yoga", "요가", r"요가"),
    ("pilates", "필라테스", r"필라테스"),
    ("fitness", "헬스·피트니스", r"헬스|휘트니스|피트니스|웨이트|근력|바디핏|스피닝|써킷|서킷|크로스핏|체력단련|PT"),
    ("dance", "댄스·에어로빅", r"댄스|줌바|에어로빅|발레|무용|재즈|힙합|라인댄스|밸리"),
    ("badminton", "배드민턴", r"배드민턴"),
    ("tabletennis", "탁구", r"탁구"),
    ("tennis", "테니스", r"테니스"),
    ("squash", "스쿼시·라켓볼", r"스쿼시|라켓볼"),
    ("golf", "골프", r"골프"),
    ("soccer", "축구·풋살", r"축구|풋살"),
    ("basketball", "농구", r"농구"),
    ("volleyball", "배구", r"배구"),
    ("taekwondo", "태권도", r"태권도"),
    ("martial", "무술·격투", r"검도|합기도|유도|주짓수|복싱|킥복싱|우슈|격투|무술"),
    ("ice", "빙상", r"빙상|스케이트|피겨|쇼트트랙|아이스하키"),
    ("climbing", "클라이밍", r"클라이밍|암벽"),
    ("gymnastics", "체조·스트레칭", r"체조|스트레칭|요가체조|기체조"),
    ("jumprope", "줄넘기", r"줄넘기"),
]
_CAT_RE = [(cid, re.compile(pat, re.IGNORECASE)) for cid, _, pat in CATEGORIES]


def _cats(text: str | None) -> list[str]:
    if not text:
        return []
    return [cid for cid, rx in _CAT_RE if rx.search(str(text))]


def classify(program_name: str | None, program_type: str | None) -> tuple[list[str] | None, str | None]:
    """프로그램명 키워드 우선, 없으면 프로그램유형명. 둘 다 없으면 (None, None)."""
    c = _cats(program_name)
    if c:
        return c, "name"
    c = _cats(program_type)
    if c:
        return c, "type"
    return None, None


# ── 시설명 정규화(결합용) ─────────────────────────────
def norm_facility_name(name: str | None) -> str:
    s = str(name or "").replace("\xa0", " ")
    s = re.sub(r"[\(\[［【][^\)\]］】]*[\)\]］】]", "", s)
    s = re.sub(r"[^0-9A-Za-z가-힣]", "", s)
    return s.lower()
