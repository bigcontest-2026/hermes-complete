"""Validate the map/data join and synthetic-data safety contract without dependencies."""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "shared" / "mock"
data = json.loads((ROOT / "dataset.json").read_text())
geo = json.loads((ROOT / "districts.geojson").read_text())
provenance = json.loads((ROOT / "provenance.json").read_text())
rows = data["districts"]
features = geo["features"]
codes = [row["code"] for row in rows]
map_codes = [feature["properties"]["code"] for feature in features]
assert len(codes) == len(set(codes)) == len(features) == provenance["feature_count"] == 427
assert set(codes) == set(map_codes), "Map/data join mismatch"
assert all(len(code) == 10 and code.isdigit() and code.startswith("11") for code in codes)
assert len({row["district"] for row in rows}) == 25
assert data["mode"] == "mock" and data["schema_version"] == "1.0"
assert "가상" in data["disclaimer"] and provenance["synthetic_observations"]


def check_coords(coords):
    if isinstance(coords[0], (int, float)):
        lng, lat = coords[:2]
        assert 126 < lng < 128 and 37 < lat < 38, "Unexpected CRS or out-of-Seoul point"
    else:
        for child in coords:
            check_coords(child)


for feature in features:
    assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")
    check_coords(feature["geometry"]["coordinates"])
    polygons = feature["geometry"]["coordinates"] if feature["geometry"]["type"] == "MultiPolygon" else [feature["geometry"]["coordinates"]]
    for polygon in polygons:
        for ring in polygon:
            assert len(ring) >= 4 and ring[0] == ring[-1], "Unclosed polygon ring"
for row in rows:
    score = row["risk_score"]
    assert 0 <= score <= 100
    assert row["risk_level"] == ("high" if score >= 70 else "watch" if score >= 40 else "low")
    assert row["trend"][-1]["score"] == score
    assert all(signal["key"] for signal in row["signals"])
today = date.fromisoformat(data["as_of"][:10])
policies = data["policies"]
assert all(p["is_mock"] and p["source_url"] is None and p["title"].startswith("[가상]") for p in policies)
assert any(date.fromisoformat(p["end_date"]) < today for p in policies)
assert any(date.fromisoformat(p["start_date"]) <= today <= date.fromisoformat(p["end_date"]) for p in policies)
print(f"PASS: {len(rows)} administrative-dong joins, 25 districts, coordinates/rings, risk/trend contract, {len(policies)} mock policies")
