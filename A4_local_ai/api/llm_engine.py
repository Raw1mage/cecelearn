"""
LLM Engine for managing model inference
"""
import os
import torch
from typing import Optional, Generator, Dict, Any, List
from loguru import logger
from config.settings import Settings


class LLMEngine:
    """LLM inference engine supporting multiple backends"""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = None
        self.model_type = settings.model_type
        self.model_name = os.path.basename(settings.model_path)

    def load_model(self):
        """Load the LLM model based on configuration"""
        logger.info(f"Loading model: {self.settings.model_path}")
        logger.info(f"Model type: {self.model_type}")

        if self.model_type == "llama-cpp":
            self._load_llama_cpp()
        elif self.model_type == "transformers":
            self._load_transformers()
        elif self.model_type == "vllm":
            self._load_vllm()
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

        logger.info("Model loaded successfully")

    def _load_llama_cpp(self):
        """Load model using llama-cpp-python"""
        try:
            from llama_cpp import Llama

            # Check if model file exists
            if not os.path.exists(self.settings.model_path):
                logger.warning(f"Model file not found: {self.settings.model_path}")
                logger.info("Please download a model first. See docs/MODEL_SETUP.md")
                raise FileNotFoundError(f"Model not found: {self.settings.model_path}")

            self.model = Llama(
                model_path=self.settings.model_path,
                n_ctx=self.settings.context_size,
                n_batch=self.settings.batch_size,
                n_gpu_layers=self.settings.gpu_layers if self.settings.use_gpu else 0,
                n_threads=self.settings.threads,
                verbose=False,
                use_mmap=True,
                use_mlock=True,
            )
            logger.info(f"Loaded llama-cpp model with {self.settings.gpu_layers} GPU layers")

        except ImportError:
            logger.error("llama-cpp-python not installed. Install with: pip install llama-cpp-python")
            raise

    def _load_transformers(self):
        """Load model using transformers library"""
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            device = "cuda" if self.settings.use_gpu and torch.cuda.is_available() else "cpu"

            self.tokenizer = AutoTokenizer.from_pretrained(self.settings.model_path)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.settings.model_path,
                device_map="auto" if device == "cuda" else None,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                low_cpu_mem_usage=True,
            )

            if device == "cpu":
                self.model = self.model.to(device)

            logger.info(f"Loaded transformers model on {device}")

        except ImportError:
            logger.error("transformers not installed. Install with: pip install transformers torch")
            raise

    def _load_vllm(self):
        """Load model using vLLM"""
        try:
            from vllm import LLM

            self.model = LLM(
                model=self.settings.model_path,
                gpu_memory_utilization=0.9,
                max_model_len=self.settings.context_size,
                dtype="float16",
            )
            logger.info("Loaded vLLM model")

        except ImportError:
            logger.error("vLLM not installed. Install with: pip install vllm")
            raise

    def generate(
        self,
        prompt: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None,
        stop: Optional[List[str]] = None,
        stream: bool = False,
    ) -> str:
        """Generate text completion"""

        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        # Use defaults from settings if not provided
        max_tokens = max_tokens or self.settings.max_tokens
        temperature = temperature if temperature is not None else self.settings.temperature
        top_p = top_p if top_p is not None else self.settings.top_p
        top_k = top_k if top_k is not None else self.settings.top_k

        if self.model_type == "llama-cpp":
            return self._generate_llama_cpp(prompt, max_tokens, temperature, top_p, top_k, stop, stream)
        elif self.model_type == "transformers":
            return self._generate_transformers(prompt, max_tokens, temperature, top_p, top_k, stop)
        elif self.model_type == "vllm":
            return self._generate_vllm(prompt, max_tokens, temperature, top_p, stop)

    def _generate_llama_cpp(self, prompt, max_tokens, temperature, top_p, top_k, stop, stream):
        """Generate using llama-cpp"""
        output = self.model(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            stop=stop or [],
            stream=stream,
        )

        if stream:
            return output
        else:
            return output['choices'][0]['text']

    def _generate_transformers(self, prompt, max_tokens, temperature, top_p, top_k, stop):
        """Generate using transformers"""
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

        outputs = self.model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            do_sample=True,
            pad_token_id=self.tokenizer.eos_token_id,
        )

        generated_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        # Remove the input prompt from output
        generated_text = generated_text[len(prompt):]

        return generated_text

    def _generate_vllm(self, prompt, max_tokens, temperature, top_p, stop):
        """Generate using vLLM"""
        from vllm import SamplingParams

        sampling_params = SamplingParams(
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            stop=stop,
        )

        outputs = self.model.generate([prompt], sampling_params)
        return outputs[0].outputs[0].text

    def chat(
        self,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None,
        stop: Optional[List[str]] = None,
    ) -> str:
        """Generate chat completion"""

        # Format messages into a prompt
        prompt = self._format_chat_prompt(messages)

        return self.generate(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            stop=stop,
        )

    def _format_chat_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Format chat messages into a single prompt"""

        # Mistral/Llama style format
        prompt_parts = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                prompt_parts.append(f"<s>[INST] {content} [/INST]</s>")
            elif role == "user":
                prompt_parts.append(f"<s>[INST] {content} [/INST]")
            elif role == "assistant":
                prompt_parts.append(f"{content}</s>")

        return "\n".join(prompt_parts)

    def get_model_info(self) -> Dict[str, Any]:
        """Get model information"""
        gpu_available = torch.cuda.is_available()

        info = {
            "name": self.model_name,
            "type": self.model_type,
            "context_size": self.settings.context_size,
            "gpu_layers": self.settings.gpu_layers if self.settings.use_gpu else 0,
            "gpu_available": gpu_available,
        }

        if gpu_available:
            info["cuda_version"] = torch.version.cuda
            info["vram_used_mb"] = torch.cuda.memory_allocated() / 1024 / 1024
            info["vram_total_mb"] = torch.cuda.get_device_properties(0).total_memory / 1024 / 1024

        return info
