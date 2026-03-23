# MCP SDK & Cloudflare Workers Integration Research Report

**Date:** 2026-03-19
**Status:** Complete
**Scope:** MCP TypeScript SDK, Cloudflare Workers deployment, transports, authentication, best practices

---

## Executive Summary

Model Context Protocol (MCP) is production-ready for deployment on Cloudflare Workers. The ecosystem is mature with three viable deployment patterns: stateless HTTP handlers, stateful agents via Durable Objects, and the simplified `workers-mcp` CLI tool. Authentication is flexible (OAuth, API keys, Cloudflare Access) and transport uses the new Streamable HTTP standard (March 2025). Token cost: **low** due to Workers' isolation model and startup time.

---

## 1. MCP TypeScript SDK: Latest Version & API Surface

### Package & Versioning

**Latest Stable:** `@modelcontextprotocol/sdk` v1.27.1 (published 23 days before 2026-03-19, so ~2026-02-24)

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod
```

**Peer Dependency:** Zod v3 or v4 required for schema validation.

**Roadmap:** v2 (pre-alpha on main branch) anticipated Q1 2026. v1.x will receive bug fixes + security updates for ≥6 months after v2 ships. Recommend v1.x for production until v2 stabilizes.

**Adoption:** 34,702 projects on npm depend on this package (healthy ecosystem signal).

### Core Server API

#### 1.1 Server Initialization

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";

const server = new McpServer({
  name: "example-server",
  version: "1.0.0",
  capabilities: {
    tools: {}, // Declare tool support
    resources: {}, // Declare resource support
    prompts: {}, // Declare prompt support
    logging: {}, // Enable logging capability
  },
});
```

#### 1.2 Tools (LLM-Callable Functions)

**Define with `registerTool()`:**

```typescript
import { z } from "zod";

server.registerTool({
  name: "search_documents",
  description: "Search documents by keyword",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().int().min(1).max(100).describe("Max results"),
  }),
  handler: async (input) => {
    // input is type-safe: { query: string; limit: number }
    const results = await searchDb(input.query, input.limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results),
        },
      ],
    };
  },
});
```

**Tool Return Types:**
- `TextContent` — plain text or formatted markdown
- `ImageContent` — base64 image data with MIME type
- `ResourceLink` — URI reference to large data (avoids embedding)

**Tool Annotations (hints for LLM behavior):**
```typescript
{
  name: "delete_user",
  annotations: {
    destructive: true, // LLM knows this modifies state
    readOnly: false,
    idempotent: false,
  },
  // ...
}
```

#### 1.3 Resources (Read-Only Data)

**Static URI:**
```typescript
server.registerResource({
  uri: "file:///epic/config.json",
  name: "System Configuration",
  description: "Current system config",
  mimeType: "application/json",
  handler: async () => ({
    text: JSON.stringify(await loadConfig()),
  }),
});
```

**Dynamic URI Templates (with parameter completion):**
```typescript
import { completable } from "@modelcontextprotocol/sdk/server/index.js";

server.registerResource({
  uriTemplate: "note://{notebook_id}/{note_id}",
  name: "User Notes",
  description: "Access stored notes",
  mimeType: "text/markdown",
  listHandler: async () => [
    { uri: "note://inbox/task-1", name: "Task 1" },
    { uri: "note://inbox/task-2", name: "Task 2" },
  ],
  handler: async (uri) => {
    const { notebook_id, note_id } = parseUri(uri);
    return { text: await fetchNote(notebook_id, note_id) };
  },
});

// Add parameter completions
server.registerResourceCompletable({
  uri: "note://{notebook_id}/{note_id}",
  handler: async (partial) => {
    // Provide suggestions as user types
    return suggestNoteParameters(partial);
  },
});
```

#### 1.4 Prompts (Reusable Message Templates)

