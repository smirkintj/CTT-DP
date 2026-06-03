# CTT — Claude Code Context

## Project
Change Tracking Tool (CTT) for DKSH. Tracks UAT and SIT testing across products and markets before production deployments.

**Stack:** Next.js 15 (App Router), React 19, TypeScript ~5.8, Prisma 6, PostgreSQL (Neon), Tailwind 3, Vercel  
**Version:** `1.4.2` (semver in `package.json`)

## Conventions

### Commits
Conventional Commits with scope:
- `feat(sit): add sign-off route`
- `fix(api): correct product access guard`
- `perf(dashboard): reduce task list query`
- `docs: update README for SIT flow`

### Branches
- `feat/<name>` or `codex/<name>` — always branch off main, never work directly on main

### TypeScript
- `strict: false`, `ES2022` target
- Use `@/*` for all root-relative imports (e.g. `@/lib/prisma`, `@/components/Button`)

### Database
- **Never delete or squash migrations**
- `prisma migrate dev` for local development
- `prisma migrate deploy` for staging/production
- **Never run `prisma migrate reset` on staging** — it wipes all data

### UI / Frontend
- Pure Tailwind only — no component libraries
- Lucide icons only
- Apple-like minimal aesthetic — clean, simple, no clutter
- `slate-900` as primary dark colour

### Docs
After any non-trivial feature or flow change, update both:
- `README.md`
- `PROJECT_OVERVIEW.md`

…in the same commit as the feature.

## Key Scripts
```bash
npm run dev              # local dev server
npm run build            # prisma generate + next build
npm run lint             # ESLint via next lint
npm run perf:sample      # run perf baseline (scripts/perf-baseline.sh)
npm run db:purge-and-seed   # wipe + reseed local DB
```

## Performance
- `@vercel/speed-insights` is installed and active
- Baseline script: `scripts/perf-baseline.sh`
- Branch convention for perf work: `perf/<name>`

## Roles & Access Model
- `ADMIN` — full access, manages products/tasks/users
- `STAKEHOLDER` — scoped to assigned tasks per country
- `QA` — scoped to assigned products, runs SIT testing

## Products in System
- EasyOrder (`EO`) — primary pilot product
- SalesHub (`SH`)
- ServicePro (`SP`)

## Staging Credentials
Stored in 1Password (CTT vault) — do not commit passwords to source files.
Accounts: `putra.mahirudin@dksh.com` (admin), `uat-my@dksh.com` (stakeholder MY), `qa-eo@dksh.com` (QA)

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
