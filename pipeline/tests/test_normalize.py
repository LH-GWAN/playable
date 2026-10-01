import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from normalize import (  # noqa: E402
    classify,
    is_shifted_row,
    norm_facility_name,
    parse_price,
    parse_target,
    parse_time,
    parse_time_from_name,
    parse_weekdays,
    time_bucket,
)


class TestWeekdays:
    def test_concatenated(self):
        assert parse_weekdays("화목") == ["tue", "thu"]
        assert parse_weekdays("월수금") == ["mon", "wed", "fri"]

    def test_prefix_yoil(self):
        assert parse_weekdays("요일월수금") == ["mon", "wed", "fri"]

    def test_range_and_words(self):
        assert parse_weekdays("월~금") == ["mon", "tue", "wed", "thu", "fri"]
        assert parse_weekdays("평일") == ["mon", "tue", "wed", "thu", "fri"]
        assert parse_weekdays("주말") == ["sat", "sun"]
        assert parse_weekdays("월,수") == ["mon", "wed"]

    def test_unparseable_is_none(self):
        assert parse_weekdays(None) is None
        assert parse_weekdays("성인:") is None
        assert parse_weekdays("수영장임시휴장중입니다.") is None
        assert parse_weekdays("") is None


class TestTime:
    def test_tilde_and_hyphen(self):
        assert parse_time("10:00~10:50") == ("10:00", "10:50")
        assert parse_time("16:00-16:50") == ("16:00", "16:50")

    def test_garbage(self):
        assert parse_time("010%") is None
        assert parse_time(None) is None
        assert parse_time("10:50~10:00") is None

    def test_from_name(self):
        assert parse_time_from_name("19시 월수금 상급2") == "19:00"
        assert parse_time_from_name("청소년성인드럼 수14시30분") == "14:30"
        assert parse_time_from_name("굿모닝수영 07시 [화  목] 중급") == "07:00"
        assert parse_time_from_name("성인수영 06:00") == "06:00"

    def test_from_name_rejects_ambiguous(self):
        assert parse_time_from_name("2시간 집중반") is None
        assert parse_time_from_name("시설 개방") is None
        assert parse_time_from_name("10시/19시 통합반") is None
        assert parse_time_from_name("어린이 6세반") is None
        assert parse_time_from_name(None) is None

    def test_bucket(self):
        assert time_bucket("06:00") == "dawn"
        assert time_bucket("09:00") == "morning"
        assert time_bucket("12:00") == "afternoon"
        assert time_bucket("18:00") == "evening"


class TestPrice:
    def test_zero_vs_missing(self):
        z = parse_price("0.00000", None, "20261001", "20261031")
        assert z == {"price": 0, "perMonth": None, "basis": "zero"}
        m = parse_price(None, None, "20261001", "20261031")
        assert m == {"price": None, "perMonth": None, "basis": "missing"}

    def test_period_le_35_days_is_monthly(self):
        r = parse_price("70000.00000", None, "20261001", "20261031")
        assert r == {"price": 70000, "perMonth": 70000, "basis": "period"}

    def test_type_one_month(self):
        r = parse_price("50000", "성인 (1개월)", "20261001", "20261231")
        assert r["perMonth"] == 50000 and r["basis"] == "type"

    def test_multi_month_not_compared(self):
        r = parse_price("150000", "성인 (3개월)", "20261001", "20261031")
        assert r["perMonth"] is None and r["basis"] == "multi_month"

    def test_per_session_not_compared(self):
        r = parse_price("5000", "회당", "20261001", "20261031")
        assert r["perMonth"] is None and r["basis"] == "per_session"

    def test_long_period_not_compared(self):
        r = parse_price("90000", None, "20261001", "20261231")
        assert r["perMonth"] is None and r["basis"] == "long_period"

    def test_shifted_row(self):
        assert is_shifted_row("080%", "0/80%       0/80%")
        assert not is_shifted_row("10:00~10:50", "성인 (1개월)")
        r = parse_price("875.00000", "6/%", "20261001", "20261031", shifted=True)
        assert r["price"] is None and r["basis"] == "shifted"


class TestTarget:
    def test_simple(self):
        assert parse_target("성인") == ["adult"]
        assert parse_target("초등학생") == ["child"]

    def test_and_above(self):
        assert parse_target("청소년이상") == ["teen", "adult"]
        assert parse_target("만 13세이상") == ["teen", "adult"]

    def test_range(self):
        assert parse_target("7세~초등") == ["child"]
        assert parse_target("초등2년~성인") == ["child", "teen", "adult"]
        assert parse_target("대상성인(19~99세)") == ["adult", "senior"]

    def test_lists(self):
        assert parse_target("성인/실버") == ["adult", "senior"]
        assert parse_target("성인,<br>중,고생<br>청소년(13세이상)") == ["teen", "adult"]

    def test_everyone_and_unknown(self):
        assert parse_target("누구나") == ["preschool", "child", "teen", "adult", "senior"]
        assert parse_target(None) is None
        assert parse_target("A반") is None


class TestClassify:
    def test_name_first(self):
        assert classify("성인 수영 초급", "체육관") == (["swim"], "name")

    def test_type_fallback(self):
        assert classify("17시_월수_개인레슨(김공수)", "배드민턴레슨") == (["badminton"], "type")

    def test_multi(self):
        cats, _ = classify("요가및필라테스", None)
        assert set(cats) == {"yoga", "pilates"}

    def test_none(self):
        assert classify("A반", "통합") == (None, None)


def test_norm_facility_name():
    assert norm_facility_name("(취약시설)(취약시설)열린금호교육문화관수영장") == "열린금호교육문화관수영장"
    assert norm_facility_name("\xa0지곡마을 체육시설") == "지곡마을체육시설"
