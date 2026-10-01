"""공단 원본 CSV → 서비스용 정규화 JSON + 데이터 프로파일 리포트.

사용법:  python pipeline/build.py [--ref 2026-10-01] [--raw ../data/raw]
원본 CSV는 레포 밖에 두고 읽기만 한다(정보 보안관리 약정: 원본 공개 금지).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from collections import Counter
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import pandas as pd

from normalize import (
    CATEGORIES,
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

ROOT = Path(__file__).resolve().parents[1]
D1_FILE = "KS_PUBLIC_ALSFC_PROGRM_INFO_202608.csv"
D2_FILE = "KS_WNTY_PUBLIC_PHSTRN_FCLTY_STTUS_202607.csv"
DATASETS = {
    "D1": {
        "name": "공공체육시설 프로그램 정보(202608)",
        "provider": "국민체육진흥공단 체육종합빅데이터센터",
        "url": "https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=c3b8fb69-307d-4ae7-ab42-d0314c89ef47",
        "portalUrl": "https://www.data.go.kr/data/99072/linkedData.do",
        "registered": "2026-09-18",
        "downloaded": "2026-10-01",
        "file": D1_FILE,
    },
    "D2": {
        "name": "전국공공체육시설 데이터(202607)",
        "provider": "서울올림픽기념국민체육진흥공단",
        "url": "https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=b5880ea0-247a-4258-9f7b-79eab6751591",
        "portalUrl": "https://www.data.go.kr/data/96298/linkedData.do",
        "registered": "2026-08-20",
        "downloaded": "2026-10-01",
        "file": D2_FILE,
    },
}
D1_COLS = [
    "FCLTY_NM", "INDUTY_NM", "FCLTY_TY_NM", "CTPRVN_CD", "CTPRVN_NM", "SIGNGU_CD", "SIGNGU_NM",
    "EMD_NM", "FCLTY_ADDR", "FCLTY_TEL_NO", "FCLTY_LA", "FCLTY_LO", "HMPG_URL",
    "PROGRM_TY_NM", "PROGRM_NM", "PROGRM_TRGET_NM", "PROGRM_BEGIN_DE", "PROGRM_END_DE",
    "PROGRM_ESTBL_WKDAY_NM", "PROGRM_ESTBL_TIZN_VALUE", "PROGRM_RCRIT_NMPR_CO",
    "PROGRM_PRC", "PROGRM_PRC_TY_NM",
] + [f"{p}_{n}R_{s}" for n in range(1, 6) for p, s in (
    ("PBTRNSP_FCLTY_SDIV", "NM"), ("BSTP_SUBWAYST", "NM"), ("WLKG_MVMN", "TIME"), ("WLKG_DSTNC", "VALUE"))]
KEY_COLS = ["FCLTY_NM", "SIGNGU_CD", "PROGRM_NM", "PROGRM_ESTBL_WKDAY_NM", "PROGRM_ESTBL_TIZN_VALUE", "PROGRM_TRGET_NM"]
NEXT_WINDOW_DAYS = 31
SINGLE_SPORT_FACILITY = {"수영장": "swim", "테니스장": "tennis", "골프연습장": "golf", "빙상장": "ice"}
NEXT_MIN_RECURRENCE = 3


def nz(v):
    """pandas 결측 → None, 문자열은 strip."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).replace("\xa0", " ").strip()
    return s or None


