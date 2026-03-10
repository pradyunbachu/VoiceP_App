"""Configuration and external service client initialization.

Loads environment variables and initializes clients for:
  - Supabase (database + auth + JWKS key fetching)
  - Groq    (LLM for expense extraction, chat, insights)
  - Deepgram (speech-to-text for voice transcription)

Each client gracefully degrades with a warning if its API key is missing,
allowing partial functionality during local development.
"""

# ============================================================================
# CONFIGURATION & CLIENT INITIALIZATION
# ============================================================================
import os
from typing import Optional
from dotenv import load_dotenv
import httpx
from jwt import PyJWK
from groq import Groq
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# ============================================================================
# SUPABASE CONFIGURATION
# ============================================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")           # anon/public key for client SDK
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")  # used for HS256 JWT verification

# Initialize Supabase client
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("SUPABASE_URL and SUPABASE_KEY not set. Please set them in .env file")
    logger.warning("Get your credentials from: https://supabase.com/dashboard")
    supabase: Optional[Client] = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized successfully")

# ============================================================================
# JWKS CACHE FOR JWT VALIDATION
# ============================================================================
# In-memory cache: key ID (kid) -> public key object.
# Populated lazily on first ES256 token validation and reused thereafter.
jwks_cache = {}

def get_jwks_key(kid: str):
    """Fetch the public key for a given key ID from Supabase's JWKS endpoint.

    Keys are cached in jwks_cache so the JWKS endpoint is only hit once
    per key ID for the lifetime of the process.
    """
    global jwks_cache
    if kid in jwks_cache:
        return jwks_cache[kid]

    if not SUPABASE_URL:
        return None

    # Supabase exposes a standard JWKS endpoint for ES256 public keys
    jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        response = httpx.get(jwks_url)
        response.raise_for_status()
        jwks_data = response.json()

        # Cache all keys from the response (there may be multiple/rotated keys)
        for key_data in jwks_data.get("keys", []):
            key_id = key_data.get("kid")
            if key_id:
                jwks_cache[key_id] = PyJWK.from_dict(key_data).key

        return jwks_cache.get(kid)
    except Exception as e:
        logger.error("Error fetching JWKS: %s", e)
        return None

# ============================================================================
# GROQ CLIENT (for expense extraction)
# ============================================================================
groq_api_key = os.getenv("GROQ_API_KEY", "")
if not groq_api_key or groq_api_key == "your_groq_api_key_here":
    logger.warning("GROQ_API_KEY not set. Please set your API key in .env file")
    logger.warning("Get a free API key at: https://console.groq.com/")
    groq_client = None
else:
    groq_client = Groq(api_key=groq_api_key)

# ============================================================================
# DEEPGRAM CONFIGURATION (for voice transcription)
# ============================================================================
# ============================================================================
# VAPID KEYS (for Web Push notifications)
# ============================================================================
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@voxal.app")

if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
    logger.warning("VAPID keys not set. Push notifications will be disabled.")
    logger.warning("Generate keys with: python -c \"from pywebpush import webpush; from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)\"")

# ============================================================================
# DEEPGRAM CONFIGURATION (for voice transcription)
# ============================================================================
deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
if not deepgram_api_key or deepgram_api_key == "your_deepgram_api_key_here":
    logger.warning("DEEPGRAM_API_KEY not set. Please set your API key in .env file")
    logger.warning("Get a free API key at: https://console.deepgram.com/")
    deepgram_available = False
else:
    deepgram_available = True
