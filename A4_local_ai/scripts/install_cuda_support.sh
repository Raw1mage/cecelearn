#!/bin/bash
# Script to install CUDA-enabled llama-cpp-python for RTX 3090

set -e

echo "=== Installing CUDA-enabled llama-cpp-python for RTX 3090 ==="
echo ""

# Check if CUDA is available
if ! command -v nvcc &> /dev/null; then
    echo "WARNING: nvcc not found. Please install CUDA Toolkit first."
    echo "Download from: https://developer.nvidia.com/cuda-downloads"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Detect CUDA version
if command -v nvcc &> /dev/null; then
    CUDA_VERSION=$(nvcc --version | grep "release" | sed -n 's/.*release \([0-9]\+\.[0-9]\+\).*/\1/p')
    echo "Detected CUDA version: $CUDA_VERSION"
else
    echo "CUDA not detected, will try to install with CUDA 12.1"
    CUDA_VERSION="12.1"
fi

# Install llama-cpp-python with CUDA support
echo ""
echo "Installing llama-cpp-python with CUDA support..."
echo "This may take several minutes as it compiles from source..."
echo ""

# Set environment variables for CUDA compilation
export CMAKE_ARGS="-DLLAMA_CUBLAS=on"
export FORCE_CMAKE=1

# Uninstall existing version if present
pip uninstall -y llama-cpp-python 2>/dev/null || true

# Install with CUDA support
pip install llama-cpp-python --no-cache-dir --force-reinstall --upgrade

echo ""
echo "=== Installation complete! ==="
echo ""
echo "To verify GPU support, run:"
echo "  python3 -c 'from llama_cpp import Llama; print(Llama.supports_gpu_offload())'"
echo ""
