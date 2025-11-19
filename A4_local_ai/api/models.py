"""
Pydantic models for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class ChatMessage(BaseModel):
    """Single chat message"""
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Message content")


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request"""
    messages: List[ChatMessage] = Field(..., description="List of chat messages")
    model: Optional[str] = Field(None, description="Model name (optional)")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(0.9, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(40, ge=1)
    max_tokens: Optional[int] = Field(2048, ge=1)
    stream: Optional[bool] = Field(False, description="Stream response")
    stop: Optional[List[str]] = Field(None, description="Stop sequences")


class CompletionRequest(BaseModel):
    """Simple text completion request"""
    prompt: str = Field(..., description="Input prompt")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(0.9, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(40, ge=1)
    max_tokens: Optional[int] = Field(2048, ge=1)
    stop: Optional[List[str]] = Field(None, description="Stop sequences")


class GeminiRequest(BaseModel):
    """Gemini API compatible request"""
    contents: List[Dict[str, Any]] = Field(..., description="Content parts")
    systemInstruction: Optional[Dict[str, Any]] = Field(None, description="System instruction")
    generationConfig: Optional[Dict[str, Any]] = Field(None, description="Generation config")


class ChatCompletionResponse(BaseModel):
    """Chat completion response"""
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


class CompletionResponse(BaseModel):
    """Text completion response"""
    id: str
    object: str = "text.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


class GeminiResponse(BaseModel):
    """Gemini API compatible response"""
    candidates: List[Dict[str, Any]]
    usageMetadata: Optional[Dict[str, int]] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    gpu_available: bool
    cuda_version: Optional[str] = None
    vram_used_mb: Optional[float] = None
    vram_total_mb: Optional[float] = None


class ModelInfo(BaseModel):
    """Model information"""
    name: str
    type: str
    context_size: int
    gpu_layers: int
    parameters: Optional[str] = None
