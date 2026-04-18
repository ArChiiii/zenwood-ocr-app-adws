"""Supabase JWT verification — self-contained copy of the pattern in backend/auth.py."""
from __future__ import annotations

import os
from typing import Annotated

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def _secret() -> str:
    s = os.getenv("SUPABASE_JWT_SECRET")
    if not s:
        raise RuntimeError("SUPABASE_JWT_SECRET is required")
    return s


async def get_current_user(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict:
    if cred is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    try:
        return pyjwt.decode(cred.credentials, _secret(), algorithms=["HS256"],
                             audience="authenticated")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"invalid token: {e}") from e