```typescript
server.registerPrompt({
  name: "code_review",
  description: "Template for code review feedback",
  arguments: [
    {
      name: "language",
      description: "Programming language",
    },
    {
      name: "tone",
      description: "Review tone (constructive|strict|mentoring)",
    },
  ],
  handler: async (args) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Review this ${args.language} code with ${args.tone} tone...`,
        },
      },
    ],
  }),
});
```

#### 1.5 Logging Capability

If server declares `logging: {}` capability:
```typescript
handler: async (input, ctx) => {
  ctx.mcpReq.log("debug", "Processing request", { input });
  await processData(input);
  ctx.mcpReq.log("info", "Completed", { status: "success" });
  // ...
}
```

### Transport Support

Three primary transports in the SDK:

| Transport | Use Case | Client Type | Notes |
|-----------|----------|------------|-------|
| **Streamable HTTP** | Remote servers (Cloudflare, cloud hosts) | Web/Cloud | POST/GET/DELETE, session-aware, new standard (2025-03-26) |
| **stdio** | Local CLIs, Claude Desktop, VSCode | Local process | Subprocess stdin/stdout, zero network overhead |
| **SSE** | Legacy HTTP+SSE (deprecated) | Web clients | Replaced by Streamable HTTP; maintain for backward compat |

---

## 2. Streamable HTTP Transport (Latest Standard)

### Protocol Overview

**Introduced:** March 26, 2025 (replaced deprecated HTTP+SSE transport).

**Endpoint:** Single HTTP path supporting POST, GET, DELETE (e.g., `https://example.com/mcp`).

**Architecture:** True bidirectional via POST (client→server) + GET SSE stream (server→client).

### Endpoint Behaviors

#### POST Request (Client sends message)

**Client sends:**
```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
Mcp-Session-Id: [session-id-if-provided]

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { ... }
}
```

**Server responds with one of:**
1. **`200 OK` + `Content-Type: application/json`** — Single JSON-RPC response
   ```json
   { "jsonrpc": "2.0", "id": 1, "result": {...} }
   ```

2. **`200 OK` + `Content-Type: text/event-stream`** — SSE stream with multiple messages
   ```
   data: {"jsonrpc":"2.0","id":1,"result":{...}}

   data: {"jsonrpc":"2.0","method":"logs/message","params":{...}}
   ```

3. **`202 Accepted`** — For notifications/responses only (no response body)

#### GET Request (Client listens for server-initiated messages)

```http
GET /mcp HTTP/1.1
Accept: text/event-stream
Mcp-Session-Id: [session-id]
```

**Server responds:**
```
Content-Type: text/event-stream

data: {"jsonrpc":"2.0","method":"notifications/initialized"}
```

#### DELETE Request (Client terminates session)

```http
DELETE /mcp HTTP/1.1
Mcp-Session-Id: [session-id]
```

**Server responds:** `200 OK` or `405 Method Not Allowed` if termination not supported.

### Session Management

**Stateless (no sessions):**
- Client makes independent requests
- No session ID header required
- Simplest for read-only servers

**Stateful (with sessions):**
- Server sends `Mcp-Session-Id` header on `InitializeResponse`
- Client must include `Mcp-Session-Id` on all subsequent requests
- Server can expire sessions (respond with `404 Not Found`)
- Client can explicitly terminate via DELETE request

### Implementation Example

```typescript
import { createMcpHandler } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamable-http.js";

const handler = createMcpHandler(server);

// Express example
app.post("/mcp", handler);
app.get("/mcp", handler);
app.delete("/mcp", handler);

// Or raw HTTP
const transport = new WebStandardStreamableHTTPServerTransport({
  handler,
  sessionIdGenerator: () => crypto.randomUUID(), // or undefined for stateless
});
```

### DNS Rebinding Protection

**Critical Security Issue:**

```typescript
// MUST validate Origin header on all requests
const validateOrigin = (req) => {
  const origin = req.headers.origin;
  const allowedHosts = ["example.com"];
  if (!allowedHosts.includes(new URL(origin).hostname)) {
    throw new Error("Origin mismatch");
  }
};

// Local servers MUST bind only to 127.0.0.1, not 0.0.0.0
app.listen(3000, "127.0.0.1"); // Good
// app.listen(3000, "0.0.0.0"); // BAD — opens to DNS rebinding attacks
```

---

## 3. Cloudflare Workers Deployment

### Option 1: Stateless with `createMcpHandler()` (Simplest)

**Use Case:** Read-only tools, no session state, <15 lines of code.

