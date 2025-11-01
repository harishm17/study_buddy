"""Anthropic LLM provider implementation."""
import json
import logging
from typing import Dict, List, Optional

from anthropic import AsyncAnthropic

from app.config import settings
from app.services.llm.base import LLMMessage, LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    """Anthropic (Claude) implementation of LLM provider."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "claude-3-5-sonnet-20241022",
        mini_model: str = "claude-3-5-haiku-20241022",
    ):
        """Initialize Anthropic provider.

        Args:
            api_key: Anthropic API key
            default_model: Default model for generation
            mini_model: Model for simple tasks
        """
        self.client = AsyncAnthropic(api_key=api_key)
        self.default_model = default_model
        self.mini_model = mini_model

    async def generate_text(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = 4096,
        use_mini: bool = False,
        **kwargs,
    ) -> LLMResponse:
        """Generate text using Anthropic.

        Args:
            messages: Conversation messages
            temperature: Sampling temperature
            max_tokens: Max tokens to generate
            use_mini: Use mini model for simple tasks
            **kwargs: Additional Anthropic parameters

        Returns:
            LLMResponse with generated text
        """
        model = self.mini_model if use_mini else self.default_model

        # Anthropic requires system message to be separate
        system_msg = None
        conversation_messages = []

        for msg in messages:
            if msg.role == "system":
                system_msg = msg.content
            else:
                conversation_messages.append({"role": msg.role, "content": msg.content})

        response = await self.client.messages.create(
            model=model,
            system=system_msg,
            messages=conversation_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )

        content_text = response.content[0].text if response.content else ""
        tokens_used = (
            response.usage.input_tokens + response.usage.output_tokens
            if response.usage
            else 0
        )

        return LLMResponse(
            content=content_text,
            tokens_used=tokens_used,
            model=model,
            finish_reason=response.stop_reason or "stop",
        )

    async def generate_structured(
        self,
        messages: List[LLMMessage],
        response_format: Optional[Dict] = None,
        use_mini: bool = False,
        **kwargs,
    ) -> Dict:
        """Generate structured JSON using Anthropic.

        Args:
            messages: Conversation messages
            response_format: Expected JSON schema (not directly supported by Anthropic)
            use_mini: Use mini model
            **kwargs: Additional parameters

        Returns:
            Parsed JSON dictionary
        """
        # Anthropic doesn't have native JSON mode, so we need to instruct it in the prompt
        # Add JSON instruction to the last user message
        if messages:
            last_msg = messages[-1]
            if last_msg.role == "user":
                json_instruction = "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanations, just the JSON object."
                modified_messages = messages[:-1] + [
                    LLMMessage(
                        role="user", content=last_msg.content + json_instruction
                    )
                ]
            else:
                modified_messages = messages + [
                    LLMMessage(
                        role="user",
                        content="Respond with ONLY valid JSON. No markdown, no explanations, just the JSON object.",
                    )
                ]
        else:
            modified_messages = messages

        response = await self.generate_text(
            modified_messages, use_mini=use_mini, **kwargs
        )

        # Parse JSON from response
        try:
            # Try to extract JSON from response (might have markdown code blocks)
            content = response.content.strip()
            if content.startswith("```json"):
                content = content[7:]  # Remove ```json
            if content.startswith("```"):
                content = content[3:]  # Remove ```
            if content.endswith("```"):
                content = content[:-3]  # Remove closing ```
            content = content.strip()

            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from Anthropic response: {e}")
            logger.error(f"Response content: {response.content[:500]}")
            raise ValueError(f"Anthropic response was not valid JSON: {e}")

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using Anthropic.

        Note: Anthropic doesn't have embedding models.
        This will raise an error or fallback to OpenAI if configured.

        Args:
            text: Text to embed

        Returns:
            Embedding vector

        Raises:
            NotImplementedError: Anthropic doesn't support embeddings
        """
        raise NotImplementedError(
            "Anthropic doesn't provide embedding models. "
            "Use OpenAI for embeddings or configure a hybrid setup."
        )

