# Hyperframes Composition Brief: CTT (Cuba Try Test) — v2

> Rebuilt. v1 was planned as a `polished` "quiet enterprise product film" with the
> product's onboarding copy as its centrepiece — no conflict, nothing at stake, and a
> tone that forbids excitement. See `brag-plan.md` for the full post-mortem.
> Audience is **DKSH internal**: the video opens on the problem they have lived (an
> unanswered Teams thread) and then shows CTT answering it.

## Objective
A short brag video for CTT — the UAT sign-off system that makes a release prove it was
tested, per market, before it reaches production.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: 22.0s

## Source Material
- Project root: `/home/user/CTT-DP`
- Primary files read: `README.md`, `tailwind.config.js`, `app/globals.css`,
  `app/layout.tsx`, `prisma/schema.prisma`, `views/StakeholderDashboard.tsx`,
  `views/TaskDetail.tsx`, `components/SignatureCanvas.tsx`, `lib/teams.ts`
- Product name: CTT (Cuba Try Test)
- The claim that matters: a release cannot reach production on "i think so."
- Key UI moments to recreate: the per-market board, a step marked PASS by cursor, and
  the `Draw Signature` canvas closing a task into `DEPLOYED`
- Copy that must appear verbatim:
  - `Expected Result`, `Actual Result`, `Draw Signature`
  - `READY`, `IN_PROGRESS`, `PASSED`, `DEPLOYED`, `EasyOrder`
- The Teams framing is grounded: the product ships Teams webhook notifications
  (`lib/teams.ts`), so that thread is where this conversation actually happens.

> **SCOPE LOCK — SIT is out of scope.** No SIT task, test case, evidence, defect, QA
> run, Jira queue, or AI-drafting material in any scene. Do not read
> `views/AdminDraftTasks.tsx`, `views/AdminJiraIntake.tsx`, `lib/sit*.ts`, or
> `app/api/sit-*`. UAT only.

## Creative Direction
- Tone: `deadpan` → `polished` arc. The mess is played completely straight; the fix is
  played clean.
- Creative direction: *The thread everyone has been in, answered.*
- Interpretation: Scene 1 gets room so the silence lands. From the cut onward, pacing
  tightens and every beat resolves something the thread left open.
- Angle: the gap between "i think so" and proof. Everyone in the audience has been in
  that thread. The name lands last — *cuba* is Malay for *try*, so CTT is sincerely
  "Try Try Test" — as the button on the outro, not the hook.
- Hook: a Teams thread. "EasyOrder goes live Friday." → **"did MY sign off?"**
- Outro / punchline: **"Now you can prove it."** then the lockup `CTT · cuba try test`.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Explaining what UAT is — this audience knows
  - Anything from the SIT half of the product

## Visual Identity
- Background: `#f8fafc` light, `#0f172a` slate-900 dark
- Accent: `#c4161c` (`brand-500`); `#e0454a` on dark where contrast requires it
- Muted text: `#6c7786` — contrast-tuned to clear WCAG AA
- Status colours from the code: `PASSED`/`DEPLOYED` emerald, `IN_PROGRESS` amber,
  `FAILED` rose
- Type: generic `ui-sans-serif, system-ui` stack — no webfont ships, and a named family
  without an `@font-face` fails lint
- **Scale rule:** author at video scale, not UI scale. Body 33–42px, headlines 124–128px,
  layouts fill the frame. (v1 recreated UI at browser scale and read as tiny.)
- Motion vocabulary from `app/globals.css`: `ctt-card-enter` (260ms, 8px rise),
  `ctt-status-pop` (220ms ease-out)

## Storyboard
`brag-output/brag-plan.md` is the creative contract. Scene summary:

1. **The thread** — 0.00, 6.34s — Teams messages arrive every other beat; "i think so?"
   tinted rose; a typing indicator that never resolves.
2. **The turn** — 6.34, 2.10s — slate-900, 128px: "Nobody could prove it."
3. **The board answers** — 8.44, 4.21s — MY `PASSED` / TH `IN_PROGRESS` / SG `READY`,
   rows arriving on the beat grid.
4. **The step, marked** — 12.65, 3.16s — a cursor travels in and clicks PASS at 14.22s.
5. **Signed and deployed** — 15.81, 3.67s — signature draws, `DEPLOYED`, report emailed.
6. **Outro** — 19.48, 2.52s — "Now you can prove it." + `CTT · cuba try test`.

## Audio
- Role: low bed under the mess, lift at the turn, resolve on the payoff, fade on the lockup.
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (114.84 BPM, 113.64s),
  in `composition/assets/music/`.
- Music treatment: 0.5 under scene 1 → 0.72 at the cut to CTT (8.44s) → 0 across
  20.3–21.9s.
- Music cue guidance: bundled preset. Strong cues locked at **6.34s** (the turn),
  **8.44s** (CTT answers), **17.91s** (`DEPLOYED`). Beat-grid reveals: messages at
  1.07 / 2.12 / 3.18 / 4.23, market rows at 8.96 / 9.50 / 10.01.
- SFX — implemented, in `composition/assets/sfx/`, all low high-frequency-risk per the
  skill's `sfx-analysis.md`:
  - message arrivals ×4 — `drop_002.ogg`
  - market rows ×3 — `rollover2.ogg`
  - the click on PASS — `mouseclick1.ogg` + `click_002.ogg` (fire with the visual)
  - `DEPLOYED` — `bong_001.ogg`
  - Each on its own track index with a duration matching the file, so nothing layers.
- Audio-reactive: `none`, deliberate. An audit tool should not visibly pulse to music.
- Restraint rule: no whooshes on text, no riser into the outro, no impact on the lockup.
  Silence under the name.

## Hyperframes Instructions
- Show real UI, not marketing filler — scenes 3–5 are recreations of actual CTT screens.
- Keep all text readable: short labels ≥0.8s settled, sentences ≥0.3s/word. Messages are
  spaced ~1.05s apart, well above the floor at 40px.
- Stay within 15–25s. Target 22.0s.
- Lock 1–3 major reveals to strong cues within ±0.15s; mark `// beat-locked`.
- Snap sequential reveals to the beat grid within ±0.10s; mark `// beat-grid`.
- Local assets only. GSAP is vendored because the render sandbox cannot reach the CDN
  through its TLS proxy.
- `hyperframes check` must pass clean before render — it is brag's single gate.