def fnum(v):
    v = nz(v)
    try:
        x = float(v) if v is not None else None
    except ValueError:
        return None
    return None if x is None or math.isnan(x) else x


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2) - np.radians(lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def month_index(ymd: str) -> int | None:
    if not ymd or not re.fullmatch(r"\d{8}", ymd):
        return None
    return int(ymd[:4]) * 12 + int(ymd[4:6]) - 1


def consecutive_months(months: set[int], latest: int) -> int:
    n = 0
    while latest - n in months:
        n += 1
    return n


def git_head() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return None


# ── 시설 ─────────────────────────────────────────────
def nearest_transit(row) -> dict | None:
    best = None
    for n in range(1, 6):
        sec = fnum(row.get(f"WLKG_MVMN_{n}R_TIME"))
        name = nz(row.get(f"BSTP_SUBWAYST_{n}R_NM"))
        if sec is None or name is None:
            continue
        if best is None or sec < best[0]:
            best = (sec, name, nz(row.get(f"PBTRNSP_FCLTY_SDIV_{n}R_NM")), fnum(row.get(f"WLKG_DSTNC_{n}R_VALUE")))
    if best is None:
        return None
    sec, name, kind, dist = best
    return {"nm": name, "kind": kind, "min": max(1, math.ceil(sec / 60)), "m": round(dist) if dist else None}


def match_d2(fac: pd.DataFrame, d2: pd.DataFrame) -> dict[int, dict]:
    """D1 시설 ↔ D2 시설 결합. (정규화 시설명+시군구) 일치 → 좌표 150m 이내+이름 유사."""
    d2 = d2.copy()
    d2["nn"] = d2["FCLTY_NM"].map(norm_facility_name)
    d2["sg"] = d2["ROAD_NM_SIGNGU_NM"].fillna(d2["POSESN_MBY_SIGNGU_NM"]).fillna("").str.replace(" ", "")
    d2["lat"] = pd.to_numeric(d2["FCLTY_LA"], errors="coerce")
    d2["lng"] = pd.to_numeric(d2["FCLTY_LO"], errors="coerce")
    d2["live"] = (d2["DEL_AT"] != "Y") & (d2["FCLTY_STATE_CD"] != "99")
    by_key = {}
    for i, r in d2.sort_values("live", ascending=False).iterrows():
        by_key.setdefault((r.nn, r.sg), i)
    has_xy = d2.dropna(subset=["lat", "lng"])

    out = {}
    for fid, f in fac.iterrows():
        nn = norm_facility_name(f.FCLTY_NM)
        sg = str(f.SIGNGU_NM or "").replace(" ", "")
        idx, how = by_key.get((nn, sg)), "name"
        if idx is None and fnum(f.lat) is not None and fnum(f.lng) is not None:
            dist = haversine_km(f.lat, f.lng, has_xy.lat.values, has_xy.lng.values)
            near = has_xy[dist <= 0.15]
            best, best_score = None, 0.0
            for j, r in near.iterrows():
                score = 1.0 if (r.nn and (r.nn in nn or nn in r.nn)) else SequenceMatcher(None, nn, r.nn).ratio()
                if score > best_score:
                    best, best_score = j, score
            if best is not None and best_score >= 0.6:
                idx, how = best, "coord"
        if idx is None:
            continue
        r = d2.loc[idx]
        out[fid] = {
            "how": how,
            "name": nz(r.FCLTY_NM),
            "tel": nz(r.RSPNSBLTY_TEL_NO),
            "url": nz(r.FCLTY_HMPG_URL),
            "addr": nz(r.RDNMADR_NM),
            "state": nz(r.FCLTY_STATE_CD),
            "del": nz(r.DEL_AT),
            "owner": nz(r.POSESN_MBY_NM),
            "dept": nz(r.RSPNSBLTY_DEPT_NM),
        }
    return out


def build(raw_dir: Path, ref: date, out_dir: Path, evidence_dir: Path):
    print(f"[load] {raw_dir}")
    d1 = pd.read_csv(raw_dir / D1_FILE, dtype=str, encoding="utf-8-sig", usecols=D1_COLS, keep_default_na=True)
    d1["row"] = d1.index + 2  # CSV 줄 번호(헤더=1)
    d2 = pd.read_csv(raw_dir / D2_FILE, dtype=str, encoding="utf-8-sig")
    raw_rows = len(d1)
    print(f"[load] D1 {raw_rows:,} rows, D2 {len(d2):,} rows")

    # ── 월별 반복 행 → 강좌 단위 ──
    d1["_end"] = d1["PROGRM_END_DE"].fillna("")
    d1["_m"] = d1["PROGRM_BEGIN_DE"].fillna("").map(month_index)
    keys = d1[KEY_COLS].fillna("∅").astype(str).agg("|".join, axis=1)
    d1["_key"] = keys
    months_by_key = d1.dropna(subset=["_m"]).groupby("_key")["_m"].agg(lambda s: set(int(x) for x in s))
    latest = d1.sort_values(["_end", "row"]).groupby("_key", sort=False).tail(1).set_index("_key")
    print(f"[dedup] {len(latest):,} distinct programs")

    ref_s = ref.strftime("%Y%m%d")
    next_floor = (ref - timedelta(days=NEXT_WINDOW_DAYS)).strftime("%Y%m%d")

    # ── 시설 테이블 ──
    fac_rows = d1.sort_values("_end").groupby(["FCLTY_NM", "SIGNGU_CD"], sort=False).tail(1)
    fac = fac_rows.reset_index(drop=True)
    fac["lat"] = fac["FCLTY_LA"].map(fnum)
    fac["lng"] = fac["FCLTY_LO"].map(fnum)
    fac_id = {(r.FCLTY_NM, r.SIGNGU_CD): i for i, r in fac.iterrows()}
    d2m = match_d2(fac, d2)
    print(f"[d2] matched {len(d2m)}/{len(fac)} facilities")

    # ── 강좌 정규화 ──
    programs = []
    excluded = Counter()
    basis_cnt = Counter()
    cat_src = Counter()
    unknown_cnt = Counter()
    time_src_cnt = Counter()
    for key, r in latest.iterrows():
        end = nz(r.PROGRM_END_DE) or ""
        months = months_by_key.get(key, set())
        rec = consecutive_months(months, max(months)) if months else 0
        if end >= ref_s:
            status = "cur"
        elif end >= next_floor and rec >= NEXT_MIN_RECURRENCE:
            status = "next"
        else:
            excluded["ended"] += 1
            continue

        shifted = is_shifted_row(nz(r.PROGRM_ESTBL_TIZN_VALUE), nz(r.PROGRM_PRC_TY_NM))
        wd = parse_weekdays(nz(r.PROGRM_ESTBL_WKDAY_NM))
        tm = None if shifted else parse_time(nz(r.PROGRM_ESTBL_TIZN_VALUE))
        tsrc = "col" if tm else None
        if tm is None and not shifted:
            st_name = parse_time_from_name(nz(r.PROGRM_NM))
            if st_name:
                tm, tsrc = (st_name, None), "name"
        time_src_cnt[tsrc or "none"] += 1
        pr = parse_price(nz(r.PROGRM_PRC), nz(r.PROGRM_PRC_TY_NM), nz(r.PROGRM_BEGIN_DE), end, shifted)
        tg = parse_target(nz(r.PROGRM_TRGET_NM))
        cats, src = classify(nz(r.PROGRM_NM), nz(r.PROGRM_TY_NM))
        if cats is None and nz(r.INDUTY_NM) in SINGLE_SPORT_FACILITY:
            # 종목명이 없지만 단일 종목 시설(수영장 등)의 강좌 → 엔진에서 '확인 필요'로만 취급
            cats, src = [SINGLE_SPORT_FACILITY[nz(r.INDUTY_NM)]], "facility"
        basis_cnt[pr["basis"]] += 1
        cat_src[src or "none"] += 1
        for k, v in (("weekday", wd), ("time", tm), ("price", pr["perMonth"]), ("target", tg), ("category", cats)):
            if v is None:
                unknown_cnt[k] += 1

        issues = []
        if shifted:
            issues.append("shifted")
        if nz(r.PROGRM_ESTBL_WKDAY_NM) and "휴장" in str(r.PROGRM_ESTBL_WKDAY_NM):
            issues.append("closed_notice")

        cap = fnum(r.PROGRM_RCRIT_NMPR_CO)
        programs.append({
            "id": len(programs),
            "f": fac_id[(r.FCLTY_NM, r.SIGNGU_CD)],
            "n": nz(r.PROGRM_NM),
            "ty": nz(r.PROGRM_TY_NM),
            "c": cats,
            "cs": src,
            "tg": tg,
            "tgr": nz(r.PROGRM_TRGET_NM),
            "wd": wd,
            "wdr": nz(r.PROGRM_ESTBL_WKDAY_NM),
            "tm": (f"{tm[0]}~{tm[1]}" if tm[1] else tm[0]) if tm else None,
            "tsrc": tsrc,
            "tb": time_bucket(tm[0]) if tm else None,
            "tmr": nz(r.PROGRM_ESTBL_TIZN_VALUE),
            "b": nz(r.PROGRM_BEGIN_DE),
            "e": end,
            "p": pr["price"],
            "pm": pr["perMonth"],
            "pb": pr["basis"],
            "pt": nz(r.PROGRM_PRC_TY_NM),
            "cap": int(cap) if cap is not None else None,
            "rec": rec,
            "st": status,
            "iss": issues or None,
            "row": int(r.row),
        })

    used_fac = sorted({p["f"] for p in programs})
    facilities = []
    remap = {}
    for fid in used_fac:
        f = fac.loc[fid]
        m = d2m.get(fid)
        tel, tel_src = nz(f.FCLTY_TEL_NO), "D1"
        if not tel and m and m["tel"]:
            tel, tel_src = m["tel"], "D2"
        url, url_src = nz(f.HMPG_URL), "D1"
        if not url and m and m["url"]:
            url, url_src = m["url"], "D2"
        state_note = None
        if m and (m["del"] == "Y" or m["state"] == "99"):
            state_note = f"D2 시설상태코드 {m['state']}, 삭제여부 {m['del']}"
        remap[fid] = len(facilities)
        facilities.append({
            "id": len(facilities),
            "nm": nz(f.FCLTY_NM),
            "ty": nz(f.INDUTY_NM),
            "sd": nz(f.CTPRVN_NM),
            "sgc": nz(f.SIGNGU_CD),
            "sg": nz(f.SIGNGU_NM),
            "emd": nz(f.EMD_NM),
            "addr": nz(f.FCLTY_ADDR),
            "tel": tel,
            "telSrc": tel_src if tel else None,
            "url": url,
            "urlSrc": url_src if url else None,
            "lat": fnum(f.lat),
            "lng": fnum(f.lng),
            "tr": nearest_transit(f),
            "d2": ({"how": m["how"], "name": m["name"], "owner": m["owner"], "dept": m["dept"], "state": state_note}
                   if m else None),
        })
    for p in programs:
        p["f"] = remap[p["f"]]

    # ── 시군구 · 인접 거리표 ──
    sg = {}
    for f in facilities:
        s = sg.setdefault(f["sgc"], {"code": f["sgc"], "sido": f["sd"], "name": f["sg"], "lat": [], "lng": [], "fac": 0, "prog": 0})
        s["fac"] += 1
        if f["lat"] and f["lng"]:
            s["lat"].append(f["lat"])
            s["lng"].append(f["lng"])
    for p in programs:
        sg[facilities[p["f"]]["sgc"]]["prog"] += 1
    sigungu = []
    for s in sg.values():
        s["clat"] = float(np.mean(s.pop("lat"))) if s["lat"] else None
        s["clng"] = float(np.mean(s.pop("lng"))) if s["lng"] else None
        sigungu.append(s)
    for s in sigungu:
        near = []
        for t in sigungu:
            if t is s or s["clat"] is None or t["clat"] is None:
                continue
            near.append((float(haversine_km(s["clat"], s["clng"], t["clat"], t["clng"])), t["code"]))
        s["near"] = [{"code": c, "km": round(km, 1)} for km, c in sorted(near)[:5]]
    sigungu.sort(key=lambda s: (s["sido"], s["name"]))

    cat_counts = Counter(c for p in programs for c in (p["c"] or []))
    meta = {
        "refDate": ref.isoformat(),
        "builtAt": datetime.now().isoformat(timespec="seconds"),
        "buildCommit": git_head(),
        "datasets": DATASETS,
        "counts": {
            "d1Rows": raw_rows,
            "d2Rows": len(d2),
            "distinctPrograms": len(latest),
            "programs": len(programs),
            "current": sum(p["st"] == "cur" for p in programs),
            "nextUnconfirmed": sum(p["st"] == "next" for p in programs),
            "excludedEnded": excluded["ended"],
            "facilities": len(facilities),
            "facilitiesD2Matched": sum(1 for f in facilities if f["d2"]),
            "sido": len({s["sido"] for s in sigungu}),
            "sigungu": len(sigungu),
            "priceBasis": dict(basis_cnt),
            "categorySource": dict(cat_src),
            "timeSource": dict(time_src_cnt),
            "unknownByField": dict(unknown_cnt),
            "shiftedRows": sum(1 for p in programs if p["iss"] and "shifted" in p["iss"]),
        },
        "rules": {"nextWindowDays": NEXT_WINDOW_DAYS, "nextMinRecurrence": NEXT_MIN_RECURRENCE, "monthlyMaxDays": 35},
        "categories": [{"id": cid, "label": lb, "count": cat_counts.get(cid, 0)} for cid, lb, _ in CATEGORIES],
        "sigungu": sigungu,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    dump = lambda obj, name: (out_dir / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    dump(programs, "programs.json")
    dump(facilities, "facilities.json")
    dump(meta, "meta.json")
    for name in ("programs.json", "facilities.json", "meta.json"):
        print(f"[out] {name}: {(out_dir / name).stat().st_size / 1e6:.2f} MB")
    print(json.dumps(meta["counts"], ensure_ascii=False, indent=1))

    write_profile(d1, d2, latest, meta, evidence_dir / "data_profile.md")


# ── 프로파일 리포트 ─────────────────────────────────
DRAFT_KOR = {
    "PROGRM_NM": "프로그램명", "PROGRM_TY_NM": "프로그램유형명", "PROGRM_TRGET_NM": "프로그램대상명",
    "PROGRM_BEGIN_DE": "프로그램시작일자", "PROGRM_END_DE": "프로그램종료일자", "PROGRM_ESTBL_WKDAY_NM": "프로그램개설요일명",
    "PROGRM_ESTBL_TIZN_VALUE": "프로그램개설시간대값", "PROGRM_PRC": "프로그램가격", "PROGRM_PRC_TY_NM": "프로그램가격유형명",
    "PROGRM_RCRIT_NMPR_CO": "모집인원 → 실제: 프로그램모집인원수", "FCLTY_NM": "시설명", "SIGNGU_NM": "시군구 → 실제: 시군구명",
    "FCLTY_ADDR": "시설주소", "FCLTY_LA": "시설위도", "FCLTY_LO": "시설경도", "HMPG_URL": "홈페이지URL",
}


def write_profile(d1, d2, latest, meta, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    c = meta["counts"]
    L = [
        "# 데이터 프로파일 리포트",
        "",
        f"- 생성: {meta['builtAt']} (pipeline/build.py 자동 생성)",
        f"- 판정 기준일: {meta['refDate']}",
        "",
        "## 원본 파일",
        "",
        "| ID | 데이터 상품 | 파일 | 등록일 | 다운로드일 | 행 수 |",
        "|---|---|---|---|---|---|",
    ]
    for k, ds in meta["datasets"].items():
        rows = c["d1Rows"] if k == "D1" else c["d2Rows"]
        L.append(f"| {k} | {ds['name']} | `{ds['file']}` | {ds['registered']} | {ds['downloaded']} | {rows:,} |")
    L += ["", "## 보고서 초안 컬럼명 ↔ 실제 컬럼", "", "| 실제 영문 컬럼 | 초안 한글명 |", "|---|---|"]
    L += [f"| `{k}` | {v} |" for k, v in DRAFT_KOR.items()]
    L += ["", "## D1 컬럼별 결측률", "", "| 컬럼 | 결측률 |", "|---|---|"]
    for col in ["PROGRM_TY_NM", "PROGRM_TRGET_NM", "PROGRM_ESTBL_WKDAY_NM", "PROGRM_ESTBL_TIZN_VALUE", "PROGRM_PRC",
                "PROGRM_PRC_TY_NM", "FCLTY_TEL_NO", "HMPG_URL", "BSTP_SUBWAYST_1R_NM"]:
        L.append(f"| `{col}` | {d1[col].isna().mean() * 100:.1f}% |")
    end = pd.to_datetime(d1["PROGRM_END_DE"], format="%Y%m%d", errors="coerce")
    L += ["", "## D1 종료월 분포(원본 행 기준)", "", "| 종료월 | 행 수 |", "|---|---|"]
    for k, v in end.dt.to_period("M").value_counts().sort_index().items():
        L.append(f"| {k} | {v:,} |")
    bm = d1["PROGRM_BEGIN_DE"].str[:6]
    per_fac = d1.assign(bm=bm).groupby(["bm", "FCLTY_NM"]).size().unstack(0)
    if {"202608", "202609"} <= set(per_fac.columns):
        ratio = (per_fac["202609"] / per_fac["202608"]).dropna()
        L += ["", f"- **데이터 품질 발견:** 2026-09 회차 행 수가 시설별로 2026-08의 중앙값 {ratio.median():.1f}배 "
              f"(같은 강좌 행이 반복 수록된 것으로 보임). 강좌 키 기준 중복 제거로 처리."]
    dur = (end - pd.to_datetime(d1["PROGRM_BEGIN_DE"], format="%Y%m%d", errors="coerce")).dt.days
    L += ["", f"- 회차 기간(종료-시작) 35일 이하 비율: {(dur <= 35).mean() * 100:.2f}% → 한 행은 사실상 1개월 회차",
          f"- 가격 0원 행: {(pd.to_numeric(d1['PROGRM_PRC'], errors='coerce') == 0).sum():,} (무료/미기재 구분 불가 → '확인 필요' 처리)",
          f"- 도보이동시간 단위: 도보거리/도보시간 중앙값 ≈ "
          f"{(pd.to_numeric(d1['WLKG_DSTNC_1R_VALUE'], errors='coerce') / pd.to_numeric(d1['WLKG_MVMN_1R_TIME'], errors='coerce')).median():.2f} m/s → 거리=m, 시간=초로 판단"]
    for col in ["PROGRM_ESTBL_WKDAY_NM", "PROGRM_ESTBL_TIZN_VALUE", "PROGRM_PRC_TY_NM", "PROGRM_TRGET_NM", "PROGRM_TY_NM"]:
        L += ["", f"### `{col}` 상위 30개", "", "| 값 | 행 수 |", "|---|---|"]
        for k, v in d1[col].value_counts().head(30).items():
            L.append(f"| {str(k).replace('|', '/').replace('<br>', ' ')} | {v:,} |")
    L += ["", "## D1 시도별 행 수", "", "| 시도 | 행 수 |", "|---|---|"]
    for k, v in d1["CTPRVN_NM"].value_counts().items():
        L.append(f"| {k} | {v:,} |")
    L += ["", "## D2 시설상태코드 × 삭제여부", "", "```", pd.crosstab(d2["FCLTY_STATE_CD"], d2["DEL_AT"]).to_string(), "```",
          "", "코드값 정의를 확인하지 못했으므로 상태코드 99 또는 삭제여부 Y로 결합된 시설은 제외하지 않고 '시설 상태 확인 필요'로 표시한다."]
    L += ["", "## 정규화 결과", "",
          f"- 원본 {c['d1Rows']:,}행 → 강좌 키 기준 {c['distinctPrograms']:,}개 강좌(월별 반복 행 통합)",
          f"- 서비스 표시 {c['programs']:,}개 = 현재 회차 {c['current']:,} + 다음 회차 확인 필요 {c['nextUnconfirmed']:,}",
          f"- 기간 종료로 제외: {c['excludedEnded']:,}",
          f"- 시설 {c['facilities']:,}곳 (D2 결합 {c['facilitiesD2Matched']:,}곳), {c['sido']}개 시도 · {c['sigungu']}개 시군구",
          f"- 열 밀림 의심 행(시간대·가격유형에 % 값): {c['shiftedRows']:,} → 시간·가격 판정 안 함",
          "", "### 가격 판정 근거", "", "| basis | 강좌 수 | 의미 |", "|---|---|---|"]
    basis_desc = {"period": "회차 기간 ≤35일 → 월 가격", "type": "가격유형에 1개월 표기 → 월 가격", "zero": "0원(무료/미기재 불명) → 확인 필요",
                  "multi_month": "다개월 가격 → 비교 안 함", "per_session": "회당 가격 → 비교 안 함", "long_period": "회차 >35일 → 비교 안 함",
                  "shifted": "열 밀림 → 비교 안 함", "missing": "가격 없음"}
    for k, v in sorted(c["priceBasis"].items(), key=lambda x: -x[1]):
        L.append(f"| {k} | {v:,} | {basis_desc.get(k, '')} |")
    L += ["", "### 판정 불가(=확인 필요) 필드 수", "", "| 필드 | 강좌 수 |", "|---|---|"]
    for k, v in c["unknownByField"].items():
        L.append(f"| {k} | {v:,} |")
    L += ["", "### 시간대 근거", "", "| 근거 | 강좌 수 |", "|---|---|"]
    for k, v in c["timeSource"].items():
        L.append(f"| {dict(col='시간대 컬럼', name='강좌명에 적힌 시작 시각(예: 19시)', none='판정 불가').get(k, k)} | {v:,} |")
    L += ["", "### 종목 분류 근거", "", "| 근거 | 강좌 수 |", "|---|---|"]
    for k, v in c["categorySource"].items():
        L.append(f"| {k} | {v:,} |")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"[out] {path.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT.parent / "data" / "raw"))
    ap.add_argument("--ref", default=date.today().isoformat(), help="판정 기준일 YYYY-MM-DD")
    a = ap.parse_args()
    build(Path(a.raw), date.fromisoformat(a.ref), ROOT / "web" / "public" / "data", ROOT / "docs" / "evidence")