```typescript
// wrangler.toml
name = "my-mcp-server"

[env.production]
routes = [{ pattern = "example.com/mcp", zone_name = "example.com" }]

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpHandler } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
  capabilities: { tools: {} },
});

server.registerTool({
  name: "get_weather",
  description: "Fetch weather data",
  inputSchema: z.object({ city: z.string() }),
  handler: async (input) => ({
    content: [{ type: "text", text: `Weather for ${input.city}...` }],
  }),
});

const handler = createMcpHandler(server);

export default {
  fetch: handler,
};
```

**Deploy:**
```bash
wrangler deploy --env production
```

### Option 2: Stateful with Durable Objects

**Use Case:** Per-session state, user authentication, multi-step workflows.

```typescript
// src/mcp-agent.ts
import { McpAgent } from "@cloudflare/agents";

export class MyMcpAgent extends McpAgent {
  async onInitialize() {
    // Called once per session
    this.registerTool({
      name: "save_preference",
      handler: async (input) => {
        // State persists across calls in this session
        this.state.set("preference", input.value);
        return { content: [{ type: "text", text: "Saved" }] };
      },
    });
  }
}

// src/index.ts
export default {
  fetch: (req, env) => MyMcpAgent.serve(req, env),
};
```

**wrangler.toml:**
```toml
[[durable_objects.bindings]]
name = "MY_MCP_AGENT"
class_name = "MyMcpAgent"

[[migrations]]
tag = "v1"
new_classes = ["MyMcpAgent"]
```

### Option 3: `workers-mcp` CLI Tool (Fastest)

**The most developer-friendly option** — abstracts away transport handling.

```bash
npm install workers-mcp
npm run deploy
```

**setup (auto-generated):**
```typescript
// wrangler.toml
type = "javascript"

[env.development]
name = "my-mcp-dev"

[env.production]
name = "my-mcp-prod"
vars = { ENVIRONMENT = "production" }
```

**Define tools in src/index.ts:**
```typescript
export async function example_tool(input: { name: string }) {
  return `Hello, ${input.name}!`;
}

export async function database_query(input: { sql: string }) {
  return await myDb.query(input.sql);
}
```

The CLI auto-converts these to MCP tools and deploys both the Worker and local stdio proxy.

---

## 4. Authentication in MCP Servers

### Four Primary Strategies

#### 4.1 Cloudflare Access (Built-in)

Integrates Cloudflare Zero Trust + SSO (GitHub, Google, OIDC).

```typescript
// No code needed — configured in Cloudflare dashboard
// Workers automatically validates CF-Authorization header
// Access context available via req.cf
```

#### 4.2 Third-Party OAuth (GitHub, Google, Auth0, Stytch, WorkOS)

```typescript
import { Client as CloudflareClient } from "@cloudflare/workers-sdk";

export async function authMiddleware(req, env) {
  const code = new URL(req.url).searchParams.get("code");
  const token = await exchangeOAuthCode(code, env.GITHUB_SECRET);

  // Store token in KV for session
  const sessionId = crypto.randomUUID();
  await env.SESSION_KV.put(
    `session:${sessionId}`,
    JSON.stringify({ token, user: await fetchUser(token) }),
    { expirationTtl: 3600 }
  );

  return new Response(
    JSON.stringify({ sessionId }),
    { headers: { "Mcp-Session-Id": sessionId } }
  );
}
```

#### 4.3 Custom OAuth Provider (Cloudflare Workers OAuth Library)

```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

const oauth = new OAuthProvider({
  clientId: env.OAUTH_CLIENT_ID,
  clientSecret: env.OAUTH_CLIENT_SECRET,
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
});

// Automatic token validation & refresh
const handler = oauth.wrap(mcpHandler);
```

#### 4.4 Self-Handled Authorization (API Keys, Bearer Tokens)

**API Key via Header:**
```typescript
export async function validateAuth(req) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !isValidKey(apiKey)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return { user: lookupKeyOwner(apiKey) };
}

server.registerTool({
  name: "protected_tool",
  handler: async (input, ctx) => {
    const user = ctx.auth.user; // From validateAuth
    if (!user.canCallTool("protected_tool")) {
      throw new Error("Permission denied");
    }
    // ...
  },
});
```

