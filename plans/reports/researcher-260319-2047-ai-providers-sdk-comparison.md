# AI Providers SDK Comparison Report
**Date:** 2026-03-19
**Research Period:** March 2026 (latest APIs & SDKs)

---

## Summary

Research on 6 major AI providers covering TypeScript/JavaScript SDKs, API endpoints, authentication, streaming support, and pricing models. All data sourced from official documentation and npm registries.

---

## Detailed Comparison Table

| Provider | SDK Package | Version | Endpoint | Auth Header | Streaming | Key Models | OpenAI-Compatible | Pricing Model |
|----------|-------------|---------|----------|-------------|-----------|------------|-------------------|---------------|
| **OpenAI** | `openai` | 4.77.0+ | `https://api.openai.com/v1` | `Authorization: Bearer {key}` | ✅ SSE | gpt-4o-2024-11-20, gpt-4o, gpt-4-turbo | Native | Pay-as-you-go |
| **Anthropic** | `@anthropic-ai/sdk` | 0.79.0+ | `https://api.anthropic.com/v1` | `x-api-key: {key}` | ✅ SSE | Claude 4.x, Claude 3.5 Sonnet | ⚠️ Via wrapper | Pay-as-you-go |
| **Google Gemini** | `@google/genai` | 1.45.0+ | `https://generativelanguage.googleapis.com/v1` | `x-goog-api-key: {key}` | ✅ generateContentStream() | Gemini 2.5 Flash, Gemini 2.0+ | ❌ No | Pay-as-you-go |
| **OpenRouter** | `@openrouter/sdk` | Latest beta | `https://openrouter.ai/api/v1` | `Authorization: Bearer {key}` | ✅ SSE (via OpenAI compat) | 300+ models (proxies to providers) | ✅ Full OpenAI API | Pay-as-you-go (provider rates) |
| **MiniMax** | None (native REST) | N/A | `https://api.minimax.io/v1` or `https://api.minimaxi.com/v1` (China) | `Authorization: Bearer {key}` | ✅ Server-sent events | MiniMax-M2.7 (code-optimized) | ⚠️ Anthropic-compatible endpoint | Token Plan / Pay-as-you-go |
| **Alibaba Cloud** | `dashscope-sdk-nodejs` or `@qwen-code/qwen-code` | 0.4.0+, 0.5.0+ | `https://dashscope.aliyuncs.com/api/v1` | `Authorization: Bearer {key}` | ✅ Streaming via SDK | Qwen 3.5-plus, Qwen 3-Coder | ⚠️ Anthropic-compatible endpoint | Coding Plan ($10–$50/mo) or Pay-as-you-go |

---

## Key Findings by Dimension

### TypeScript/JavaScript SDKs

| Provider | SDK Details | Notes |
|----------|-------------|-------|
| **OpenAI** | Official `openai` npm package. Auto-generated from OpenAPI spec. ESM + TypeScript 4.9+ | Agents SDK also available (`@openai/agents`) |
| **Anthropic** | Official `@anthropic-ai/sdk`. Includes streaming helpers, tool runners, retry logic | Tool runner beta features for automated tool handling |
| **Google** | Official `@google/genai`. Deprecated legacy `@google/generative-ai`. Single unified SDK across Gemini & Vertex AI | Recent GA status (May 2025) |
| **OpenRouter** | Official `@openrouter/sdk` (beta). Auto-generated from OpenAPI. ESM-only; use `await import()` in CommonJS | Also supports direct OpenAI SDK reuse with endpoint swap |
| **MiniMax** | No dedicated npm package. Use REST API directly or community wrappers. Integrates via MCP (Model Context Protocol) | MiniMax-MCP-JS available for MCP clients (Claude Desktop, Cursor) |
| **Alibaba Cloud** | `dashscope-sdk-nodejs` (official DashScope SDK). `@qwen-code/qwen-code` (CLI + TS SDK bundled). Both have TS support | Qwen Code v0.5.0 includes native TypeScript SDK + VSCode integration |

### API Endpoints

- **Standard endpoints:** OpenAI, Anthropic, Google (region-specific)
- **OpenRouter:** Unified proxy endpoint (`/v1` is OpenAI-compatible)
- **MiniMax:** International (`api.minimax.io`) vs China regional (`api.minimaxi.com`)
- **Alibaba:** DashScope API endpoint; coding plan has separate base URL (important: `sk-sp-xxxxx` format)

### Authentication Methods

