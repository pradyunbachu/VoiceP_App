"""Rate limiting configuration using slowapi.

Sets up a global Limiter instance that identifies clients by their real IP
address, accounting for reverse proxies (e.g. Nginx, Cloudflare) that set
X-Forwarded-For. Import `limiter` and decorate route handlers with
@limiter.limit("N/period") to enforce per-endpoint rate limits.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def get_real_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For behind trusted proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # First entry is the original client; subsequent entries are proxies
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Global limiter instance — attach to the FastAPI app via app.state.limiter
limiter = Limiter(key_func=get_real_client_ip)