**API Key via Query Param (less secure, but compatible with some clients):**
```typescript
const sessionId = new URL(req.url).searchParams.get("session");
const apiKey = new URL(req.url).searchParams.get("key");
// Validate apiKey...
```

### Accessing Auth Context

In `createMcpHandler()`:
```typescript
import { getMcpAuthContext } from "@cloudflare/agents";

const handler = createMcpHandler(server);

export default {
  fetch: async (req, env) => {
    const auth = getMcpAuthContext(req);
    if (!auth.authenticated) return new Response("Unauthorized", { status: 401 });
    return handler(req);
  },
};
```

In `McpAgent` class:
```typescript
export class MyAgent extends McpAgent {
  async onInitialize() {
    const user = this.props.auth.user;
    console.log(`Session for ${user.email}`);
  }
}
```

---

## 5. Tool & Resource Design Best Practices

### Tool Naming Convention: domain-noun-verb

**Pattern:** `{domain}_{noun}_{verb}`

**Examples:**
```
github_issue_create
github_issue_list
github_issue_update
github_pullrequest_merge
slack_message_send
slack_channel_list
database_record_insert
database_record_delete
```

**Benefits:**
- Alphabetical grouping clusters related tools
- Clear semantic intent (domain, resource type, action)
- Consistent signal of quality to LLMs
- Prevents naming collisions across integrations

### Resource URI Schemes

**Custom Schemes (recommended for clarity):**

```typescript
// Use domain-specific schemes
note://          // Notes app
stock://         // Market data
config://        // Configuration
docs://          // Documentation
db://            // Database records
crm://           // CRM entities
```

**Examples:**
```
note://user-123/draft-2025
stock://AAPL/current
config://app/settings
db://users/user-456
```

**Default Fallback (generic):**
```
mcp://resources/{name}
```

**URI Consistency Rules:**
- Keep URIs predictable and hierarchical
- Support templates: `note://{notebook_id}/{note_id}`
- Validate inputs to prevent injection attacks
- Set correct MIME types (`application/json`, `text/markdown`, etc.)
- Keep resource data read-only when possible

### Input Validation with Zod

```typescript
import { z } from "zod";

const SearchInput = z.object({
  query: z
    .string()
    .describe("Search query string")
    .min(1)
    .max(500),
  limit: z
    .number()
    .describe("Maximum results (1-100)")
    .int()
    .min(1)
    .max(100)
    .default(10),
  filters: z
    .object({
      category: z.enum(["docs", "code", "issues"]),
      dateRange: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

server.registerTool({
  name: "search",
  inputSchema: SearchInput,
  handler: async (input) => {
    // input is fully type-safe and validated
    // Zod will reject invalid data before reaching handler
    // ...
  },
});
```

---

## 6. MCP Package Ecosystem

### Core Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | 1.27.1 | Full MCP server + client SDK |
| `zod` | v3 or v4 | Schema validation (peer dependency) |
| `@cloudflare/agents` | Latest | Cloudflare-specific MCP helpers (McpAgent, getMcpAuthContext) |
| `workers-mcp` | 0.0.13 | CLI tool for Workers + local stdio proxy |

### Optional Middleware

These provide thin adapters for specific frameworks (intentionally avoiding duplicate MCP logic):

- `@modelcontextprotocol/server/express` — Express.js integration
- `@modelcontextprotocol/server/hono` — Hono framework integration
- `@modelcontextprotocol/server/node-http` — Node.js native HTTP

**Installation (express example):**
```bash
npm install @modelcontextprotocol/sdk/server/express
```

```typescript
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

const app = createMcpExpressApp(server); // Includes DNS rebinding protection + CORS
app.listen(3000, "127.0.0.1");
```

---

## 7. Transport Comparison for Cloudflare

| Transport | Local/Remote | Latency | Session State | Auth Support | Use Case |
|-----------|--------------|---------|---------------|--------------|----------|
| **Streamable HTTP** | Remote | ~100-200ms | Yes (optional) | Full (OAuth, API key) | Cloud deployment (Cloudflare Workers) |
| **RPC (Durable Objects)** | Internal only | ~1-5ms | Yes | No | Stateful multi-worker apps within CF |
| **stdio** | Local | ~5-10ms | No | Via wrapper | Claude Desktop, local tooling |

