"""
Transcription & User Routes
----------------------------
Handles speech-to-text transcription via the Deepgram Nova-3 API and
exposes a simple endpoint for retrieving the authenticated user's profile.
Audio files are uploaded, validated for size, and sent to Deepgram for
real-time transcription.
"""
# ============================================================================
# TRANSCRIPTION & USER ROUTES
# ============================================================================
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Request
import httpx

from config import deepgram_api_key, deepgram_available
from auth import get_current_user_dependency
from rate_limit import limiter
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Return the authenticated user's profile info (id, email, etc.)
@router.get("/me")
@limiter.limit("60/minute")
async def get_current_user_info(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Get current user information"""
    return current_user

# Accept an audio file upload and return its text transcription.
# Uses Deepgram's Nova-3 multilingual model with smart formatting, punctuation, and numeral conversion.
@router.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_dependency)
):
    """Transcribe audio file to text using Deepgram API"""
    if not deepgram_available:
        raise HTTPException(
            status_code=503,
            detail="Deepgram API key not configured. Please set DEEPGRAM_API_KEY in .env file. Get a free API key at: https://console.deepgram.com/"
        )

    try:
        # Enforce a 10 MB upload limit to prevent abuse
        max_size = 10 * 1024 * 1024
        audio_content = await audio.read()
        if len(audio_content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="Audio file too large. Maximum size is 10MB."
            )

        # Use Deepgram REST API v1 endpoint with nova-3 multilingual model
        url = "https://api.deepgram.com/v1/listen"
        headers = {
            "Authorization": f"Token {deepgram_api_key}",
        }
        params = {
            "model": "nova-3",  # Deepgram's latest STT model
            "language": "multi",  # Multilingual mode w/ code-switching (en, es, fr, de, hi, it, ja, nl, ru, pt)
            "smart_format": "true",
            "punctuate": "true",
            "numerals": "true",
        }

        # Send audio to Deepgram API using multipart form data
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers=headers,
                params=params,
                files={"audio": (audio.filename or "audio.webm", audio_content, audio.content_type or "audio/webm")}
            )
            response.raise_for_status()
            result = response.json()

        # Deepgram returns results nested as: results -> channels[] -> alternatives[]
        if result.get("results") and result["results"].get("channels") and len(result["results"]["channels"]) > 0:
            transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
            return {"transcript": transcript}
        else:
            raise HTTPException(
                status_code=500,
                detail="No transcript returned from Deepgram API"
            )

    except httpx.HTTPStatusError as e:
        logger.error("Deepgram API HTTP error: %d - %s", e.response.status_code, e.response.text)
        raise HTTPException(
            status_code=502,
            detail="Transcription service error"
        )
    except Exception as e:
        logger.exception("Deepgram transcription error")
        raise HTTPException(
            status_code=500,
            detail="Transcription failed"
        )
