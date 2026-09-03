# End-to-end tests

These run the real app against a real Postgres in a real browser. They exist
because `npm run build` and `npm run lint` both pass on code that fails the
moment a user touches it — the import wizard once compiled cleanly while every
task it tried to create was rejected with a 400.

## Running locally

```bash
bash scripts/e2e-setup.sh   # local postgres + migrations + seed + .env.local
npm run build
npm run test:e2e
```

`scripts/e2e-setup.sh` is safe to re-run; it recreates the database each time.
It prints the fixture credentials at the end.

To test an already-running server (a Vercel preview, say) instead of starting
one:

```bash
E2E_BASE_URL=https://your-preview.vercel.app npm run test:e2e
```

If the environment ships its own Chromium rather than Playwright's pinned
build, point at it:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## What is covered

| Spec | Covers |
|---|---|
| `smoke.spec.ts` | Every admin page renders with no API error; nav groups resolve; stakeholder dashboard loads |
| `import.spec.ts` | Workbook upload → sheet resolution → story picker → drafting → task creation, verified against the API |
| `task-steps.spec.ts` | Marking several steps pass in rapid succession persists, with no stale-version 409s |

## Conventions

- **Assert on the server, not the toast.** A success message is not evidence.
  `import.spec.ts` re-reads `/api/tasks` and finds the task it created.
- **Fail on API errors.** `failOnServerErrors` records any 4xx/5xx on `/api/*`
  during a test. Several shipped bugs were visible only as a status code.
- **Log in once.** `auth.setup.ts` saves a session per role; logging in inside
  every spec trips the login rate limiter and fails unrelated tests.
- **A regression test must be shown to fail.** Revert the fix, watch the test
  go red, restore it. `task-steps.spec.ts` was verified this way.

## Fixtures

The seed marks accounts `mustChangePassword`, which is right for a real first
login but puts a modal over every test, so the setup script clears it on the
seeded accounts only.
