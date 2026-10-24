"""Negative authorization tests. Signing keys exist only in isolated test memory."""
from dataclasses import replace
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from test_investigation_evidence import evidence_settings, request


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def institution(evidence_settings, signing_key, tmp_path):
    public_path = tmp_path / "jwt-public.pem"
    public_path.write_bytes(signing_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    return replace(evidence_settings, access_mode="institution", auth_issuer="https://test-idp.invalid",
                   auth_audience="hermes-test", auth_tenant_id="institution-a", auth_public_key_path=public_path)


def headers(key, permissions=("read",), **changes):
    at = int(time.time())
    claims = {"iss": "https://test-idp.invalid", "aud": "hermes-test", "sub": "staff-123",
              "tenant_id": "institution-a", "iat": at - 1, "exp": at + 300, "permissions": list(permissions), **changes}
    claims = {name: value for name, value in claims.items() if value is not None}
    return {"Authorization": "Bearer " + jwt.encode(claims, key, algorithm="RS256")}


def test_missing_token_is_denied_on_read_and_write(institution):
    with TestClient(create_app(institution)) as client:
        for path in ("/api/security/context", "/api/investigations", "/api/research/i5", "/api/health"):
            response = client.get(path)
            assert response.status_code == 401
            assert response.headers["WWW-Authenticate"] == "Bearer"
        assert client.post("/api/investigations", json=request()).status_code == 401


@pytest.mark.parametrize("claims", [
    {"iss": "https://attacker.invalid"}, {"aud": "another-service"}, {"tenant_id": "institution-b"},
    {"exp": 1}, {"exp": None}, {"sub": ""}, {"sub": None}, {"permissions": "admin"},
    {"permissions": ["root"]}, {"iat": 1, "exp": 4102444800}, {"nbf": 4102444800},
])
def test_invalid_claims_are_rejected(institution, signing_key, claims):
    with TestClient(create_app(institution)) as client:
        response = client.get("/api/security/context", headers=headers(signing_key, **claims))
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "invalid_access_token"


def test_algorithm_and_signature_cannot_be_chosen_by_token(institution, signing_key):
    wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with TestClient(create_app(institution)) as client:
        assert client.get("/api/security/context", headers=headers(wrong_key)).status_code == 401
        unsigned = jwt.encode({"sub": "forged", "permissions": ["admin"]}, "", algorithm="none")
        assert client.get("/api/security/context", headers={"Authorization": "Bearer " + unsigned}).status_code == 401
        symmetric = jwt.encode({"sub": "forged", "permissions": ["admin"]}, "test-only-not-a-real-secret-0123456789", algorithm="HS256")
        assert client.get("/api/security/context", headers={"Authorization": "Bearer " + symmetric}).status_code == 401


def test_route_permissions_and_admin_are_enforced(institution, signing_key):
    with TestClient(create_app(institution)) as client:
        read = headers(signing_key)
        context = client.get("/api/security/context", headers=read)
        assert context.status_code == 200
        assert context.json()["actor"] == {"subject": "staff-123", "tenant_id": "institution-a", "auth_mode": "institution"}
        assert context.json()["sso_integration"] == "not_verified"
        assert client.post("/api/investigations", json=request(), headers=read).status_code == 403
        assert client.post("/api/investigations/missing/reviews", json={}, headers=read).status_code == 403
        assert client.get("/api/security/configuration", headers=read).status_code == 403
        assert client.get("/api/security/configuration", headers=headers(signing_key, ["admin"])).status_code == 200


def test_review_actor_is_derived_from_verified_subject(institution, signing_key):
    application = create_app(institution)
    with TestClient(application) as client:
        investigator = headers(signing_key, ["read", "investigate"])
        case = client.post("/api/investigations", json=request(), headers=investigator).json()
        cid = case["case_id"]
        response = client.post(f"/api/investigations/{cid}/runs", headers=investigator, json={
            "strategy": "rule_baseline", "expected_case_version": case["case_version"], "idempotency_key": "auth-test-run"})
        assert response.status_code == 202
        application.state.investigation_worker.drain_once()
        case = client.get(f"/api/investigations/{cid}", headers=investigator).json()
        brief = case["briefs"][0]
        command = {"brief_id": brief["brief_id"], "brief_version": brief["brief_version"],
                   "expected_case_version": case["case_version"], "decision": "accept", "reason": "근거 검토 완료",
                   "reviewer_type": "developer_verification", "idempotency_key": "auth-test-review"}
        assert client.post(f"/api/investigations/{cid}/reviews", headers=investigator, json=command).status_code == 403
        reviewer = headers(signing_key, ["read", "review"], sub="verified-reviewer-456")
        result = client.post(f"/api/investigations/{cid}/reviews", headers=reviewer, json=command)
        assert result.status_code == 202, result.text
        saved = client.get(f"/api/investigations/{cid}", headers=reviewer).json()["reviews"][0]
        assert saved["reviewer_type"] == "user"
        assert saved["actor"] == {"subject": "verified-reviewer-456", "tenant_id": "institution-a", "auth_mode": "institution"}
        assert saved["outcome_scope"] == "brief_review_only"


def test_institution_never_uses_personal_codex_or_an_unapproved_model(institution, signing_key, monkeypatch):
    def forbidden_provider():
        raise AssertionError("institution API must not inspect personal model credentials")

    monkeypatch.setattr("app.investigation_api.create_provider", forbidden_provider)
    with TestClient(create_app(institution)) as client:
        auth = headers(signing_key, ["read", "investigate"])
        readiness = client.get("/api/investigations/readiness", headers=auth).json()
        assert readiness["model"]["code"] == "institution_provider_not_configured"
        case = client.post("/api/investigations", json=request(), headers=auth).json()
        for strategy in ("single_search", "agent"):
            response = client.post(f"/api/investigations/{case['case_id']}/runs", headers=auth, json={
                "strategy": strategy, "expected_case_version": case["case_version"], "idempotency_key": "institution-" + strategy})
            assert response.status_code == 503
            assert response.json()["detail"]["code"] == "institution_provider_not_configured"


def test_institution_cannot_start_with_missing_or_invalid_configuration(institution, tmp_path):
    with pytest.raises(ValueError, match="requires issuer"):
        Settings(access_mode="institution")
    with pytest.raises(ValueError, match="public key"):
        create_app(replace(institution, auth_public_key_path=tmp_path / "missing.pem"))
    invalid = tmp_path / "invalid.pem"
    invalid.write_text("not a key")
    with pytest.raises(ValueError, match="public key"):
        create_app(replace(institution, auth_public_key_path=invalid))


def test_institution_database_cannot_be_reopened_by_another_tenant_or_as_development(institution, tmp_path):
    with TestClient(create_app(institution)):
        pass
    with pytest.raises(ValueError, match="database_tenant_binding_mismatch"):
        create_app(replace(institution, auth_tenant_id="institution-b"))
    with pytest.raises(ValueError, match="database_tenant_binding_mismatch"):
        create_app(replace(institution, access_mode="local_development"))
    with pytest.raises(ValueError, match="database_tenant_binding_mismatch"):
        create_app(replace(institution, auth_tenant_id="institution-b", investigation_db_path=tmp_path / "other-business.sqlite3"))


def test_local_mode_is_identified_and_rejects_non_loopback_clients(evidence_settings):
    with TestClient(create_app(evidence_settings)) as client:
        response = client.get("/api/security/context")
        assert response.status_code == 200
        assert response.json()["actor"]["subject"] == "local-developer"
        assert response.json()["authentication"] == "loopback_development_only"
        assert response.headers["X-Hermes-Access-Mode"] == "local_development"
    with TestClient(create_app(evidence_settings), client=("203.0.113.10", 50000)) as client:
        assert client.get("/api/investigations").status_code == 403
