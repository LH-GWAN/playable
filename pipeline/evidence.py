"""출품 증빙 템플릿 생성: 정확도 점검표(표본 20건)와 사용성 테스트 기록표.

원문 대조·테스트 결과는 사람이 직접 채운다. 이 스크립트는 빈 칸만 만든다.
사용법: python pipeline/evidence.py
"""
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "docs" / "evidence"
SITE = "https://lh-gwan.github.io/playable/"
SEED = 20261001
BASIS = {"zero": "무료/미기재 불명", "multi_month": "다개월 가격", "per_session": "회당 가격", "long_period": "1개월 초과 회차", "shifted": "원본 값 오류 의심", "missing": "없음", "period": "월", "type": "월"}
WD = dict(zip(["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "월화수목금토일"))


def accuracy_sample():
    programs = json.loads((DATA / "programs.json").read_text(encoding="utf-8"))
    facilities = json.loads((DATA / "facilities.json").read_text(encoding="utf-8"))
    pool = [p for p in programs if p["st"] == "cur"]
    sample = random.Random(SEED).sample(pool, 20)
    path = OUT / "accuracy_check.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow([
            "번호", "서비스 상세 URL", "시설명", "시군구", "강좌명", "서비스 표시 요일", "서비스 표시 시간", "서비스 표시 가격",
            "서비스 표시 대상", "회차", "원본 줄 번호", "시설 홈페이지", "시설 전화",
            "원문 확인 결과(요일)", "원문 확인 결과(시간)", "원문 확인 결과(가격)", "원문 확인 결과(대상)",
            "일치 여부(O/X/확인불가)", "불일치 내용", "확인일", "확인자",
        ])
        for i, p in enumerate(sample, 1):
            f = facilities[p["f"]]
            price = f"월 {p['pm']:,}원" if p["pm"] is not None else (f"{p['p']:,}원 표기({BASIS[p['pb']]})" if p["p"] is not None else "없음")
            w.writerow([
                i, f"{SITE}#/p/{p['id']}", f["nm"], f["sg"], p["n"],
                "·".join(WD[d] for d in p["wd"]) if p["wd"] else f"미상({p['wdr']})",
                p["tm"] or "미상", price, p["tgr"] or "미상", f"{p['b']}~{p['e']}", p["row"],
                f["url"] or "", f["tel"] or "",
                "", "", "", "", "", "", "", "",
            ])
    print(f"[out] {path.relative_to(ROOT)} (seed {SEED})")


USABILITY = """# 사용성 테스트 기록표 (방향성 점검용)

> 5~8명 대상. 통계적 효과 입증이 아니라 사용성·이해도 점검용이다. 결과는 실제로 진행한 것만 기록한다.

## 진행 방법
1. 참가자에게 같은 난이도의 과제 2개를 준다. 순서를 교차해 학습 효과를 줄인다.
   - A방식: 기존 검색(스포츠강좌이용권 누리집·시설 홈페이지 등)
   - B방식: 운동가능 ({site})
2. 과제 예시(실데이터 대표 사례에서 선정 — demo_scenarios.md 참고)
   - 과제 1: "과천시에 살고, 월·수·금 오전에 성인 댄스 강좌를 월 5만 원 이하로 찾아 주세요. 없으면 어떻게 하면 다닐 수 있는지 말해 주세요."
   - 과제 2: (demo_scenarios.md 사례 2)
3. 기록: 소요 시간, 반복 검색 횟수, 후보 발견 여부, 대안 이해 여부, 잘못 이해한 정보, 공식 사이트 이동 여부.
4. 실제 수강 신청은 직접 확인되지 않으면 성공으로 세지 않는다.

## 기록표

| 참가자 | 연령대 | 순서 | 과제 | 방식 | 소요 시간(초) | 반복 검색 수 | 후보 발견(Y/N) | 대안 의미 이해(Y/N) | 잘못 이해한 정보 | 공식 사이트 이동(Y/N) | 메모 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | A→B | 1 | A | | | | | | | |
| P1 | | A→B | 1 | B | | | | | | | |
| P2 | | B→A | 1 | B | | | | | | | |
| P2 | | B→A | 1 | A | | | | | | | |
| P3 | | | | | | | | | | | |
| P4 | | | | | | | | | | | |
| P5 | | | | | | | | | | | |

## 사전에 정한 판단 기준
- 조건에 맞지 않는 강좌를 '맞음'으로 안내한 사례가 있으면 해당 기능 공개 보류.
- 참가자 과반이 대안의 의미를 이해하지 못하면 기능 추가보다 설명·UI 수정.
""".format(site=SITE)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    accuracy_sample()
    (OUT / "usability_test.md").write_text(USABILITY, encoding="utf-8")
    print("[out] docs/evidence/usability_test.md")
