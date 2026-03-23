#!/usr/bin/env node
import { Command } from 'commander'
import { apiFetch, saveCredentials, getCredentials } from './api-client.js'

const program = new Command()

program
  .name('agentwiki')
  .description('AgentWiki CLI — Knowledge management for humans & AI agents')
  .version('0.1.0')

// --- Auth ---

program
  .command('login')
  .description('Configure API key for authentication')
  .option('--api-key <key>', 'API key (starts with aw_)')
  .option('--url <url>', 'API base URL', 'https://app.agentwiki.cc')
  .action(async (opts) => {
    if (opts.apiKey) {
      saveCredentials({ apiKey: opts.apiKey, apiUrl: opts.url })
      console.log('✓ API key saved')

      // Verify key works
      try {
        const me = await apiFetch('/auth/me')
        console.log('✓ Authenticated as:', JSON.stringify(me, null, 2))
      } catch (err) {
        console.error('✗ API key validation failed:', (err as Error).message)
      }
    } else {
      console.log('Usage: agentwiki login --api-key aw_xxxxx')
      console.log('Get your API key at https://agentwiki.cc/settings/api-keys')
    }
  })

program
  .command('whoami')
  .description('Show current user info')
  .action(async () => {
    try {
      const me = await apiFetch('/auth/me')
      console.log(JSON.stringify(me, null, 2))
    } catch (err) {
      console.error('Not authenticated. Run: agentwiki login --api-key <key>')
    }
  })

// --- Documents ---

const doc = program.command('doc').description('Manage documents')

doc
  .command('list')
  .description('List documents')
  .option('--limit <n>', 'Max results', '20')
  .option('--offset <n>', 'Offset', '0')
  .option('--category <cat>', 'Filter by category')
  .option('--tag <tag>', 'Filter by tag')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const params = new URLSearchParams({
      limit: opts.limit,
      offset: opts.offset,
    })
    if (opts.category) params.set('category', opts.category)
    if (opts.tag) params.set('tag', opts.tag)

    const result = await apiFetch<{ data: Array<{ id: string; title: string; slug: string; updatedAt: string }> }>(
      `/documents?${params}`,
    )

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      for (const d of result.data) {
        console.log(`${d.id}  ${d.title}  (${d.slug})`)
      }
      console.log(`\n${result.data.length} documents`)
    }
  })

doc
  .command('get <id>')
  .description('Get a document by ID')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output markdown content only')
  .action(async (id, opts) => {
    const result = await apiFetch<{ id: string; title: string; content: string; tags: string[] }>(`/documents/${id}`)

    if (opts.markdown) {
      console.log(result.content)
    } else if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`# ${result.title}\n`)
      console.log(result.content)
      if (result.tags?.length) console.log(`\nTags: ${result.tags.join(', ')}`)
    }
  })

