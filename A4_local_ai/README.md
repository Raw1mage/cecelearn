# A4 Local AI - GPU-Accelerated LLM API Server

A high-performance local LLM API server with GPU acceleration (CUDA) for RTX 3090, providing OpenAI and Gemini-compatible APIs to support all A1_*, A2_*, and A3_* projects.

## Features

- 🚀 **GPU Acceleration**: Full CUDA support for RTX 3090 (24GB VRAM)
- 🔄 **API Compatibility**: OpenAI and Gemini API compatible endpoints
- 🎯 **Multiple Backends**: Support for llama-cpp, transformers, and vLLM
- 🐳 **Docker Ready**: Easy deployment with Docker and docker-compose
- 🔒 **CORS Enabled**: Pre-configured for A1/A2/A3 frontend integration
- 📊 **Monitoring**: Health checks and GPU usage metrics

## Quick Start

### 1. Setup Environment

```bash
cd A4_local_ai

# Copy environment template
cp .env.example .env

# Edit .env to configure your settings
nano .env
```

### 2. Install Dependencies

#### Option A: Using Virtual Environment (Recommended)

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install basic dependencies
pip install -r requirements.txt

# Install CUDA-enabled llama-cpp-python
bash scripts/install_cuda_support.sh
```

#### Option B: Using Docker

```bash
# Build and run with docker-compose
docker-compose up --build
```

### 3. Download a Model

```bash
# List available models
python scripts/download_model.py --list

# Download recommended model for RTX 3090 (Mistral 7B)
python scripts/download_model.py mistral-7b-instruct

# Or download a custom model
python scripts/download_model.py --custom TheBloke/MODEL-GGUF model.gguf
```

### 4. Start the Server

```bash
# Using Python directly
python -m api.main

# Or using uvicorn
uvicorn api.main:app --host 0.0.0.0 --port 8000

# Or using Docker
docker-compose up
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### OpenAI Chat Completion
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 150
  }'
```

### Gemini API (Compatible with A2_Chinese_idiom_practice)
```bash
curl http://localhost:8000/v1beta/models/gemini:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Explain quantum computing"}]}],
    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 500}
  }'
```

### List Models
```bash
curl http://localhost:8000/v1/models
```

## Integration with Existing Projects

### A2_Chinese_idiom_practice

Update the API URL in `js/app.js`:

```javascript
// Change from Gemini API
const apiUrl = `http://localhost:8000/v1beta/models/gemini:generateContent`;
```

No API key needed! The local server handles authentication.

### A1_Chinese_word_lookup

Can integrate for enhanced word explanations and example generation.

### A3_Math_4ops_learn

Can use for generating custom math problems and explanations.

## Recommended Models for RTX 3090

| Model | VRAM | GPU Layers | Use Case |
|-------|------|------------|----------|
| Mistral 7B Instruct Q4 | ~5GB | 35 | General purpose, recommended |
| Llama 2 13B Chat Q4 | ~8GB | 40 | Better quality responses |
| OpenChat 3.5 Q4 | ~5GB | 35 | Excellent for chat |
| Yi 34B Chat Q4 | ~20GB | 60 | Highest quality, max VRAM |

## Configuration

Edit `.env` file to customize:

```bash
# Model settings
MODEL_PATH=./models/your-model.gguf
GPU_LAYERS=35  # Adjust based on VRAM

# Performance
CONTEXT_SIZE=4096
BATCH_SIZE=512
THREADS=8

# API
API_PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## GPU Optimization Tips

### For RTX 3090 (24GB VRAM):

1. **7B Models**: Set `GPU_LAYERS=35` (full offload)
2. **13B Models**: Set `GPU_LAYERS=40` (full offload)
3. **34B Models**: Set `GPU_LAYERS=60` (full offload, Q4 quantization)

### Monitor GPU Usage:

```bash
# Check GPU memory
nvidia-smi

# Watch in real-time
watch -n 1 nvidia-smi
```

## Troubleshooting

### CUDA not found
```bash
# Install CUDA Toolkit 12.1
wget https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda_12.1.0_530.30.02_linux.run
sudo sh cuda_12.1.0_530.30.02_linux.run
```

### Out of memory
- Reduce `GPU_LAYERS` in `.env`
- Use smaller model or higher quantization (Q4_K_M instead of Q5_K_M)
- Reduce `CONTEXT_SIZE` or `BATCH_SIZE`

### Slow inference
- Increase `GPU_LAYERS` (offload more to GPU)
- Reduce `CONTEXT_SIZE` if not needed
- Use quantized models (Q4_K_M)

## Performance Benchmarks

On RTX 3090 with Mistral 7B Q4_K_M:

- **Tokens/sec**: ~80-100 tokens/sec
- **Latency**: ~50ms per token
- **VRAM Usage**: ~5GB
- **Context**: 4096 tokens

## API Documentation

Full API documentation available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## License

MIT License - Free to use for all projects.

## Support

For issues or questions:
1. Check `/health` endpoint for system status
2. Review logs for error messages
3. Verify GPU availability with `nvidia-smi`
4. Ensure model file exists in `models/` directory