**For Cloudflare Workers:**
- **Stateless public API:** Use `createMcpHandler()` + Streamable HTTP
- **Stateful user sessions:** Use `McpAgent` + Durable Objects + Streamable HTTP
- **Fast internal tools:** Use RPC transport (no public endpoint)

---

## 8. Key Implementation Patterns

### Pattern 1: Stateless Read-Only Server (Fastest)

```typescript
// Zero session overhead, perfect for documentation/reference tools

import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpHandler } from "@modelcontextprotocol/sdk/server/index.js";

const server = new McpServer({
  name: "docs-server",
  version: "1.0.0",
  capabilities: { resources: {} },
});

server.registerResource({
  uri: "docs://api/reference",
  name: "API Documentation",
  mimeType: "text/markdown",
  handler: async () => ({
    text: await readDocs("api-reference.md"),
  }),
});

export default { fetch: createMcpHandler(server) };
```

### Pattern 2: Streaming Responses (Large Data)

```typescript
server.registerTool({
  name: "stream_logs",
  handler: async (input) => {
    // Return ResourceLink instead of embedding 100MB of logs
    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: "logs://2026-03-19/full",
            mimeType: "text/plain",
          },
        },
      ],
    };
  },
});
```

### Pattern 3: Server-Initiated Notifications (Webhooks)

```typescript
// GET stream stays open — server can push updates without client polling

export class WebhookAgent extends McpAgent {
  async onInitialize() {
    const client = this.getStreamableHttpClient();

    // When external event occurs
    externalEventBus.on("alert", (alert) => {
      client.notification({
        method: "notifications/alert",
        params: { level: alert.severity, message: alert.text },
      });
    });
  }
}
```

---

## 9. Deployment Walkthrough (Minimal Example)

### Step 1: Initialize Project

```bash
npm init -y
npm install @modelcontextprotocol/sdk zod wrangler --save-dev
npx wrangler init
```

### Step 2: Define Server

**src/index.ts:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpHandler } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

const server = new McpServer({
  name: "sample-server",
  version: "1.0.0",
  capabilities: { tools: {} },
});

server.registerTool({
  name: "multiply",
  description: "Multiply two numbers",
  inputSchema: z.object({
    a: z.number(),
    b: z.number(),
  }),
  handler: async (input) => ({
    content: [
      {
        type: "text",
        text: `${input.a} × ${input.b} = ${input.a * input.b}`,
      },
    ],
  }),
});

export default {
  fetch: createMcpHandler(server),
};
```

### Step 3: Test Locally

```bash
npm run wrangler dev
# Server runs on http://localhost:8787/mcp
```

Test with curl:
```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "multiply",
      "arguments": { "a": 5, "b": 3 }
    }
  }'
```

### Step 4: Deploy to Cloudflare

```bash
npm run wrangler deploy
# https://{worker-name}.{subdomain}.workers.dev/mcp
```

### Step 5: Connect to Claude Desktop

Create `~/.claude/claude-manifest.json` (or add to existing config):
```json
{
  "mcpServers": {
    "sample-server": {
      "url": "https://{worker-name}.{subdomain}.workers.dev/mcp"
    }
  }
}
```

Restart Claude Desktop. Server is now available to Claude.

---

## 10. Common Gotchas & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **CORS errors on browser client** | Browser can't POST to cross-origin MCP endpoint | Use `createMcpExpressApp()` which auto-adds CORS headers; or add CORS middleware |
| **DNS rebinding attack vulnerability** | Server binds to 0.0.0.0, accepts any Origin | Bind to 127.0.0.1 for local servers; validate Origin header for remote |
| **Session expires unexpectedly** | Server killed session due to timeout or crash | Implement resumable SSE streams with event IDs; clients retry with Last-Event-ID |
| **Large tool output hangs client** | Embedding megabytes in JSON-RPC response | Return ResourceLink instead; client fetches resource separately |
| **Tool not appearing in Claude** | Zod schema invalid or missing `describe()` | Verify schema with `schema.parse()` test; add descriptions to all inputs |
| **Stateless mode loses user context** | No session ID, each request is independent | Switch to stateful mode with McpAgent + Durable Objects if state needed |

---

## 11. TypeScript SDK Compatibility Matrix

| SDK Version | Protocol Version | Node Version | Zod Required | Status |
|-------------|------------------|--------------|--------------|--------|
| 1.27.1 | 2025-03-26 | 18+ | v3 or v4 | **Current (stable)** |
| 1.x (latest) | 2025-03-26 | 18+ | v3 or v4 | LTS (≥6mo after v2 release) |
| 2.0-alpha | 2025-03-26 | 18+ | v4 | Pre-release (Q1 2026) |

---

## 12. Cloudflare-Specific Packages

### @cloudflare/agents

**Purpose:** MCP helpers for Workers ecosystem.

**Key Exports:**
```typescript
// Stateful server class
export class McpAgent extends DurableObject { }

