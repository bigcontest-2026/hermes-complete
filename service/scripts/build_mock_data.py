"""Build reproducible synthetic observations on real Seoul administrative boundaries.

Usage: python3 scripts/build_mock_data.py /path/to/HangJeongDong_ver20260701.geojson
Original source and license are recorded in shared/mock/provenance.json.
No observed resident data or trained model is used.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "shared" / "mock"
SOURCE_COMMIT = "dd1881663fcabc69b81393604e91ebf3a4202e9a"
SOURCE_URL = f"https://raw.githubusercontent.com/vuski/admdongkor/{SOURCE_COMMIT}/ver20260701/HangJeongDong_ver20260701.geojson"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def coordinates(value: list) -> list:
    if isinstance(value[0], (int, float)):
        return [round(number, 5) for number in value]
    return [coordinates(item) for item in value]


def make_policy(identifier: str, title: str, target: str, tags: list[str], description: str, end: str = "2026-12-31") -> dict:
    return {
        "id": identifier, "title": "[가상] " + title, "districts": ["*"],
        "target": target, "tags": tags, "description": description,
        "start_date": "2026-01-01", "end_date": end,
        "source_url": None, "is_mock": True, "contact": "시연용 — 실제 접수처 없음",
    }


def main(source: Path) -> None:
    raw = source.read_bytes()
    source_data = json.loads(raw)
    features = []
    rows = []
    for feature in source_data["features"]:
        properties = feature["properties"]
        if str(properties["sido"]) != "11":
            continue
        code = str(properties["adm_cd2"])
        name = properties["adm_nm"].split(" ", 2)[2]
        district = properties["sggnm"]
        features.append({
            "type": "Feature", "id": code,
            "properties": {"code": code, "name": name, "district": district},
            "geometry": {"type": feature["geometry"]["type"], "coordinates": coordinates(feature["geometry"]["coordinates"])},
        })
        seed = int(hashlib.sha256(("donghaeng-demo-v1:" + code).encode()).hexdigest()[:8], 16)
        score = 18 + seed % 74
        previous = max(5, min(98, score - (seed % 19 - 5)))
        trend = [{"period": f"2026-{month:02}", "score": max(5, min(98, previous - (8-month)*2 + ((seed >> month) % 9)-4))} for month in range(4, 9)]
        trend[-1]["score"] = previous
        trend.append({"period": "2026-09", "score": score})
        rows.append({
            "code": code, "name": name, "district": district,
            "risk_score": score, "risk_level": "high" if score >= 70 else "watch" if score >= 40 else "low",
            "previous_score": previous, "quality": "valid", "population": 9000 + seed % 31000,
            "signals": [
                {"key": "mobility", "label": "외출·이동 지표", "value": 100 - score // 3, "unit": "지수", "change_pct": -(3 + seed % 25)},
                {"key": "spending", "label": "생활 소비 지표", "value": 110 - score // 2, "unit": "지수", "change_pct": -(seed % 17)},
                {"key": "connection", "label": "지역 교류 지표", "value": 100 - score // 2, "unit": "지수", "change_pct": -(2 + seed % 21)},
            ],
            "trend": trend,
            "summary": f"{name}의 합성 관측값입니다. 이동·소비·교류 변화와 정책 연결 흐름을 확인하세요.",
        })
    rows.sort(key=lambda row: row["code"])
    features.sort(key=lambda feature: feature["properties"]["code"])
    policies = [
        make_policy("demo-connection", "동네 연결 모임", "지역 내 교류 기회를 원하는 주민", ["connection", "mobility"], "소규모 동네 모임과 공동 활동을 연결하는 가상 정책입니다."),
        make_policy("demo-outreach", "찾아가는 생활 안부", "생활·활동 변화가 확인되어 추가 상담이 필요한 주민", ["mobility", "connection"], "담당자가 지역 현황을 확인하고 안부 상담을 검토하는 시연용 프로그램입니다."),
        make_policy("demo-youth", "청년 일상 회복 동행", "일상 회복과 지역 참여를 원하는 청년", ["connection", "spending"], "청년의 지역 참여·생활 회복 지원 흐름을 보여주는 가상 정책입니다."),
        make_policy("demo-meal", "이웃과 함께하는 식탁", "공동 식사·교류 활동 참여를 원하는 주민", ["spending", "connection"], "생활 소비 감소 신호와 지역 공동 식사 지원을 연결하는 가상 예시입니다."),
        make_policy("demo-walk", "생활권 걷기 동행", "외부 활동과 생활권 참여를 원하는 주민", ["mobility"], "생활권 내 걷기 모임을 통해 외부 활동을 지원하는 가상 정책입니다."),
        make_policy("demo-expired", "지난 분기 관계 회복 교실", "지역 주민", ["connection"], "기간 만료 시 대체 정책을 찾는 과정을 검증하기 위한 가상 정책입니다.", "2026-06-30"),
    ]
    DEST.mkdir(parents=True, exist_ok=True)
    write_json(DEST / "districts.geojson", {"type": "FeatureCollection", "features": features})
    write_json(DEST / "dataset.json", {
        "schema_version": "1.0", "mode": "mock", "as_of": "2026-09-29T09:00:00+09:00",
        "disclaimer": "위험도·인구·지표·정책은 흐름 확인을 위한 가상 데이터입니다. 실제 고립 위험이나 지원 자격을 의미하지 않습니다.",
        "districts": rows, "policies": policies,
    })
    write_json(DEST / "provenance.json", {
        "boundary_source": SOURCE_URL, "source_repository": "https://github.com/vuski/admdongkor",
        "source_commit": SOURCE_COMMIT, "source_sha256": hashlib.sha256(raw).hexdigest(),
        "boundary_version": "2026-07-01", "scope": "서울특별시 행정동", "feature_count": len(features),
        "coordinate_system": "EPSG:4326", "code_system": "행정안전부 행정동코드 10자리 (adm_cd2)",
        "modifications": "서울특별시 필터, 속성명 표준화, 좌표 소수점 5자리 반올림. 경계 최신성 및 정확성 보증 없음.",
        "license": "CC BY 4.0; upstream SGIS KOGL Type 1 attribution retained",
        "attribution": "본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.",
        "synthetic_observations": True, "synthetic_policies": True,
        "observation_generation": "SHA256(donghaeng-demo-v1:administrative_code); reproducible artificial values, no actual data or prediction model",
    })
    print(f"Built {len(features)} Seoul administrative-dong features and {len(policies)} synthetic policies.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/build_mock_data.py SOURCE_GEOJSON")
    main(Path(sys.argv[1]))
