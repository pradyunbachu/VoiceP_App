# ============================================================================
# TRANSCRIPTION & USER ROUTES
# ============================================================================
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Request
import httpx

from config import deepgram_api_key, deepgram_available
from auth import get_current_user_dependency
from rate_limit import limiter

router = APIRouter()

@router.get("/me")
@limiter.limit("60/minute")
async def get_current_user_info(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Get current user information"""
    return current_user

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
        # Read audio file content with size limit (10MB)
        max_size = 10 * 1024 * 1024
        audio_content = await audio.read()
        if len(audio_content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="Audio file too large. Maximum size is 10MB."
            )

        # Use Deepgram REST API v1 endpoint with nova-2 model
        url = "https://api.deepgram.com/v1/listen"
        headers = {
            "Authorization": f"Token {deepgram_api_key}",
        }
        params = {
            "model": "nova-2",
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

        # Extract transcript from response
        if result.get("results") and result["results"].get("channels") and len(result["results"]["channels"]) > 0:
            transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
            return {"transcript": transcript}
        else:
            raise HTTPException(
                status_code=500,
                detail="No transcript returned from Deepgram API"
            )

    except httpx.HTTPStatusError as e:
        print(f"Deepgram API HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=502,
            detail="Transcription service error"
        )
    except Exception as e:
        print(f"Deepgram transcription error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Transcription failed"
        )
