# Quick Start Guide - A4 Local AI

This guide will help you get the Local AI API running on your RTX 3090 in under 10 minutes.

## Prerequisites

- NVIDIA RTX 3090 GPU
- CUDA 12.1 or later installed
- Python 3.11+
- 50GB free disk space (for models)

## Step-by-Step Setup

### 1. Verify GPU

```bash
nvidia-smi
```

You should see your RTX 3090 with ~24GB memory.

### 2. Setup Project

```bash
cd A4_local_ai

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install CUDA support
bash scripts/install_cuda_support.sh
```

### 3. Download Model

```bash
# Install HuggingFace Hub
pip install huggingface_hub

# Download recommended model (Mistral 7B - 4GB download)
python scripts/download_model.py mistral-7b-instruct
```

This will download the model to `./models/` directory.

### 4. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration (optional - defaults work for RTX 3090)
nano .env
```

Key settings for RTX 3090:
```bash
MODEL_PATH=./models/mistral-7b-instruct-v0.2.Q4_K_M.gguf
GPU_LAYERS=35
USE_GPU=true
CONTEXT_SIZE=4096
```

### 5. Start Server

```bash
python -m api.main
```

You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Loading model: ./models/mistral-7b-instruct-v0.2.Q4_K_M.gguf
INFO:     Model loaded successfully
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 6. Test API

Open a new terminal:

```bash
# Health check
curl http://localhost:8000/health

# Test chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Say hello in Chinese"}
    ]
  }'
```

## Using with A2_Chinese_idiom_practice

### Update the JavaScript

Edit `A2_Chinese_idiom_practice/js/app.js`:

```javascript
// OLD (line ~310):
const apiKey = "";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

// NEW:
const apiKey = "";
const apiUrl = `http://localhost:8000/v1beta/models/gemini:generateContent`;
```

That's it! Now A2 will use your local AI instead of Google's API.

## Performance Expectations

On RTX 3090:
- **Load time**: 3-5 seconds
- **First token**: ~500ms
- **Generation speed**: 80-100 tokens/second
- **VRAM usage**: ~5GB (leaves 19GB free)

## Common Issues

### Issue: "Model not found"
```bash
# Solution: Download the model
python scripts/download_model.py mistral-7b-instruct
```

### Issue: "CUDA not available"
```bash
# Solution: Install CUDA toolkit
# Download from: https://developer.nvidia.com/cuda-downloads

# Or reinstall llama-cpp with CUDA
bash scripts/install_cuda_support.sh
```

### Issue: Out of memory
```bash
# Solution: Reduce GPU layers in .env
GPU_LAYERS=30  # Instead of 35
```

### Issue: Slow generation
```bash
# Solution: Increase GPU layers in .env
GPU_LAYERS=35  # Full GPU offload
```

## Alternative: Docker Setup

If you prefer Docker:

```bash
# Copy environment
cp .env.example .env

# Download model first (Docker can't do this easily)
python scripts/download_model.py mistral-7b-instruct

# Build and run
docker-compose up --build
```

## Next Steps

1. **Test with A2**: Open A2_Chinese_idiom_practice in browser
2. **Monitor GPU**: Run `watch -n 1 nvidia-smi` to watch VRAM usage
3. **Try different models**: See `docs/MODEL_GUIDE.md` for options
4. **Optimize settings**: Adjust `.env` for your use case

## Getting Help

1. Check logs: `python -m api.main` shows detailed logs
2. Test endpoint: `http://localhost:8000/docs` for Swagger UI
3. Verify GPU: `curl http://localhost:8000/health` shows GPU status

## Success Checklist

- [ ] GPU visible in `nvidia-smi`
- [ ] Model downloaded in `./models/`
- [ ] Server starts without errors
- [ ] `/health` endpoint returns `"model_loaded": true`
- [ ] Chat completion works
- [ ] A2 project can generate questions

Congratulations! Your local AI is ready to use.
