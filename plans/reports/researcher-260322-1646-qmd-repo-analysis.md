# QMD Repository Analysis: Comprehensive Research Report

**Date:** 2026-03-22
**Repository:** https://github.com/tobi/qmd
**Project Version:** 2.0.1 (Latest)
**License:** MIT
**Maturity:** Production-ready (16.5k stars, 989 forks on GitHub)

---

## Executive Summary

QMD (Query Markup Documents) is a sophisticated **local-first hybrid search engine** designed for knowledge management and document retrieval. It combines three complementary search modalities—BM25 full-text indexing, vector semantic search, and LLM-based re-ranking—all operating entirely on-device via node-llama-cpp with GGUF models. The system targets AI agents, knowledge workers, and agentic workflows requiring intelligent document discovery without external API dependencies.

**Key Innovation:** QMD implements a metadata/context system enabling semantic organization that improves retrieval quality for both traditional and LLM-based systems. This context system is explicitly recognized in the codebase as "the key feature of QMD."

---

## 1. What QMD Is and Purpose

### Primary Use Cases
- **Knowledge base search:** Index markdown notes, meeting transcripts, documentation
- **Agentic retrieval:** Provide AI agents with structured, scored document results for decision-making
- **Local-first workflows:** Replace cloud-dependent search with 100% offline operation
- **Obsidian vault integration:** Search local markdown vaults with semantic understanding

### Core Problem Solved
Traditional full-text search (BM25) fails on semantically similar content with different terminology. Vector-only search struggles with exact matches and technical queries. QMD solves this by orchestrating all three approaches simultaneously with intelligent fusion.

### Positioning
- **Not** a general-purpose search engine like Elasticsearch (too heavy, cloud-dependent)
- **Not** a vector-only semantic search (loses precision on exact terms)
- **Not** simple FTS (loses semantic understanding)
- **IS** a hybrid retrieval system optimized for AI-augmented knowledge management

---

## 2. Tech Stack and Architecture

### Core Technologies
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 22+ / Bun 1.0+ | JavaScript execution |
| **Database** | SQLite + FTS5 + sqlite-vec | Indexing & vector storage |
| **LLM Inference** | node-llama-cpp | Local model execution |
| **Models** | GGUF quantized models | ~2GB total (3 models) |
| **CLI Framework** | TypeScript CLI | Command-line interface |
| **Protocol** | MCP (Model Context Protocol) | AI assistant integration |
| **Package Manager** | npm / Bun | Dependency management |

### Language & Type Safety
- **Primary Language:** TypeScript 5.9.3+
- **Module System:** ES modules (modern, tree-shaking friendly)
- **Type Validation:** Zod schema validation for runtime type checking
- **Compilation:** TypeScript → JavaScript with CommonJS + ESM dual export

### Database Schema (SQLite)
```
Core Tables:
├── store_collections        → Collection metadata (path, glob, context)
├── store_documents          → Document mapping (path → content hash)
├── store_embeddings         → Vector embeddings with sequence numbers
├── fts_documents            → FTS5 virtual table (full-text index)
├── qmd_cache_prompts        → LLM response caching
└── sqlite_vec               → Vector database extension
```

### Model Pipeline (3 GGUF Models)
```
1. Embedding Model (300M-500M params)
   └─ Default: EmbeddingGemma or Qwen3-Embedding
   └─ Task: Convert documents/queries → 384-dim vectors

2. Expansion Model (1.7B params)
   └─ Default: qmd-query-expansion-1.7B
   └─ Task: Generate lex/vec/hyde variants from single query
   └─ Fine-tuned on supervised data

3. Reranker Model (600M params)
   └─ Default: Qwen3-Reranker-0.6B
   └─ Task: Score top-30 candidates for relevance
```

---

## 3. Key Features and Design Patterns

### 3.1 Hybrid Search Pipeline

**Stage 1: Query Expansion**
- Original query receives 2× weight boost
- LLM generates alternative query using constrained grammar
- Prevents bottleneck of requiring perfect user phrasing
- Temperature=0.7, repetition penalties applied
- Results filtered to preserve original query terms

**Stage 2: Parallel Retrieval** (Independent execution)
- **BM25 Path:** FTS5 full-text search using custom query parser
  - Supports quoted phrases: `"machine learning"`
  - Prefix matching: `perform` matches `performance`
  - Negation: `-deprecated` excludes terms
  - Normalizes scores 0–1, higher = better

