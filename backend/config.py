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

# Load environment variables
load_dotenv()

# ============================================================================
# SUPABASE CONFIGURATION
# ============================================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Initialize Supabase client
if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL and SUPABASE_KEY not set. Please set them in .env file")
    print("Get your credentials from: https://supabase.com/dashboard")
    supabase: Optional[Client] = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Supabase client initialized successfully")

# ============================================================================
# JWKS CACHE FOR JWT VALIDATION
# ============================================================================
jwks_cache = {}

def get_jwks_key(kid: str):
    """Fetch and cache JWKS keys from Supabase using httpx"""
    global jwks_cache
    if kid in jwks_cache:
        return jwks_cache[kid]

    if not SUPABASE_URL:
        return None

    jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        response = httpx.get(jwks_url)
        response.raise_for_status()
        jwks_data = response.json()

        for key_data in jwks_data.get("keys", []):
            key_id = key_data.get("kid")
            if key_id:
                jwks_cache[key_id] = PyJWK.from_dict(key_data).key

        return jwks_cache.get(kid)
    except Exception as e:
        print(f"Error fetching JWKS: {e}")
        return None

# ============================================================================
# GROQ CLIENT (for expense extraction)
# ============================================================================
groq_api_key = os.getenv("GROQ_API_KEY", "")
if not groq_api_key or groq_api_key == "your_groq_api_key_here":
    print("WARNING: GROQ_API_KEY not set. Please set your API key in .env file")
    print("Get a free API key at: https://console.groq.com/")
    groq_client = None
else:
    groq_client = Groq(api_key=groq_api_key)

# ============================================================================
# DEEPGRAM CONFIGURATION (for voice transcription)
# ============================================================================
deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
if not deepgram_api_key or deepgram_api_key == "your_deepgram_api_key_here":
    print("WARNING: DEEPGRAM_API_KEY not set. Please set your API key in .env file")
    print("Get a free API key at: https://console.deepgram.com/")
    deepgram_available = False
else:
    deepgram_available = True
