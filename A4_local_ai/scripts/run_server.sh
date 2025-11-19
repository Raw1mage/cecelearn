#!/bin/bash
# Convenience script to run the LLM API server

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Starting Local LLM API Server ===${NC}"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}.env not found. Copying from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}Please edit .env to configure your model path${NC}"
fi

# Check if models directory exists
if [ ! -d "models" ]; then
    mkdir -p models
fi

# Check for CUDA
if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓ NVIDIA GPU detected${NC}"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo -e "${YELLOW}⚠ No NVIDIA GPU detected. Will run on CPU.${NC}"
fi

echo ""
echo -e "${GREEN}Starting server...${NC}"
echo "API will be available at: http://localhost:8000"
echo "Documentation: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Run the server
python -m api.main
