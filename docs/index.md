# AgentWiki Documentation Index

Welcome to AgentWiki documentation. All files are organized by topic and cross-referenced for easy navigation.

## Quick Links

### For Everyone
- **[README.md](../README.md)** — Project overview, features, quick start, architecture diagram
- **[Project Roadmap](./project-roadmap.md)** — Current status, milestones, timelines

### For Developers
- **[Code Standards](./code-standards.md)** — TypeScript conventions, code patterns, security checklists
- **[Codebase Summary](./codebase-summary.md)** — Directory structure, database schema, API routes
- **[System Architecture](./system-architecture.md)** — Layered design, data flows, security model

### For DevOps & Operations
- **[Deployment Guide](./deployment-guide.md)** — Setup, deployment, monitoring, troubleshooting
- **[System Architecture](./system-architecture.md)** — Deployment topology, scaling strategies

### For Product & Leadership
- **[Project Overview & PDR](./project-overview-pdr.md)** — Vision, requirements, success metrics
- **[Project Roadmap](./project-roadmap.md)** — Phases, milestones, risk assessment

## Documentation Structure

```
AgentWiki Documentation
├── README.md                     (Root project overview)
├── docs/
│   ├── index.md                 (You are here)
│   ├── project-overview-pdr.md   Product vision & requirements
│   ├── codebase-summary.md       Codebase organization
│   ├── code-standards.md         Development standards
│   ├── system-architecture.md    System design & flows
│   ├── deployment-guide.md       Operations & deployment
│   └── project-roadmap.md        Development timeline
└── plans/
    └── reports/
        └── docs-manager-*.md     Delivery report
```

## Key Documentation Files

### 1. README.md (278 lines)
**Start here for:** Project overview, features, quick start
- Overview and vision
- Key features (dual UI, multi-tenant, hybrid search)
- Tech stack summary
- Monorepo structure
- Quick start instructions
- API endpoints at-a-glance
- CLI usage examples
- Database schema overview

**For:** New developers, stakeholders, team members

### 2. Project Overview & PDR (298 lines)
**Start here for:** Product requirements, success criteria, roadmap
- Vision & target users
- Value propositions
- Feature matrix (MVP vs. future)
- Functional & non-functional requirements
- Technical constraints
- Architectural decisions with rationale
- Success metrics
- Risk assessment

**For:** Product managers, architects, leadership

### 3. Codebase Summary (484 lines)
**Start here for:** Code organization, directory structure, file locations
- Package overview (LOC, file counts)
- Complete directory tree with descriptions
- Database schema (all 13 tables)
- API routes by group
- Key files by size
- Dependency graph
- Technology matrix
- Build & deployment commands

**For:** New developers, code reviewers, architects

### 4. Code Standards (730 lines)
**Start here for:** How to write code, patterns, conventions
- TypeScript configuration & requirements
- File naming conventions (kebab-case patterns)
- Backend patterns (routes, services, middleware)
- Frontend patterns (components, hooks, stores)
- Drizzle ORM usage
- React 19 patterns
- Error handling
- Security guidelines
- Testing strategy
- Code review checklist
- Linting & formatting

**For:** Developers writing code, code reviewers

### 5. System Architecture (640 lines)
**Start here for:** How the system works, data flows, security
- Architecture overview (layered diagram)
- 5-layer architecture explanation
- Data flows (document creation, search, auth)
- Authentication & authorization
- Async processing pipeline
- Security architecture
- Deployment topology
- Scalability strategies
- Monitoring & observability
- Caching & rate limiting

**For:** Architects, senior developers, DevOps engineers

### 6. Deployment Guide (617 lines)
**Start here for:** How to deploy, configure, operate
- Prerequisites & account setup
- Cloudflare service configuration
- OAuth setup (Google, GitHub)
- Local development setup
- Production deployment
- Database management
- Monitoring & troubleshooting
- Performance optimization
- Scaling strategies
- Security hardening
- Maintenance tasks

**For:** DevOps engineers, site reliability engineers, operators

### 7. Project Roadmap (524 lines)
**Start here for:** Development status, future plans, timeline
- Executive summary
- 7 development phases (status ✅ or 🔄)
- Feature completeness matrix
- Future milestones (Q2, Q3, Q4 2026)
- Known issues & technical debt
- Success metrics
- Risk assessment
- Version timeline (0.1.0 → 1.0.0)
- Backlog items

**For:** Project managers, team leads, stakeholders

## Reading Paths

### I want to understand the project
1. README.md → Project Roadmap → Project Overview & PDR

### I want to start coding
1. Code Standards → Codebase Summary → System Architecture

### I want to deploy to production
1. Deployment Guide → System Architecture (topology section)

### I want to understand security
1. Code Standards (security section) → System Architecture (security flows) → Deployment Guide (hardening)

### I want to understand the database
1. Codebase Summary (schema) → System Architecture (data flows) → Code Standards (Drizzle patterns)

### I want to understand the API
1. README.md (API summary) → System Architecture (data flows) → Deployment Guide (troubleshooting)

## Key Concepts

### Multi-Tenancy
- **Where**: Code Standards → "Multi-tenant Architecture"
- **How**: Every table has `tenantId`, enforced at middleware
- **Why**: Enterprise customers need workspace isolation

### Hybrid Search
- **Where**: System Architecture → "Search Pipeline"
- **How**: Keyword (FTS5) + Semantic (Vectorize) combined via RRF
- **Why**: Find by exact match AND by meaning

### Authentication
- **Where**: Code Standards → "Authentication" + System Architecture → "Auth Flows"
- **How**: OAuth 2.0 + JWT + API keys
- **Why**: Support humans (OAuth), agents (API keys), and easy auth refresh

### Deployment
- **Where**: Deployment Guide → "Production Deployment"
- **How**: GitHub Actions → Wrangler → Cloudflare Workers/Pages
- **Why**: Automated, repeatable, zero-downtime updates

## Maintenance

These docs are **living documents**. Update them when:
- Code patterns change
- New features ship
- Schema evolves
- Deployment procedures change
- Roadmap milestones are reached

See Deployment Guide → "Maintenance" for quarterly review tasks.

## Questions & Feedback

- GitHub Issues: [agentwiki/issues](https://github.com/your-org/agentwiki/issues)
- Label issues with `docs` for documentation improvements
- Use `roadmap` label for feature request discussions

## Glossary

**Common Terms Used Throughout Documentation**

- **Tenant**: A customer organization with isolated data
- **Document**: A knowledge item (markdown + BlockNote JSON)
- **Folder**: A container for organizing documents
- **Wikilink**: A [[reference]] to another document
- **Share Link**: Token-based public access to a document
- **API Key**: PBKDF2-hashed credential for CLI/agent access
- **JWT**: JSON Web Token for user authentication (15 min expiry)
- **RRF**: Reciprocal Rank Fusion, algorithm combining search results
- **D1**: Cloudflare SQLite database
- **R2**: Cloudflare object storage (files)
- **KV**: Cloudflare key-value cache
- **Workers**: Cloudflare serverless compute
- **Pages**: Cloudflare static website hosting
- **Vectorize**: Cloudflare vector database
- **Queues**: Cloudflare message queue for async jobs

## Document Versions

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| 0.1.0 | 2026-03-18 | Current | Initial documentation |
| - | - | - | Updates as project evolves |

---

**Last Updated**: 2026-03-18
**Maintainers**: Engineering & Product teams
**Next Review**: 2026-06-18 (quarterly)
