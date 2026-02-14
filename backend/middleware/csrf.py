# ============================================================================
# CSRF PROTECTION MIDDLEWARE
# ============================================================================
# Implements the double-submit cookie pattern for CSRF protection.
# Works alongside JWT authentication for defense in depth.
# ============================================================================

import os
import secrets
import hashlib
from fastapi import Request, HTTPException
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

# CSRF Configuration
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TOKEN_LENGTH = 32
CSRF_COOKIE_MAX_AGE = 3600 * 24  # 24 hours

# Methods that require CSRF protection
CSRF_PROTECTED_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# Paths exempt from CSRF protection (e.g., auth endpoints that don't have cookies yet)
CSRF_EXEMPT_PATHS = {
    "/",
    "/api/transcribe",  # Uses file upload with auth header
    "/api/insights",  # Protected by JWT authentication
    "/api/scan-receipt",  # Protected by JWT authentication
}

# Path prefixes exempt from CSRF protection
# All /api/ routes use JWT Bearer token auth, which is not vulnerable to CSRF
# (CSRF exploits cookie-based auth; Bearer tokens must be explicitly attached)
CSRF_EXEMPT_PREFIXES = (
    "/api/",
)


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)


def hash_token(token: str) -> str:
    """Hash a token for comparison."""
    return hashlib.sha256(token.encode()).hexdigest()


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF Protection Middleware using double-submit cookie pattern.

    How it works:
    1. On any request, if no CSRF cookie exists, one is set
    2. On state-changing requests (POST/PUT/DELETE/PATCH), the middleware
       validates that the X-CSRF-Token header matches the cookie value
    3. Same-origin policy prevents other sites from reading the cookie,
       so only legitimate requests can include the correct header
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Get the CSRF token from cookie
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)

        # Check if this is a state-changing request that needs CSRF validation
        if request.method in CSRF_PROTECTED_METHODS:
            # Skip validation for exempt paths and prefixes
            path = request.url.path
            is_exempt = path in CSRF_EXEMPT_PATHS or path.startswith(CSRF_EXEMPT_PREFIXES)
            if not is_exempt:
                # Get the CSRF token from header
                csrf_header = request.headers.get(CSRF_HEADER_NAME)

                # Validate CSRF token
                if not csrf_cookie or not csrf_header:
                    raise HTTPException(
                        status_code=403,
                        detail="CSRF token missing"
                    )

                # Compare tokens (constant-time comparison to prevent timing attacks)
                if not secrets.compare_digest(csrf_cookie, csrf_header):
                    raise HTTPException(
                        status_code=403,
                        detail="CSRF token invalid"
                    )

        # Process the request
        response = await call_next(request)

        # Set CSRF cookie if not present (on all responses)
        if not csrf_cookie:
            new_token = generate_csrf_token()
            response.set_cookie(
                key=CSRF_COOKIE_NAME,
                value=new_token,
                max_age=CSRF_COOKIE_MAX_AGE,
                httponly=False,  # Must be readable by JavaScript
                samesite="strict",  # Prevent cross-site requests
                secure=os.getenv("ENVIRONMENT") == "production",
                path="/"
            )

        return response


# Simpler approach: CSRF token endpoint for SPAs
async def get_csrf_token(request: Request) -> dict:
    """
    Endpoint to get a CSRF token.
    The token is also set in a cookie for the double-submit pattern.
    """
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)

    if csrf_cookie:
        return {"csrf_token": csrf_cookie}

    # Generate new token - it will be set in cookie by middleware
    return {"csrf_token": generate_csrf_token()}
