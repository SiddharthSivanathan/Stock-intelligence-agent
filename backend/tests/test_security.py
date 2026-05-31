"""Tests for app.core.security — pure functions, no DB."""
from __future__ import annotations

from datetime import timedelta

import jwt
import pytest

from app.config import settings
from app.core import security


class TestPasswordHashing:
    def test_hash_then_verify_roundtrip(self):
        h = security.hash_password("supersecret123")
        assert h != "supersecret123"
        assert security.verify_password("supersecret123", h)

    def test_verify_rejects_wrong_password(self):
        h = security.hash_password("right-one")
        assert security.verify_password("wrong-one", h) is False

    def test_verify_returns_false_for_malformed_hash(self):
        assert security.verify_password("anything", "not-a-bcrypt-hash") is False

    def test_hashes_are_salted_per_call(self):
        a = security.hash_password("same")
        b = security.hash_password("same")
        assert a != b  # different salts


class TestJwt:
    def test_access_token_decodes_with_correct_secret(self):
        token = security.create_access_token(42)
        decoded = security.decode_token(token)
        assert decoded["sub"] == "42"
        assert decoded["type"] == "access"
        assert "exp" in decoded

    def test_refresh_token_carries_type(self):
        token = security.create_refresh_token(7)
        decoded = security.decode_token(token)
        assert decoded["type"] == "refresh"

    def test_tampered_token_rejected(self):
        token = security.create_access_token(1)
        bad = token[:-3] + ("AAA" if token[-3:] != "AAA" else "BBB")
        with pytest.raises(jwt.PyJWTError):
            security.decode_token(bad)

    def test_wrong_secret_rejects(self):
        token = security.create_access_token(1)
        with pytest.raises(jwt.PyJWTError):
            jwt.decode(token, "definitely-wrong-secret", algorithms=[settings.jwt_algorithm])

    def test_expired_token_rejected(self):
        token = security._create_token(
            "1", "access", timedelta(seconds=-10)
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            security.decode_token(token)
