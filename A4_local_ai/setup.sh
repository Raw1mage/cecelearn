#!/bin/bash
# Complete setup script for A4 Local AI

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  A4 Local AI - Setup Script${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Check Python version
echo -e "${YELLOW}Checking Python version...${NC}"
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "Found Python $PYTHON_VERSION"

# Check GPU
echo -e "\n${YELLOW}Checking for NVIDIA GPU...${NC}"
if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓ NVIDIA GPU detected${NC}"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo -e "${RED}⚠ No NVIDIA GPU detected${NC}"
    echo "GPU acceleration will not be available."
fi

# Create virtual environment
echo -e "\n${YELLOW}Creating virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo -e "\n${YELLOW}Upgrading pip...${NC}"
pip install --upgrade pip setuptools wheel

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
pip install -r requirements.txt

# Install CUDA support if GPU available
if command -v nvidia-smi &> /dev/null; then
    echo -e "\n${YELLOW}Installing CUDA support for llama-cpp-python...${NC}"
    echo "This may take several minutes..."
    bash scripts/install_cuda_support.sh
fi

# Setup environment file
echo -e "\n${YELLOW}Setting up environment configuration...${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo "Please edit .env to configure your model path"
else
    echo ".env already exists"
fi

# Create models directory
echo -e "\n${YELLOW}Creating models directory...${NC}"
mkdir -p models
echo -e "${GREEN}✓ Models directory ready${NC}"

# Summary
echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Download a model:"
echo -e "   ${YELLOW}python scripts/download_model.py mistral-7b-instruct${NC}"
echo ""
echo "2. Configure .env file (if needed):"
echo -e "   ${YELLOW}nano .env${NC}"
echo ""
echo "3. Start the server:"
echo -e "   ${YELLOW}bash scripts/run_server.sh${NC}"
echo ""
echo "4. Test the API:"
echo -e "   ${YELLOW}python test_api.py${NC}"
echo ""
echo "For more information, see README.md and docs/QUICK_START.md"
echo ""