| Method | Providers | Format |
|--------|-----------|--------|
| **Authorization: Bearer** | OpenAI, MiniMax, Alibaba, OpenRouter | `Authorization: Bearer sk-xxx...` |
| **x-api-key Header** | Anthropic | `x-api-key: sk-ant-...` |
| **x-goog-api-key Header** | Google | `x-goog-api-key: AIzaSy...` |
| **OAuth** | Alibaba (free tier: 1,000 req/day) | Qwen OAuth integration |

### Streaming Support

All 6 providers support streaming:
- **Server-Sent Events (SSE):** OpenAI, Anthropic, OpenRouter, MiniMax, Alibaba
- **Method signatures:**
  - OpenAI: `chat.completions.create({ stream: true })`
  - Anthropic: `client.messages.stream()`
  - Google: `client.models.generateContentStream()`
  - MiniMax/Alibaba: Native REST streaming via `stream: true` in request body

### Key Models Available

| Provider | Primary Model | Alternatives | Notes |
|----------|---------------|---------------|-------|
| **OpenAI** | gpt-4o-2024-11-20 | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | Latest O1 models coming |
| **Anthropic** | Claude 3.5 Sonnet | Claude 4.x (preview), Claude 3 Opus | Extended thinking (beta) |
| **Google** | Gemini 2.5 Flash | Gemini 2.0, Gemini 1.5 Pro | Deep research agent available |
| **OpenRouter** | 300+ (proxied) | Models from all partners | Free tier: DeepSeek R1, Llama 3.3 70B, Gemma 3 |
| **MiniMax** | MiniMax-M2.7 | (single model) | Optimized for code understanding & multi-turn dialogue |
| **Alibaba** | Qwen 3.5-plus | Qwen 3-Coder (with reasoning) | Coding plan locks in rates; free tier: 1,000 req/day |

### Pricing Models

| Provider | Model | Cost Transparency | Notes |
|----------|-------|-------------------|-------|
| **OpenAI** | Pay-as-you-go | Per token (input/output) | Org + project billing support |
| **Anthropic** | Pay-as-you-go | Per token (input/output) | Batch API for volume discounts |
| **Google** | Pay-as-you-go | Per token or per minute (Vertex AI) | Free tier: 1,500 RPD |
| **OpenRouter** | Pay-as-you-go (provider rates) | **No markup** — provider pricing shown directly | Free tier available for select models |
| **MiniMax** | Token Plan or PAYG | Depends on subscription type | Flexible billing; coding plan not specific to MiniMax |
| **Alibaba** | Coding Plan or PAYG | Coding Plan: $10–$50/mo (fixed quotas) | Free OAuth tier: 1,000 req/day; PAYG undefined in research |

### OpenAI Compatibility

| Provider | OpenAI SDK Reusable? | Notes |
|----------|----------------------|-------|
| **OpenRouter** | ✅ **Full** | Drop-in replacement: `apiKey: openrouter_key, baseURL: 'https://openrouter.ai/api/v1'` |
| **MiniMax** | ⚠️ **Partial** | Anthropic-compatible endpoint available at `https://api.minimax.io/anthropic` |
| **Alibaba** | ⚠️ **Partial** | Anthropic-compatible endpoint; DashScope endpoint requires native SDK |
| **Anthropic** | ❌ **No** | Different Message/API structure; wrappers exist but not native |
| **Google** | ❌ **No** | Unique generateContent paradigm |

---

## Unresolved Questions / Gaps

1. **MiniMax:** No official npm package found; unclear if community TypeScript wrappers exist or are maintained. MCP protocol preferred over REST client library.
2. **Alibaba Coding Plan pricing:** Documentation unclear on cost structure for coding plan; only confirmed: $10 Lite, $50 Pro per month with fixed quotas. Pay-as-you-go rates not provided in official docs.
3. **OpenRouter beta status:** SDK is currently in beta; breaking changes possible without major version bump. Recommend pinning versions in production.
4. **Google Vertex AI vs. public API:** Research focused on public Gemini API; separate Vertex AI SDK exists but not covered here.

---

## Source References

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference/introduction)
- [OpenAI npm package](https://www.npmjs.com/package/openai)
- [Anthropic SDK TypeScript](https://platform.claude.com/docs/en/api/sdks/typescript)
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [Google GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)
- [OpenRouter Documentation](https://openrouter.ai/docs/)
- [@openrouter/sdk npm](https://www.npmjs.com/package/@openrouter/sdk)
- [MiniMax Coding Guide](https://platform.minimax.io/docs/guides/text-ai-coding-tools)
- [Alibaba Cloud Coding Plan](https://www.alibabacloud.com/help/en/model-studio/coding-plan)
- [Qwen Code npm](https://www.npmjs.com/package/@qwen-code/qwen-code)
- [DashScope SDK npm](https://libraries.io/npm/dashscope-sdk-nodejs)
