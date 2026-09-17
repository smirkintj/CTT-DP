# Hyperframes Composition Brief: CTT (Cuba Try Test)

## Objective
Create a short launch-style brag video for CTT — the UAT sign-off system DKSH uses
to prove a release was actually tested before it ships.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20s

## Source Material
- Project root: `/home/user/CTT-DP`
- Primary files read: `README.md`, `package.json`, `tailwind.config.js`,
  `app/globals.css`, `app/layout.tsx`, `prisma/schema.prisma`,
  `views/StakeholderDashboard.tsx`, `views/TaskDetail.tsx`,
  `components/SignatureCanvas.tsx`
- Product name: CTT (Cuba Try Test)
- Tagline / strongest claim: *"Complete these 3 steps to finish your UAT flow."*
  — the product's own onboarding copy
- Key UI moment to recreate: the `Draw Signature` canvas closing a task, followed
  by the status chip flipping to `DEPLOYED`
- Copy that must appear verbatim:
  - "Choose an assigned task and review test steps."
  - "Mark PASS/FAIL and add comments or evidence."
  - "After completion, submit signature to close task."
  - `EasyOrder`, `READY`, `IN_PROGRESS`, `PASSED`, `DEPLOYED`
  - `Expected Result`, `Actual Result`, `Draw Signature`, `Email Report to Me`

> **SCOPE LOCK — SIT is out of scope.** No SIT task, test case, evidence, defect,
> QA run, Jira queue, or AI-drafting material may appear in any scene. Do not read
> `views/AdminDraftTasks.tsx`, `views/AdminJiraIntake.tsx`, `lib/sit*.ts`, or
> `app/api/sit-*`. This video is the UAT flow only.

## Creative Direction
- Tone preset: `polished`
- Creative direction: *Quiet enterprise product film — the unglamorous thing, done well.*
- Interpretation: Fewer scenes, longer holds, confident restraint. Motion is crisp
  but never frantic. The only wink is the product's name, delivered deadpan once in
  scene 1 and never mentioned again.
- Angle: The name is the whole joke, and it isn't one. *Cuba* is Malay for *try* —
  the product is sincerely named "Try Try Test." That literalism is the brand: boring,
  load-bearing software that exists so nobody ever has to say "I think we tested it."
  The video plays it entirely straight and lets the audit trail be the flex.
- Hook: Black frame. "Someone has to try it." Then `cuba try test` beneath it in DKSH red.
- Outro / punchline: "Tested. Signed. Deployed." over `34 migrations. 65 routes. 3 roles. 0 "I think it works."`
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Anything from the SIT half of the product

## Visual Identity
- Background (light): `#f8fafc` — set on `body` in `app/globals.css`
- Background (dark): `#0f172a` — slate-900, the project's stated primary dark
- Text: `#0f172a` primary, `#64748b` secondary
- Accent: `#c4161c` (`brand-500` in `tailwind.config.js`); deep `#991116`
- Status colors, taken from the code:
  - `PASSED` / `DEPLOYED` → emerald (`bg-emerald-100 text-emerald-600`)
  - `FAILED` → `bg-rose-600 text-white`
  - `CONDITIONAL` → `bg-amber-600 text-white`
- Display font: Inter in the product; generic `ui-sans-serif, system-ui` stack in the
  composition (no webfont is shipped, and a named family without an `@font-face`
  fails lint)
- Body font: same stack
- Visual references from the project:
  - Task cards with product badge + status chip (`views/StakeholderDashboard.tsx`)
  - `Expected Result` / `Actual Result` two-column step row (`views/TaskDetail.tsx`)
  - The signature canvas (`components/SignatureCanvas.tsx`)
  - The app's real keyframes in `app/globals.css`: `ctt-status-pop` (220ms ease-out),
    `ctt-card-enter` (260ms, 8px rise) — reuse this motion vocabulary

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. **Hook** — 3.0s — "Someone has to try it." then `cuba try test` in red. Stillness.
2. **The board** — 4.0s — Search field, filter chips, 3 task cards arriving one by one
   with `EasyOrder` badges and real status chips.
3. **The three steps** — 7.0s — The product's onboarding copy verbatim, one line at a
   time, each paired with a live UI fragment; PASS chip pops on line 2.
4. **Signed and deployed** — 4.0s — Signature stroke draws itself; status flips to
   `DEPLOYED`; `Email Report to Me` toast slides in.
5. **Outro** — 2.0s — "Tested. Signed. Deployed." + the stat line.

## Audio
- Audio role: Warm corporate bed with restrained, motion-matched accents.
- Audio arc: Enters low under a still hook, lifts once as real work arrives, holds flat
  and unhurried through the flow, resolves on a single clean moment at `DEPLOYED`, fades
  to deliberate silence before the last frame.
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (114.84 BPM, 113.64s)
- Music treatment: Start at 0.00s, low throughout, slight lift at the first card reveal,
  fade to zero across the final 1.5s.
- Music cue guidance: Bundled preset read from
  `skills/brag/assets/music/cues/happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.md`.
  - Strong cues to lock: **3.70s** (board reveal), **7.92s** (first flow step), **16.34s** (`DEPLOYED`).
  - Beat-grid window for the 3 sequential flow lines: **7.92 / 10.01 / 12.12** — every 4th
    beat, ~2.1s apart. These are readable sentences, so do NOT snap them to consecutive beats.
- Audio-reactive treatment: `none` — deliberate. The `polished` tone and the enterprise
  subject call for restraint, and a corporate audit tool should not visibly pulse to music.
  This is a creative decision, not an extraction failure.
- SFX posture: sparse, motion-matched, professional restraint; ~5 cues across 20s.
- Audio-coupled moments:
  - Scene 2, card arrivals — card-by-card sequential reveal
  - Scene 3, the three lines — sequential beat-grid reveal
  - Scene 3, PASS chip — simulated marking action
  - Scene 4, signature stroke — simulated drawing gesture (continuous, not a scratch)
  - Scene 4, `DEPLOYED` chip — the single payoff moment
- SFX selection guidance: Sound should follow the implemented motion, not the plan.
  Card sounds for card reveals; a short clean cue for the `DEPLOYED` payoff; dry ticks
  for the sequential lines. No whooshes on text, no riser into the outro, no impact on
  the final frame. If a cue would make this feel like an ad, cut it.
- SFX analysis guidance: `skills/brag/assets/sfx/sfx-analysis.md` — prefer low
  high-frequency-risk files for the repeated card and line cues.
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume
  based on the implemented animation.
- Audio files: music copied to `brag-output/composition/assets/music/`.

## Hyperframes Instructions
Requirements:
- Show at least one real UI, copy, or visual element from the source project. (Scenes 2–4
  are all recreations of real CTT screens.)
- Keep all text readable: short labels hold ≥0.8s settled; full sentences ≥0.3s/word.
  The three flow lines are 7–8 words each and are spaced 2.1s apart.
- Keep the video within 15–25 seconds. Target is exactly 20.0s.
- Include the music layer; fade it out under the outro.
- Lock 1–3 major reveals to strong cues within ±0.15s; mark them `// beat-locked`.
- Snap the sequential card and line reveals to the beat grid within ±0.10s; mark
  them `// beat-grid`.
- Use local assets only.
- Run `hyperframes check` before render — it is brag's single gate.
