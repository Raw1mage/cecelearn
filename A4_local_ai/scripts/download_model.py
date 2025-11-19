#!/usr/bin/env python3
"""
Script to download recommended models for the local LLM API
Supports downloading from HuggingFace
"""
import os
import sys
import argparse
from pathlib import Path


def download_from_huggingface(repo_id: str, filename: str, output_dir: str):
    """Download a model file from HuggingFace"""
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Error: huggingface_hub not installed")
        print("Install with: pip install huggingface_hub")
        sys.exit(1)

    print(f"Downloading {filename} from {repo_id}...")
    print(f"This may take a while depending on your internet connection...")

    try:
        file_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=output_dir,
            local_dir_use_symlinks=False,
        )
        print(f"\nDownload complete!")
        print(f"Model saved to: {file_path}")
        return file_path
    except Exception as e:
        print(f"Error downloading model: {e}")
        sys.exit(1)


RECOMMENDED_MODELS = {
    "mistral-7b-instruct": {
        "repo_id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
        "filename": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "description": "Mistral 7B Instruct (4-bit quantized) - Recommended for RTX 3090",
        "vram": "~5GB",
        "gpu_layers": 35,
    },
    "llama2-13b-chat": {
        "repo_id": "TheBloke/Llama-2-13B-chat-GGUF",
        "filename": "llama-2-13b-chat.Q4_K_M.gguf",
        "description": "Llama 2 13B Chat (4-bit quantized)",
        "vram": "~8GB",
        "gpu_layers": 40,
    },
    "openchat-3.5": {
        "repo_id": "TheBloke/openchat-3.5-1210-GGUF",
        "filename": "openchat-3.5-1210.Q4_K_M.gguf",
        "description": "OpenChat 3.5 (4-bit quantized) - Excellent for chat",
        "vram": "~5GB",
        "gpu_layers": 35,
    },
    "yi-34b-chat": {
        "repo_id": "TheBloke/Yi-34B-Chat-GGUF",
        "filename": "yi-34b-chat.Q4_K_M.gguf",
        "description": "Yi 34B Chat (4-bit quantized) - High quality, needs more VRAM",
        "vram": "~20GB",
        "gpu_layers": 60,
    },
}


def list_models():
    """List all recommended models"""
    print("\n=== Recommended Models ===\n")
    for key, model in RECOMMENDED_MODELS.items():
        print(f"  {key}")
        print(f"    {model['description']}")
        print(f"    VRAM: {model['vram']}, GPU Layers: {model['gpu_layers']}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Download LLM models")
    parser.add_argument(
        "model",
        nargs="?",
        help="Model to download (use --list to see options)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available models",
    )
    parser.add_argument(
        "--output-dir",
        default="./models",
        help="Output directory (default: ./models)",
    )
    parser.add_argument(
        "--custom",
        nargs=2,
        metavar=("REPO_ID", "FILENAME"),
        help="Download custom model: REPO_ID FILENAME",
    )

    args = parser.parse_args()

    if args.list or not args.model and not args.custom:
        list_models()
        print("Usage:")
        print("  python download_model.py mistral-7b-instruct")
        print("  python download_model.py --custom TheBloke/MODEL-GGUF model.gguf")
        return

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.custom:
        repo_id, filename = args.custom
        download_from_huggingface(repo_id, filename, str(output_dir))
    elif args.model in RECOMMENDED_MODELS:
        model_info = RECOMMENDED_MODELS[args.model]
        print(f"\nDownloading: {model_info['description']}")
        print(f"VRAM required: {model_info['vram']}")
        print(f"Recommended GPU layers: {model_info['gpu_layers']}\n")

        file_path = download_from_huggingface(
            model_info["repo_id"],
            model_info["filename"],
            str(output_dir),
        )

        print("\n" + "=" * 60)
        print("Next steps:")
        print(f"1. Update .env file with: MODEL_PATH={file_path}")
        print(f"2. Set GPU_LAYERS={model_info['gpu_layers']} in .env")
        print("3. Start the server with: python -m api.main")
        print("=" * 60)
    else:
        print(f"Error: Unknown model '{args.model}'")
        print("Use --list to see available models")
        sys.exit(1)


if __name__ == "__main__":
    main()
