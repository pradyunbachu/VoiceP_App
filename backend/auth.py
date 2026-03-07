"""Authentication and JWT validation.

Provides the get_current_user_dependency FastAPI dependency that extracts and
validates a Supabase JWT from the Authorization header. Supports two algorithms:
  - ES256: Verified via JWKS public keys fetched from Supabase (preferred)
  - HS256: Fallback using the shared JWT secret from environment variables

Returns a user dict with id, username, and email for use in route handlers.
"""

# ============================================================================
# AUTHENTICATION HELPER FUNCTIONS
# ============================================================================
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from config import supabase, SUPABASE_JWT_SECRET, get_jwks_key
import logging

logger = logging.getLogger(__name__)

# Security bearer for JWT tokens
security = HTTPBearer()

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate the JWT and return the authenticated user's info.

    Peeks at the JWT header to determine ES256 vs HS256, validates the token,
    then looks up the username from the profiles table.

    Returns: dict with keys "id" (UUID str), "username" (str), "email" (str or None).
    Raises: HTTPException 401 if the token is missing, expired, or invalid.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        # Peek at the header (without verifying) to determine which algorithm to use
        header = jwt.get_unverified_header(token)
        alg = header.get('alg')

        if alg == "ES256":
            # Use JWKS for ES256 tokens
            kid = header.get('kid')
            signing_key = get_jwks_key(kid)
            if not signing_key:
                raise credentials_exception
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        else:
            # Fallback to HS256 with shared secret
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )

        user_id = payload.get("sub")  # "sub" claim holds the Supabase user UUID
        email = payload.get("email")
        if not user_id:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        logger.error("JWT validation error: %s", e)
        raise credentials_exception

    # Look up display name from profiles; fall back to email prefix if no profile exists
    if supabase is None:
        raise credentials_exception

    try:
        response = supabase.table("profiles").select("username").eq("id", user_id).execute()
        username = response.data[0]["username"] if response.data else (email.split("@")[0] if email else "User")
    except Exception:
        username = email.split("@")[0] if email else "User"

    return {"id": user_id, "username": username, "email": email}
