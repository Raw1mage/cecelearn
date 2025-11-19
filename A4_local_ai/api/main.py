"""
FastAPI server for local LLM inference
OpenAI and Gemini API compatible
"""
import time
import uuid
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys

from config.settings import Settings, get_settings
from api.models import (
    ChatCompletionRequest,
    CompletionRequest,
    GeminiRequest,
    ChatCompletionResponse,
    CompletionResponse,
    GeminiResponse,
    HealthResponse,
    ModelInfo,
)
from api.llm_engine import LLMEngine

# Configure logger
logger.remove()
logger.add(sys.stderr, level="INFO")

# Global LLM engine instance
llm_engine: LLMEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown"""
    global llm_engine

    # Startup
    settings = get_settings()
    logger.info("Starting LLM API server...")
    logger.info(f"Loading model: {settings.model_path}")

    try:
        llm_engine = LLMEngine(settings)
        llm_engine.load_model()
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        logger.warning("Server starting without model. /health will show model_loaded: false")

    yield

    # Shutdown
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Local LLM API",
    description="OpenAI and Gemini compatible API for local LLM inference",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=settings.allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Local LLM API Server",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "model_info": "/v1/models",
            "chat_completion": "/v1/chat/completions",
            "completion": "/v1/completions",
            "gemini": "/v1beta/models/{model}:generateContent",
        },
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    import torch

    gpu_available = torch.cuda.is_available()
    model_loaded = llm_engine is not None and llm_engine.model is not None

    response = {
        "status": "healthy" if model_loaded else "degraded",
        "model_loaded": model_loaded,
        "gpu_available": gpu_available,
    }

    if gpu_available:
        response["cuda_version"] = torch.version.cuda
        if model_loaded:
            response["vram_used_mb"] = torch.cuda.memory_allocated() / 1024 / 1024
            response["vram_total_mb"] = torch.cuda.get_device_properties(0).total_memory / 1024 / 1024

    return response


@app.get("/v1/models")
async def list_models():
    """List available models (OpenAI compatible)"""
    if llm_engine is None or llm_engine.model is None:
        return {"data": [], "object": "list"}

    model_info = llm_engine.get_model_info()

    return {
        "object": "list",
        "data": [
            {
                "id": model_info["name"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "local",
                "permission": [],
                "root": model_info["name"],
                "parent": None,
            }
        ],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint
    """
    if llm_engine is None or llm_engine.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Convert messages to dict format
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        # Generate response
        response_text = llm_engine.chat(
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            stop=request.stop,
        )

        # Format OpenAI-compatible response
        completion_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
        created_time = int(time.time())

        return {
            "id": completion_id,
            "object": "chat.completion",
            "created": created_time,
            "model": llm_engine.model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": response_text},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 0,  # Approximation
                "completion_tokens": len(response_text.split()),
                "total_tokens": len(response_text.split()),
            },
        }

    except Exception as e:
        logger.error(f"Error in chat completion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/completions")
async def completions(request: CompletionRequest):
    """
    OpenAI-compatible text completions endpoint
    """
    if llm_engine is None or llm_engine.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Generate response
        response_text = llm_engine.generate(
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            stop=request.stop,
        )

        # Format OpenAI-compatible response
        completion_id = f"cmpl-{uuid.uuid4().hex[:8]}"
        created_time = int(time.time())

        return {
            "id": completion_id,
            "object": "text_completion",
            "created": created_time,
            "model": llm_engine.model_name,
            "choices": [
                {
                    "text": response_text,
                    "index": 0,
                    "logprobs": None,
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": len(request.prompt.split()),
                "completion_tokens": len(response_text.split()),
                "total_tokens": len(request.prompt.split()) + len(response_text.split()),
            },
        }

    except Exception as e:
        logger.error(f"Error in completion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1beta/models/{model}:generateContent")
async def gemini_generate_content(model: str, request: GeminiRequest):
    """
    Gemini API-compatible endpoint
    Supports the format used by A2_Chinese_idiom_practice
    """
    if llm_engine is None or llm_engine.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Extract system instruction
        system_instruction = ""
        if request.systemInstruction:
            system_parts = request.systemInstruction.get("parts", [])
            if system_parts:
                system_instruction = system_parts[0].get("text", "")

        # Extract user query
        user_query = ""
        if request.contents:
            user_parts = request.contents[0].get("parts", [])
            if user_parts:
                user_query = user_parts[0].get("text", "")

        # Build messages
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        if user_query:
            messages.append({"role": "user", "content": user_query})

        # Extract generation config
        gen_config = request.generationConfig or {}
        temperature = gen_config.get("temperature", 0.7)
        max_tokens = gen_config.get("maxOutputTokens", 2048)
        top_p = gen_config.get("topP", 0.9)
        top_k = gen_config.get("topK", 40)

        # Generate response
        response_text = llm_engine.chat(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
        )

        # Format Gemini-compatible response
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": response_text}],
                        "role": "model",
                    },
                    "finishReason": "STOP",
                    "index": 0,
                    "safetyRatings": [],
                }
            ],
            "usageMetadata": {
                "promptTokenCount": len(user_query.split()),
                "candidatesTokenCount": len(response_text.split()),
                "totalTokenCount": len(user_query.split()) + len(response_text.split()),
            },
        }

    except Exception as e:
        logger.error(f"Error in Gemini endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        workers=settings.api_workers,
        log_level=settings.log_level,
    )