- **Vector Path:** Embedding-based semantic search
  - Cosine similarity against document embeddings
  - Split across separate queries (workaround: sqlite-vec + JOINs hang)
  - Multi-model support with task-specific prompting

**Stage 3: Reciprocal Rank Fusion (RRF)**
- Formula: `RRF(d) = Σ 1/(k + rank)` with k=60
- Original query weighted 2×
- Bonuses for top ranks: +0.05 (#1), +0.02 (#2-3)
- Combines lexical and semantic signals

**Stage 4: LLM Re-ranking**
- Top 30 candidates sent to reranker
- Parallel contexts (up to 8 concurrent) for throughput
- Qwen3 reranker scores 0–1
- Results include reasoning traces via `--explain` flag

**Stage 5: Position-Aware Blending**
- Allocates weights dynamically by rank
- Top 3: 75% RRF / 25% reranker
- Rank 11+: 40% RRF / 60% reranker
- Rationale: Trust reranker more when RRF confidence spreads

### 3.2 Context System (Key Innovation)

**Hierarchical Metadata:**
```yaml
collections:
  - name: engineering_docs
    path: ~/docs/engineering
    context:
      /: "Technical documentation for API reference and system design"
      /internals: "Internal implementation details and architecture"
      /api: "REST API specifications and examples"
```

- **Global Context:** Applied across all collections
- **Collection Context:** Scoped to named collections
- **Path-Prefix Context:** Hierarchical matching (`/api` matches `/api/users`)
- **Returned in Results:** Attached to search results for AI consumption

**Use Case:** When searching "rate limiting," context tells LLM whether it's API design, microservices, or database context—dramatically improves re-ranking and agent decision-making.

### 3.3 Collection Management

**Collection Structure:**
```typescript
interface Collection {
  path: string              // Absolute directory path
  pattern: string           // Glob pattern (e.g., "**/*.md")
  ignore?: string[]         // Exclusion patterns
  context?: ContextMap      // Path prefix → description mappings
  update?: string           // Optional bash command for updates
  includeByDefault?: bool   // Include in queries by default
}
```

**Features:**
- XDG-compliant config storage (`~/.config/qmd/index.yml`)
- Multiple collections in single query
- Per-collection inclusion/exclusion
- Automatic hash-based change detection (avoids re-indexing unchanged content)

### 3.4 Output Formats

**Structured Export Options:**
- **JSON:** Complete results with scores, snippets, metadata
- **CSV:** Tabular format for data analysis
- **Markdown:** Human-readable formatted output
- **XML:** Structured interchange format
- **Files List:** Minimal format (docid, score, path, context)

**Key Options:**
- `--json`: Structured format for agents/scripts
- `--full`: Complete document body instead of snippet
- `--min-score <n>`: Threshold filtering
- `--explain`: Show retrieval traces and scores
- `--files`: Minimal list format

### 3.5 Intent Parameter (Disambiguation)

**Problem:** "Bank" could mean financial institution or data structure
**Solution:** `--intent "data structures"` steers all 5 pipeline stages

**Flow:**
1. Query expansion biased toward intent
2. Chunk selection prefers documents matching intent
3. Re-ranking weights context consistency with intent
4. Snippet extraction contextualizes with intent

---

## 4. Code Organization and Architecture

### Directory Structure
```
qmd/
├── src/
│   ├── cli/
│   │   ├── qmd.ts              # CLI command routing
│   │   └── formatter.ts         # Output format handlers
│   ├── mcp/
│   │   └── server.ts            # MCP protocol server
│   ├── store.ts                 # Main search/indexing API
│   ├── db.ts                    # SQLite abstraction layer
│   ├── collections.ts           # Collection management
│   ├── llm.ts                   # LLM integration pipeline
│   ├── index.ts                 # Public SDK exports
│   ├── maintenance.ts           # DB maintenance utilities
│   ├── embedded-skills.ts       # Base64-encoded skill
│   └── llm.ts                   # LLM orchestration
├── test/
│   ├── store.test.ts            # Core store logic
│   ├── eval.test.ts             # Algorithm evaluation
│   ├── cli.test.ts              # CLI integration
│   ├── mcp.test.ts              # MCP protocol
│   ├── intent.test.ts           # Intent parameter
│   └── [10+ more unit/integration tests]
├── finetune/
│   ├── train.py                 # Model fine-tuning
│   ├── eval.py                  # Evaluation harness
│   ├── data/                    # Training data
│   └── configs/                 # Training configs
├── skills/                      # MCP skill definitions
├── docs/
│   └── SYNTAX.md                # Query language spec
├── assets/
│   └── qmd-architecture.png     # System diagram
├── bin/                         # Executable entry points
├── scripts/                     # Utility scripts
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Test runner config
└── CHANGELOG.md                 # Version history
```

### Core Classes and Interfaces

**QMDStore (Primary API):**
```typescript
interface QMDStore {
  // Search
  search(query: string, options?): Promise<SearchResult[]>
  searchLex(query: string, options?): Promise<SearchResult[]>
  searchVector(query: string, options?): Promise<SearchResult[]>
  expandQuery(query: string): Promise<ExpandedQuery>

  // Collections
  addCollection(name: string, path: string, pattern: string): Promise<void>
  removeCollection(name: string): Promise<void>
  listCollections(): Promise<Collection[]>

  // Context
  addContext(path: string, description: string): Promise<void>
  removeContext(path: string): Promise<void>
  setGlobalContext(description: string): Promise<void>

  // Content
  get(path: string, lines?: [number, number]): Promise<DocumentResult>
  getDocumentBody(path: string): Promise<string>
  multiGet(pattern: string): Promise<DocumentResult[]>

  // Indexing
  update(collections?: string[]): Promise<void>
  embed(force?: boolean): Promise<void>

  // Lifecycle
  close(): Promise<void>
}
```

**LlamaCpp (Lazy Model Manager):**
- Auto-loads/unloads models based on idle timeouts
- Reference counting for concurrent access
- Session-based resource isolation
- Configurable max duration and abort signals

**Maintenance Class:**
- Vacuum/defragment database
- Clear caches
- Reindex collections
- Model cleanup

### Key Patterns Observed

1. **Lazy Initialization:** LLM models load on-demand, unload after 5-min idle
2. **Content Addressing:** Documents stored by SHA256 hash, deduplication automatic
3. **Separation of Concerns:** DB layer abstracted, CLI separate from SDK
4. **Streaming/Progress Callbacks:** Embedding generation provides progress updates
5. **Caching:** LLM responses cached in SQLite to avoid redundant inference
6. **Type Safety:** Zod schemas validate all external inputs

---

## 5. Unique and Innovative Approaches

### 5.1 Query Expansion as First-Class Feature
Instead of requiring users to craft perfect semantic queries, QMD expands a single query into:
- **Lex variants:** Keyword alternatives (entity names, synonyms)
- **Vec variants:** Natural language phrasings
- **HyDE variants:** Hypothetical document snippets (50-100 words)

**Innovation:** Fine-tuned 1.7B model produces consistent, structured output via constrained grammar, avoiding hallucination while providing signal diversity.

### 5.2 Reciprocal Rank Fusion with Position-Aware Weighting
Most systems use fixed weights for lexical vs. semantic signals. QMD dynamically adjusts:
- Top 3 results: Trust lexical (RRF) more (75/25 split)
- Lower ranks: Trust reranker more (40/60 split)

**Rationale:** When RRF consensus is strong, preserve it. When RRF spreads across many candidates, defer to reranker's learned relevance judgment.

### 5.3 Context as Semantic Scaffolding
Unlike traditional systems that treat documents atomically, QMD attaches hierarchical context:
- Improves re-ranking consistency
- Guides query expansion
- Returned alongside results for agent decision-making
- Explicitly identified as "the key feature" for LLM integration

**Impact:** Enables contextual ambiguity resolution that pure BM25 or vector search cannot achieve.

### 5.4 Fine-Tuned Query Expansion Models
Rather than using generic instruction-tuned LLMs, QMD trains domain-specific models:
- **Data:** ~2,290 query expansion examples
- **Approach:** SFT with LoRA adapters (rank 16)
- **Evaluation:** Rule-based reward scoring (92% avg on test set)
- **Format Consistency:** Constrained decoding ensures valid `lex:/vec:/hyde:` output

**Trade-off:** Requires effort to maintain training data but produces superior quality and predictable structure.

### 5.5 Multi-Model Flexibility
Supports pluggable model architectures:
- **Embeddings:** EmbeddingGemma, Qwen3-Embedding (auto-detect task format)
- **Expansion:** Custom qmd-trained models (fine-tuned on retrieval domain)
- **Reranking:** Qwen3-Reranker (optimized for ranking)

Easy to swap models: download new GGUF, update config, re-embed.

### 5.6 Cross-Runtime Compatibility
Abstract SQLite layer works with both:
- **Bun's native SQLite** (zero dependencies, fast)
- **Node.js's better-sqlite3** (wider ecosystem compatibility)

Handles platform quirks (macOS system SQLite missing extension loading capability).

### 5.7 MCP Integration for AI Assistants
Native Model Context Protocol support enables:
- Claude Desktop integration (stdio transport)
- HTTP REST endpoint (shared server mode with model caching)
- Warm model caching across requests
- Structured JSON results for agent consumption
- Dynamic context injection into system prompts

**Not just integration:** Embedded as Claude Code skill with base64-encoded markdown for seamless distribution.

### 5.8 Parallel Re-ranking Contexts
Re-ranker throughput limited by single context window. QMD parallelizes across 1–8 contexts:
- Distributes CPU threads
- Measures VRAM per context
- Avoids context crashes through intelligent batching (~200 token template overhead budgeted)

**Performance:** Up to 2.7× speedup measured in benchmarks (v1.0.0).

### 5.9 Markdown Structure-Aware Chunking
Instead of naive token boundaries, chunking respects markdown:
- Headings as natural break points
- Code blocks preserved intact
- Lists kept together
- ~900 tokens per chunk with 15% overlap for context

**Result:** Semantic chunks that preserve information structure.

---

## 6. Limitations and Areas for Improvement

### 6.1 Model Download Overhead
- **Size:** ~2GB total (3 GGUF models)
- **First Run:** Significant download on first query or embed command
- **No Progress UI:** Users see blank screen during initial model loading
- **Mitigation:** Caching to `~/.cache/qmd/models`, but download still blocks

### 6.2 LLM Quality Dependency
- **Query Expansion:** Relies on fine-tuned 1.7B model; generic LLMs produce poor-quality expansions
- **Re-ranking:** Quality varies with model capability; smaller quantizations may underperform
- **No Fallback:** If expansion fails, query proceeds unmodified (graceful but suboptimal)

### 6.3 Vector Embedding Constraints
- **Latency:** Embedding generation is slow (~5–10 mins for large corpus)
- **VRAM:** Parallel contexts require significant GPU memory (budgets ~1GB per context)
- **CPU-Only Mode:** Possible but dramatically slower
- **Re-embedding Cost:** Modifying documents requires full re-embedding (partial updates not supported)

### 6.4 SQLite Limitations for Scale
- **Concurrency:** Better-sqlite3 uses connection-level locking (single writer)
- **Distribution:** Not suitable for multi-user or distributed scenarios
- **Vector Search:** sqlite-vec has known issues with JOINs (documented in code, workarounds applied)

### 6.5 Collection Scanning Overhead
- **Startup:** Must scan filesystem against glob patterns
- **Large Corpora:** Linear scan on every update; no incremental indexing
- **Network Paths:** Scanning SMB/NFS shares slow and unreliable
- **Gitignore:** No automatic support; must configure ignore patterns manually

### 6.6 Limited Query Expressiveness
- **Boolean Operators:** AND/OR not directly supported (must use lex/vec structure)
- **Field Search:** No field-specific queries (e.g., title:auth, author:bob)
- **Date Ranges:** No temporal filtering
- **Faceted Search:** No aggregation/faceting for drill-down navigation

### 6.7 Configuration Management Friction
- **YAML Sync:** Manually written YAML must be synced to database
- **Context Hierarchy:** Requires understanding prefix-matching semantics
- **No UI:** CLI-only; no graphical collection/context editor
- **Version Conflicts:** No merge strategy if config modified externally while qmd runs

### 6.8 Search Quality Gaps
- **Specialized Domains:** Fine-tuning assumes general knowledge base; specialized vocabularies (legal, medical) may need custom models
- **Typo Tolerance:** No fuzzy matching or spell correction
- **Negation:** BM25 negation doesn't work well with semantic search (rank fusion doesn't handle it elegantly)
- **Near Duplicates:** No deduplication of similar documents (would need additional model)

