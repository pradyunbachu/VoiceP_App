# Security Enhancements - Comprehensive Update

## Overview

This update implements critical security measures across the entire voxal application stack, addressing authentication, authorization, input validation, and infrastructure security concerns. These changes prepare the application for production deployment by implementing industry-standard security practices.

---

## Table of Contents

1. [Environment & Secrets Management](#1-environment--secrets-management)
2. [Security Headers (Nginx)](#2-security-headers-nginx)
3. [HTTPS/TLS Configuration](#3-httpstls-configuration)
4. [CSRF Protection](#4-csrf-protection)
5. [CORS Hardening](#5-cors-hardening)
6. [Rate Limiting](#6-rate-limiting)
7. [Files Changed](#7-files-changed)
8. [Testing the Changes](#8-testing-the-changes)
9. [Production Deployment Checklist](#9-production-deployment-checklist)

---

## 1. Environment & Secrets Management

### Changes Made

**File: `.gitignore`**

Enhanced the gitignore to explicitly prevent sensitive files from being committed:

```gitignore
# Environment variables
.env
.env.local
.env.*.local
backend/.env
frontend/.env
**/.env
!.env.example
!**/.env.example

# SSL certificates (for local dev)
certs/
*.pem
*.key
*.crt
```

### Why This Matters

- Prevents accidental exposure of API keys (Supabase, Groq, Deepgram)
- Protects database credentials from being pushed to version control
- Excludes SSL certificates which should never be in source control
- Maintains `.env.example` files as templates for developers

---

## 2. Security Headers (Nginx)

### Changes Made

**File: `frontend/nginx.conf`**

Added comprehensive security headers to all responses:

```nginx
# Prevent clickjacking attacks
add_header X-Frame-Options "SAMEORIGIN" always;

# Prevent MIME type sniffing
add_header X-Content-Type-Options "nosniff" always;

# Enable XSS filter in browsers
add_header X-XSS-Protection "1; mode=block" always;

# Control referrer information
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Permissions Policy (formerly Feature Policy)
add_header Permissions-Policy "geolocation=(), microphone=(self), camera=()" always;

# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'self';" always;
```

### Header Explanations

| Header | Purpose |
|--------|---------|
| `X-Frame-Options` | Prevents the page from being embedded in iframes on other sites (clickjacking protection) |
| `X-Content-Type-Options` | Prevents browsers from MIME-sniffing a response away from the declared content-type |
| `X-XSS-Protection` | Enables the browser's built-in XSS filtering |
| `Referrer-Policy` | Controls how much referrer information is sent with requests |
| `Permissions-Policy` | Restricts which browser features can be used (microphone allowed for voice recording) |
| `Content-Security-Policy` | Defines approved sources for content, preventing XSS and data injection attacks |

---

## 3. HTTPS/TLS Configuration

### Changes Made

**File: `frontend/nginx.conf`**

Added a complete HTTPS server block (commented out for easy enablement):

```nginx
server {
    listen 443 ssl http2;
    server_name localhost;

    # SSL Certificate Configuration
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # HSTS (for production)
    # add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
}
```

**File: `docker-compose.yml`**

Added HTTPS port exposure and certificate volume mounting:

```yaml
frontend:
  ports:
    - "80:80"
    - "443:443"
  # volumes:
  #   - ./certs:/etc/nginx/ssl:ro
```

**File: `scripts/generate-ssl-certs.sh`** (New)

Created a helper script to generate self-signed certificates for development:

```bash
#!/bin/bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/key.pem" \
    -out "$CERTS_DIR/cert.pem" \
    -subj "/C=US/ST=Local/L=Local/O=Development/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### TLS Configuration Details

- **Protocols**: Only TLS 1.2 and 1.3 (modern, secure versions)
- **Cipher Suites**: Modern AEAD ciphers with forward secrecy
- **Session Management**: Secure session caching, no session tickets
- **HTTP/2**: Enabled for better performance

---

## 4. CSRF Protection

### Changes Made

**File: `backend/middleware/__init__.py`** (New)
**File: `backend/middleware/csrf.py`** (New)

Implemented the **Double-Submit Cookie Pattern** for CSRF protection:

```python
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
```

### Configuration

- **Cookie Name**: `csrf_token`
- **Header Name**: `X-CSRF-Token`
- **Token Length**: 32 bytes (URL-safe base64)
- **Cookie Max Age**: 24 hours
- **Cookie Attributes**: `SameSite=Strict`, `HttpOnly=False` (must be readable by JS)

### Exempt Paths

```python
CSRF_EXEMPT_PATHS = {
    "/",
    "/api/transcribe",  # File upload with auth header
}
```

**File: `backend/main.py`**

Integrated CSRF middleware with option to disable for development:

```python
# Enable CSRF protection (can be disabled for development via env var)
if os.getenv("DISABLE_CSRF", "false").lower() != "true":
    app.add_middleware(CSRFMiddleware)
```

Added CSRF token endpoint:

```python
@app.get("/api/csrf-token", tags=["Security"])
async def csrf_token_endpoint(request: Request):
    """Get a CSRF token for state-changing requests."""
    return await get_csrf_token(request)
```

**File: `frontend/src/lib/csrf.js`** (New)

Created frontend utility for CSRF token management:

```javascript
export const getCsrfToken = () => {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'csrf_token') {
      return decodeURIComponent(value);
    }
  }
  return null;
};

export const getCsrfHeaders = (existingHeaders = {}) => {
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    return { ...existingHeaders, 'X-CSRF-Token': csrfToken };
  }
  return existingHeaders;
};
```

### Frontend Integration

Updated all mutation hooks to include CSRF tokens:

- `frontend/src/hooks/mutations/useExpenseMutations.js`
- `frontend/src/hooks/mutations/useBudgetMutations.js`
- `frontend/src/hooks/mutations/usePantryMutations.js`

Example change:

```javascript
// Before
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
},

// After
headers: getCsrfHeaders({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}),
credentials: 'include',
```

---

## 5. CORS Hardening

### Changes Made

**File: `backend/main.py`**

Replaced wildcard CORS configuration with explicit allowlists:

```python
# Before (insecure)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],  # Allowed ALL methods
    allow_headers=["*"],  # Allowed ALL headers
)

# After (secure)
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-CSRF-Token",
        "X-Requested-With",
    ],
    expose_headers=["X-CSRF-Token"],
)
```

### Why This Matters

- Prevents unauthorized HTTP methods from being used
- Limits which headers can be sent in requests
- Exposes CSRF token header for frontend access
- Configurable via environment variable for different deployments

---

## 6. Rate Limiting

### Changes Made

Added rate limiting to **ALL** API endpoints using `slowapi`:

### Transcription Routes (`backend/routes/transcription.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/me` | GET | 60/min | Standard read operation |
| `/api/transcribe` | POST | 10/min | Expensive AI API call (Deepgram) |

### Expense Routes (`backend/routes/expenses.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/extract-expense` | POST | 20/min | AI-powered extraction (Groq) |
| `/api/extract-expense-simple` | POST | 20/min | Regex extraction fallback |
| `/api/expenses` | GET | 60/min | Standard read operation |
| `/api/expenses` | POST | 30/min | Standard write operation |
| `/api/expenses/{id}` | PUT | 30/min | Standard update operation |
| `/api/expenses/{id}` | DELETE | 30/min | Standard delete operation |
| `/api/expenses/bulk` | DELETE | 10/min | Bulk operation - stricter limit |
| `/api/expenses` (all) | DELETE | 5/min | Dangerous operation - strictest limit |

### Pantry Routes (`backend/routes/pantry.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/pantry` | GET | 60/min | Standard read operation |
| `/api/pantry` | POST | 30/min | Standard write operation |
| `/api/pantry/from-expense` | POST | 20/min | Multi-item creation |
| `/api/pantry/{id}` | PUT | 30/min | Standard update operation |
| `/api/pantry/{id}/status` | PUT | 60/min | Quick status toggle (frequent use) |
| `/api/pantry/{id}` | DELETE | 30/min | Standard delete operation |
| `/api/pantry/bulk` | DELETE | 10/min | Bulk operation - stricter limit |
| `/api/pantry/stats` | GET | 30/min | Computation-heavy aggregation |

### Budget Routes (`backend/routes/budgets.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/budgets` | GET | 60/min | Standard read operation |
| `/api/budgets` | POST | 20/min | Can create multiple budgets |
| `/api/budgets/{id}` | PUT | 30/min | Standard update operation |
| `/api/budgets/{id}` | DELETE | 30/min | Standard delete operation |
| `/api/budgets/check` | GET | 30/min | Computation-heavy (calculates spending) |

### Analytics Routes (`backend/routes/analytics.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/analytics` | GET | 30/min | Heavy aggregation queries |

### Recurring Routes (`backend/routes/recurring.py`)

| Endpoint | Method | Limit | Rationale |
|----------|--------|-------|-----------|
| `/api/recurring/process` | POST | 5/min | Triggers batch processing |
| `/api/recurring` | GET | 60/min | Standard read operation |
| `/api/recurring/{id}` | DELETE | 30/min | Standard delete operation |

### Rate Limit Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    RATE LIMIT TIERS                         │
├─────────────────────────────────────────────────────────────┤
│  5/min   │ Dangerous operations (delete all, batch process) │
│ 10/min   │ Bulk operations, expensive AI calls              │
│ 20/min   │ AI-powered endpoints, multi-create operations    │
│ 30/min   │ Standard mutations (POST, PUT, DELETE)           │
│ 60/min   │ Read operations (GET), frequent actions          │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Files Changed

### New Files Created

```
backend/middleware/__init__.py          # Middleware package
backend/middleware/csrf.py              # CSRF protection middleware
frontend/src/lib/csrf.js                # Frontend CSRF utilities
scripts/generate-ssl-certs.sh           # SSL certificate generator
```

### Modified Files

```
.gitignore                                      # Enhanced secrets protection
docker-compose.yml                              # HTTPS support
frontend/nginx.conf                             # Security headers + HTTPS
backend/main.py                                 # CSRF + CORS hardening
backend/routes/transcription.py                 # Rate limiting
backend/routes/expenses.py                      # Rate limiting
backend/routes/pantry.py                        # Rate limiting
backend/routes/budgets.py                       # Rate limiting
backend/routes/analytics.py                     # Rate limiting
backend/routes/recurring.py                     # Rate limiting
frontend/src/hooks/mutations/useExpenseMutations.js   # CSRF tokens
frontend/src/hooks/mutations/useBudgetMutations.js    # CSRF tokens
frontend/src/hooks/mutations/usePantryMutations.js    # CSRF tokens
frontend/src/components/VoiceRecorder.jsx             # Credentials include
frontend/src/components/QuickRecordPopup.jsx          # Credentials include
```

---

## 8. Testing the Changes

### Test CSRF Protection

```bash
# Should fail (no CSRF token)
curl -X POST http://localhost:8000/api/expenses \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"store":"Test","amount":10}'

# Response: {"detail":"CSRF token missing"}

# Should succeed (with CSRF token from cookie)
curl -X POST http://localhost:8000/api/expenses \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token-from-cookie>" \
  -b "csrf_token=<token>" \
  -d '{"store":"Test","amount":10}'
```

### Test Rate Limiting

```bash
# Make 6 requests to a 5/min endpoint
for i in {1..6}; do
  curl -X DELETE http://localhost:8000/api/expenses \
    -H "Authorization: Bearer <token>" \
    -H "X-CSRF-Token: <token>"
done

# 6th request should return 429 Too Many Requests
```

### Test Security Headers

```bash
curl -I http://localhost/
# Should see:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: strict-origin-when-cross-origin
# Content-Security-Policy: ...
```

### Generate SSL Certificates (for HTTPS testing)

```bash
chmod +x scripts/generate-ssl-certs.sh
./scripts/generate-ssl-certs.sh

# Then uncomment HTTPS sections in:
# - frontend/nginx.conf (HTTPS server block)
# - docker-compose.yml (volumes section)
```

---

## 9. Production Deployment Checklist

Before deploying to production, ensure:

- [ ] **SSL Certificates**: Obtain real certificates (Let's Encrypt recommended)
- [ ] **Environment Variables**: Set `ALLOWED_ORIGINS` to production domain
- [ ] **CSRF**: Remove `DISABLE_CSRF` or set to `false`
- [ ] **HSTS**: Uncomment `Strict-Transport-Security` header in nginx
- [ ] **HTTP Redirect**: Uncomment HTTP→HTTPS redirect in nginx
- [ ] **CSP**: Review Content-Security-Policy for production domains
- [ ] **Rate Limits**: Adjust limits based on expected traffic
- [ ] **Secrets**: Ensure all `.env` files are excluded and use proper secrets management

---

## Security Improvements Summary

| Category | Before | After |
|----------|--------|-------|
| Secrets in Git | Potentially exposed | Explicitly ignored |
| Security Headers | None | Full suite (CSP, XSS, etc.) |
| HTTPS | Not configured | Ready to enable |
| CSRF Protection | None | Double-submit cookie pattern |
| CORS | Wildcard (`*`) | Explicit allowlist |
| Rate Limiting | 2 endpoints | All 25+ endpoints |

---

## Breaking Changes

1. **CSRF Tokens Required**: All POST/PUT/DELETE/PATCH requests now require `X-CSRF-Token` header
2. **Credentials Mode**: Frontend fetch calls must use `credentials: 'include'`
3. **Rate Limits**: Excessive API calls will receive `429 Too Many Requests`

---

## Rollback Instructions

If issues arise, you can:

1. **Disable CSRF**: Set `DISABLE_CSRF=true` in backend environment
2. **Revert CORS**: Change back to `allow_methods=["*"]` and `allow_headers=["*"]`
3. **Remove Rate Limits**: Remove `@limiter.limit()` decorators from routes

---

*This security update was implemented following OWASP guidelines and security best practices.*
