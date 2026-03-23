#!/usr/bin/env node
import { Command } from 'commander'
import { existsSync, statSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { zipSync } from 'fflate'
import { apiFetch, saveCredentials, getCredentials, apiUpload, streamSSE } from './api-client.js'

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

// --- Import ---

const importCmd = program.command('import').description('Import documents from other tools')

importCmd
  .command('obsidian <vault-path>')
  .description('Import Obsidian vault (directory will be zipped and uploaded)')
  .option('--folder <id>', 'Target folder ID in AgentWiki')
  .option('--json', 'JSON output')
  .action(async (vaultPath: string, opts: { folder?: string; json?: boolean }) => {
    const absPath = resolve(vaultPath)
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      console.error('✗ Error: Vault path must be an existing directory')
      process.exit(1)
    }

    console.log('Zipping vault...')
    const zipBuffer = zipDirectory(absPath)

    console.log(`Uploading ${(zipBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB...`)
    const formData = new FormData()
    formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'vault.zip')
    formData.append('source', 'obsidian')
    if (opts.folder) formData.append('targetFolderId', opts.folder)

    const { jobId } = await apiUpload<{ jobId: string }>('/import', formData)
    console.log(`Import started: ${jobId}\n`)

    await streamImportProgress(jobId, opts.json ?? false)
  })

importCmd
  .command('notion <zip-path>')
  .description('Import Notion export ZIP file')
  .option('--folder <id>', 'Target folder ID in AgentWiki')
  .option('--json', 'JSON output')
  .action(async (zipPath: string, opts: { folder?: string; json?: boolean }) => {
    const absPath = resolve(zipPath)
    if (!existsSync(absPath) || !absPath.endsWith('.zip')) {
      console.error('✗ Error: Must provide a valid .zip file')
      process.exit(1)
    }

    const fileData = readFileSync(absPath)
    console.log(`Uploading ${(fileData.byteLength / (1024 * 1024)).toFixed(1)}MB...`)

    const formData = new FormData()
    formData.append('file', new Blob([fileData], { type: 'application/zip' }), 'notion-export.zip')
    formData.append('source', 'notion')
    if (opts.folder) formData.append('targetFolderId', opts.folder)

    const { jobId } = await apiUpload<{ jobId: string }>('/import', formData)
    console.log(`Import started: ${jobId}\n`)

    await streamImportProgress(jobId, opts.json ?? false)
  })

importCmd
  .command('lark')
  .description('Import from LarkSuite workspace via API')
  .requiredOption('--token <token>', 'Lark access token')
  .option('--space <id>', 'Lark space ID')
  .option('--folder <id>', 'Target folder ID in AgentWiki')
  .option('--json', 'JSON output')
  .action(async (opts: { token: string; space?: string; folder?: string; json?: boolean }) => {
    const body: Record<string, string> = { token: opts.token }
    if (opts.space) body.spaceId = opts.space
    if (opts.folder) body.targetFolderId = opts.folder

    const { jobId } = await apiFetch<{ jobId: string }>('/import/lark', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    console.log(`Import started: ${jobId}\n`)

    await streamImportProgress(jobId, opts.json ?? false)
  })

importCmd
  .command('history')
  .description('List past imports')
  .option('--json', 'JSON output')
  .action(async (opts: { json?: boolean }) => {
    const jobs = await apiFetch<Array<{
      id: string; source: string; status: string
      processedDocs: number; totalDocs: number; createdAt: number
    }>>('/import')

    if (opts.json) {
      console.log(JSON.stringify(jobs, null, 2))
      return
    }

    if (!jobs.length) { console.log('No imports found.'); return }

    console.log('ID                     SOURCE     STATUS      DOCS    DATE')
    for (const j of jobs) {
      const status = j.status === 'completed' ? '✓ done' : j.status === 'failed' ? '✗ failed' : j.status
      const date = new Date(j.createdAt).toLocaleDateString()
      console.log(`${j.id}  ${j.source.padEnd(10)} ${status.padEnd(11)} ${j.processedDocs}/${j.totalDocs}   ${date}`)
    }
  })

/** Stream import progress from SSE endpoint */
async function streamImportProgress(jobId: string, jsonMode: boolean): Promise<void> {
  await streamSSE(`/import/${jobId}/progress`, (event: Record<string, unknown>) => {
    if (jsonMode) {
      console.log(JSON.stringify(event))
      return
    }
    switch (event.type) {
      case 'start': console.log(`Importing ${event.total} documents...\n`); break
      case 'folder': console.log(`  📁 ${event.name}`); break
      case 'document': console.log(`  ✓ [${event.current}/${event.total}] ${event.name}`); break
      case 'attachment': console.log(`    📎 ${event.name}`); break
      case 'link-resolve': console.log(`  🔗 Resolved ${event.current} internal links`); break
      case 'error': console.error(`  ✗ ${event.message}`); break
      case 'complete': {
        const s = event.summary as Record<string, unknown> | undefined
        if (s) {
          console.log(`\n✓ Import complete!`)
          console.log(`  Folders: ${s.foldersCreated}`)
          console.log(`  Documents: ${s.documentsCreated}`)
          console.log(`  Images: ${s.attachmentsUploaded}`)
          console.log(`  Links: ${s.linksResolved}`)
          const errors = s.errors as unknown[]
          if (errors?.length) console.log(`  Errors: ${errors.length}`)
          console.log(`  Duration: ${((s.durationMs as number) / 1000).toFixed(1)}s`)
        }
        break
      }
    }
  })
}

/** ZIP a directory using fflate */
function zipDirectory(dirPath: string): ArrayBuffer {
  const files: Record<string, Uint8Array> = {}

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      // Skip .obsidian config directory
      if (entry === '.obsidian' || entry === '.trash' || entry === '.DS_Store') continue
      const fullPath = join(dir, entry)
      const relPath = relative(dirPath, fullPath).replace(/\\/g, '/')
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath)
      } else {
        files[relPath] = new Uint8Array(readFileSync(fullPath))
      }
    }
  }

  walk(dirPath)
  const zipped = zipSync(files)
  return (zipped.buffer as ArrayBuffer).slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
}

program.parse()