### 6.9 Instrumentation and Observability
- **Logging:** No structured logging (makes debugging difficult in production)
- **Metrics:** No built-in metrics (can't easily observe reranker latency, embedding cache hit rates)
- **Tracing:** `--explain` provides some insight but not comprehensive

### 6.10 Windows Support Gaps
- **Path Handling:** Assumes Unix-style paths; Windows path handling tested but less common
- **Homebrew SQLite:** macOS workaround; Windows users must use system SQLite
- **Shell Integration:** Many examples use Bash; PowerShell integration minimal

---

## 7. Technology Trends and Strategic Decisions

### Why This Approach Works

**1. Timing:**
- LLM inference on consumer hardware became viable (~2023)
- Vector databases maturing but overkill for local use
- Hybrid search emerging as best practice for quality

**2. Market Gap:**
- Obsidian users want better search without cloud lock-in
- Agents need structured document feeds, not just snippets
- Privacy-conscious organizations need on-device solutions

**3. Technical Trade-offs Favoring This Design:**
- BM25 proven, fast, handles exact matches well
- Vector search handles semantic similarity and paraphrasing
- Reranking bridges the quality gap without complex fusion logic
- GGUF models enable reproducibility and offline operation

### Design Philosophy
- **Local-first:** No external APIs, no telemetry
- **Simple:** Single-machine SQLite, not distributed systems
- **Measurable:** Fine-tuned models with quantified eval metrics
- **Transparent:** Source available, reproducible training

---

## 8. File and Code Organization Quality

### Strengths
- **Clear Layering:** CLI/SDK/MCP properly separated
- **Type Safety:** Comprehensive Zod validation
- **Test Coverage:** 15+ test files covering unit/integration/evaluation scenarios
- **Documentation:** SYNTAX.md provides query language spec; CLAUDE.md integrations notes
- **Modularity:** Each file ~100–300 lines (manageable size)

### Areas for Growth
- **File Naming:** Some files could be more specific (llm.ts is broad for embedding+expansion+reranking)
- **Comments:** Complex algorithms (RRF, position-aware blending) could benefit from more inline docs
- **Error Handling:** Some promise chains could add better error context
- **Logging:** No structured logging framework; console.log only

---

## 9. Maturity Assessment

**Production Readiness: ✓ Yes**
- 2.0.0 released with "stable library API"
- Active maintenance and bug fixes
- 16.5k GitHub stars indicates community adoption
- Used in production by Obsidian users, Claude Code, OpenClaw platforms

**Quality Indicators:**
- Comprehensive test suite (15+ test files)
- Type-safe codebase (TypeScript with Zod)
- Documented CHANGELOG tracking evolution
- Clear architecture and separation of concerns

**Adoption Evidence:**
- Raycast Store integration
- OpenClaw skill integration
- Claude Code integration
- Multiple third-party wrappers (moltbot skills, etc.)

---

## 10. Unresolved Questions and Open Investigations

1. **Distributed Search:** Is there interest in multi-node indexing? Current design assumes single-machine.
2. **Incremental Embedding:** Can re-embedding be optimized to only process new/modified documents?
3. **Cross-Collection Weighting:** How should results be ranked when mixing multiple collections with different relevance characteristics?
4. **Model Quantization Trade-offs:** Detailed benchmarking of Q4 vs Q8 quantizations for each model tier?
5. **Windows Path Handling:** How thoroughly tested is Windows UNC paths, case sensitivity edge cases?
6. **Query Syntax Extensibility:** Could users define custom query types (e.g., `code:` prefix for code-specific search)?
7. **Streaming Results:** Can result streaming be implemented to show early results while reranking completes?
8. **Evaluation Metrics:** What precision@K and recall metrics does qmd achieve on standard benchmarks (MS MARCO, etc.)?
9. **Fine-tuning Customization:** What's the effort to fine-tune expansion models on domain-specific data?
10. **Cost Analysis:** Detailed breakdown of latency (expansion vs. BM25 vs. vector vs. reranking) for typical queries?

---

## Summary

QMD is a **sophisticated, production-ready hybrid search engine** optimized for knowledge management and agentic workflows. Its key strengths are:

- **Intelligent orchestration** of three complementary search modalities
- **Context system** enabling semantic scaffolding for AI integration
- **Fine-tuned models** ensuring consistent, high-quality query expansion
- **Local-first design** eliminating cloud dependencies and privacy concerns
- **Clean architecture** with proper separation of CLI/SDK/MCP concerns

The primary limitations are around **scale** (single-machine SQLite), **customization** (requires domain-specific model fine-tuning), and **observability** (minimal logging/metrics). These are acceptable trade-offs for the target use case of local knowledge base search for individuals and small teams.

The project demonstrates strong **software engineering discipline** with comprehensive testing, type safety, and thoughtful design patterns. The codebase is accessible to contributors while maintaining high quality standards.

