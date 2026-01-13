# ============================================================================
# AUTHENTICATION HELPER FUNCTIONS
# ============================================================================
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from config import supabase, SUPABASE_JWT_SECRET, get_jwks_key

# Security bearer for JWT tokens
security = HTTPBearer()

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get the current authenticated user from Supabase JWT token"""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
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

        user_id = payload.get("sub")  # UUID string
        email = payload.get("email")
        if not user_id:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception

    # Get username from profiles table
    if supabase is None:
        raise credentials_exception

    try:
        response = supabase.table("profiles").select("username").eq("id", user_id).execute()
        username = response.data[0]["username"] if response.data else (email.split("@")[0] if email else "User")
    except Exception:
        username = email.split("@")[0] if email else "User"

    return {"id": user_id, "username": username, "email": email}