doc
  .command('create')
  .description('Create a new document')
  .requiredOption('--title <title>', 'Document title')
  .option('--content <content>', 'Markdown content')
  .option('--file <path>', 'Read content from file')
  .option('--category <cat>', 'Category')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--folder <id>', 'Folder ID')
  .action(async (opts) => {
    let content = opts.content ?? ''
    if (opts.file) {
      const { readFileSync } = await import('node:fs')
      content = readFileSync(opts.file, 'utf-8')
    }

    const body: Record<string, unknown> = { title: opts.title, content }
    if (opts.category) body.category = opts.category
    if (opts.tags) body.tags = opts.tags.split(',').map((t: string) => t.trim())
    if (opts.folder) body.folderId = opts.folder

    const result = await apiFetch('/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    console.log('✓ Document created:', JSON.stringify(result, null, 2))
  })

doc
  .command('update <id>')
  .description('Update a document')
  .option('--title <title>', 'New title')
  .option('--content <content>', 'New content')
  .option('--file <path>', 'Read content from file')
  .option('--category <cat>', 'New category')
  .option('--tags <tags>', 'New tags (comma-separated)')
  .action(async (id, opts) => {
    const body: Record<string, unknown> = {}
    if (opts.title) body.title = opts.title
    if (opts.content) body.content = opts.content
    if (opts.file) {
      const { readFileSync } = await import('node:fs')
      body.content = readFileSync(opts.file, 'utf-8')
    }
    if (opts.category) body.category = opts.category
    if (opts.tags) body.tags = opts.tags.split(',').map((t: string) => t.trim())

    const result = await apiFetch(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    console.log('✓ Document updated:', JSON.stringify(result, null, 2))
  })

doc
  .command('delete <id>')
  .description('Delete a document')
  .action(async (id) => {
    await apiFetch(`/documents/${id}`, { method: 'DELETE' })
    console.log('✓ Document deleted')
  })

doc
  .command('search <query>')
  .description('Search documents and/or uploaded files')
  .option('--type <type>', 'Search type: hybrid|keyword|semantic', 'hybrid')
  .option('--source <source>', 'Search source: docs|storage|all', 'docs')
  .option('--limit <n>', 'Max results', '10')
  .option('--json', 'Output as JSON')
  .action(async (query, opts) => {
    const params = new URLSearchParams({ q: query, type: opts.type, limit: opts.limit, source: opts.source })
    const result = await apiFetch<{ results: Array<{ id: string; title: string; snippet: string; score?: number }> }>(
      `/search?${params}`,
    )

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      for (const r of result.results) {
        console.log(`${r.id}  ${r.title}${r.score ? ` (${r.score.toFixed(3)})` : ''}`)
        console.log(`  ${r.snippet}\n`)
      }
      console.log(`${result.results.length} results`)
    }
  })

// --- Share ---

doc
  .command('share <id>')
  .description('Create a share link for a document')
  .option('--expires <days>', 'Expiry in days', '30')
  .action(async (id, opts) => {
    const result = await apiFetch<{ token: string; url: string }>('/share/links', {
      method: 'POST',
      body: JSON.stringify({ documentId: id, expiresInDays: parseInt(opts.expires) }),
    })

    const creds = getCredentials()
    console.log(`✓ Share link: ${creds.apiUrl}${result.url}`)
  })

// --- Publish ---

doc
  .command('publish <id>')
  .description('Publish a document as HTML')
  .action(async (id) => {
    const result = await apiFetch<{ url: string; publishedAt: string }>(`/share/publish/${id}`, {
      method: 'POST',
    })

    const creds = getCredentials()
    console.log(`✓ Published: ${creds.apiUrl}${result.url}`)
    console.log(`  At: ${result.publishedAt}`)
  })

// --- Folders ---

const folder = program.command('folder').description('Manage folders')

folder
  .command('list')
  .description('Get folder tree')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const result = await apiFetch<{ folders: unknown[] }>('/folders')
    console.log(JSON.stringify(result, null, 2))
  })

folder
  .command('create <name>')
  .description('Create a folder')
  .option('--parent <id>', 'Parent folder ID')
  .action(async (name, opts) => {
    const body: Record<string, unknown> = { name }
    if (opts.parent) body.parentId = opts.parent

    const result = await apiFetch('/folders', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    console.log('✓ Folder created:', JSON.stringify(result, null, 2))
  })

// --- Uploads ---

const upload = program.command('upload').description('Manage uploads')

upload
  .command('list')
  .description('List uploaded files with extraction status')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const result = await apiFetch<{ files: Array<{ id: string; filename: string; contentType: string; sizeBytes: number; extractionStatus: string | null; summary: string | null }> }>(
      '/uploads',
    )

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      for (const f of result.files) {
        const status = f.extractionStatus ?? 'unknown'
        const size = f.sizeBytes < 1024 * 1024
          ? `${(f.sizeBytes / 1024).toFixed(1)}KB`
          : `${(f.sizeBytes / (1024 * 1024)).toFixed(1)}MB`
        console.log(`${f.id}  ${f.filename}  ${size}  [${status}]`)
        if (f.summary) console.log(`  ${f.summary}`)
      }
      console.log(`\n${result.files.length} files`)
    }
  })

// --- Tags ---

program
  .command('tags')
  .description('List all tags')
  .action(async () => {
    const result = await apiFetch<{ tags: Array<{ tag: string; count: number }> }>('/tags')
    for (const t of result.tags) {
      console.log(`${t.tag} (${t.count})`)
    }
  })

program.parse()