// Get auth context in createMcpHandler mode
export function getMcpAuthContext(req): { authenticated, user, ... }

// New v0.2.1+ features:
// - MCP barrel export: @cloudflare/agents/mcp
// - Code Mode integration: wrap MCP servers for automatic code generation
// - Task Queues integration
// - Email integration
```

### workers-mcp

**Purpose:** CLI abstraction for rapid Workers MCP development.

**Features:**
```bash
npm install workers-mcp

# Auto-generates wrangler config
npm run dev     # Local dev + Claude Desktop proxy
npm run deploy  # Deploy Worker + update Claude metadata

# Features:
# - Converts exported functions to MCP tools
# - Handles stdio proxy locally (zero config for Claude Desktop)
# - Type-safe function→tool conversion
# - Automatic session management
```

---

## 13. Remote MCP Server (New March 2025)

Cloudflare added remote MCP support alongside local:

**Components:**
- `workers-mcp` — Deploy server to Workers
- `mcp-remote` — Local proxy for Claude Desktop (stdio↔HTTP translation)
- `McpAgent` — Class for stateful servers
- `createMcpHandler()` — Function for stateless servers
- **AI Playground** — Web UI for testing MCP servers

**Connection Flow:**
```
Claude Desktop (stdio)
    ↓
mcp-remote proxy (stdio→HTTP)
    ↓
https://your-worker.workers.dev/mcp (Streamable HTTP)
    ↓
Cloudflare Worker (compute)
    ↓
Your tools/resources
```

---

## Unresolved Questions

1. **Code Mode interaction:** How does Cloudflare's Code Mode wrapper (`@cloudflare/agents/mcp`) interact with custom Zod schemas? Does it auto-convert schemas to TypeScript types for generated code?

2. **RPC transport auth:** Documentation says "RPC transport does not support authentication." Is there a planned workaround for internal stateful tools requiring auth?

3. **Session resumption:** Streamable HTTP spec mentions resumable SSE with event IDs. What is the recommended session storage strategy (KV? Durable Objects?)? Example code not found in main SDK docs.

4. **v2 breaking changes:** What's the scope of v1→v2 migration? Will it affect server registration APIs or primarily internal transports?

5. **Pricing at scale:** What's the cost profile for a heavily-used MCP server on Workers? (request count? compute time? storage for stateful sessions?)

---

## Sources

- [Model Context Protocol Official Docs](https://modelcontextprotocol.io/docs)
- [MCP TypeScript SDK - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP TypeScript SDK - GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification 2025-03-26 - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Cloudflare Agents - Model Context Protocol Docs](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Cloudflare - Build Remote MCP Server Guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [Cloudflare - Authorization in MCP](https://developers.cloudflare.com/agents/model-context-protocol/authorization/)
- [Cloudflare - Transport Reference](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [workers-mcp - GitHub](https://github.com/cloudflare/workers-mcp)
- [workers-mcp - npm](https://www.npmjs.com/package/workers-mcp)
- [Cloudflare Blog - Remote MCP Servers](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/)
- [MCP Tool Naming Conventions](https://zazencodes.com/blog/mcp-server-naming-conventions)
- [MCP Resources Best Practices](https://zuplo.com/blog/mcp-resources)
- [Streamable HTTP Deep Dive](https://thenewstack.io/how-mcp-uses-streamable-http-for-real-time-ai-tool-interaction/)
