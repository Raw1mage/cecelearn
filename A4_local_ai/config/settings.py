"""
Application settings and configuration
"""
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_workers: int = 1
    log_level: str = "info"

    # Model Configuration
    model_path: str = "./models/mistral-7b-instruct-v0.2.Q4_K_M.gguf"
    model_type: str = "llama-cpp"  # llama-cpp, transformers, vllm
    max_tokens: int = 2048
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40

    # GPU Configuration
    use_gpu: bool = True
    gpu_layers: int = 35  # Adjust based on VRAM available
    main_gpu: int = 0
    tensor_split: Optional[str] = None

    # Context Settings
    context_size: int = 4096
    batch_size: int = 512

    # API Security
    api_key: Optional[str] = None
    enable_auth: bool = False

    # CORS Settings
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
    allow_credentials: bool = True

    # Performance
    threads: int = 8
    cache_size: int = 2048

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
