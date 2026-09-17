# Brag Plan: CTT (Cuba Try Test)

> **Scope lock:** This video covers the **UAT side of CTT only**. SIT is explicitly
> out of scope — no `SitTask`, test cases, evidence, defects, QA runs, Jira SIT
> queue, or AI drafting appears in any scene. Do not pull material from
> `views/AdminDraftTasks.tsx`, `views/AdminJiraIntake.tsx`, `lib/sit*.ts`, or any
> `app/api/sit-*` route.

## What is this app?
CTT is the system DKSH uses to prove a release was actually tested — assigned
testers walk real test steps market by market, mark PASS/FAIL with evidence, and
close the task with a drawn signature that becomes an emailed sign-off report.

## The angle
The name is the whole joke, and it's not a joke. **"Cuba Try Test"** — *cuba* is
Malay for *try*. The product is named, with total sincerity, "Try Try Test." That
literalism *is* the brand: this is unglamorous, boring, load-bearing software that
exists so nobody ever has to say "I think we tested it."

The video plays it completely straight. No SaaS voice, no "streamline your
workflow." The angle is **quiet competence**: show the real screens, the real
statuses, the real signature, and let the audit trail be the flex.

## Hook (first 2-3 seconds)
Full-bleed slate-900. One line, centred, Inter, tight tracking:

> **"Someone has to try it."**

Hold. Then, small, beneath it, in DKSH red: **`cuba try test`** — lowercase, like a
translation note. The pun lands without anyone explaining it.

This earns the next 17 seconds because it reframes a boring compliance tool as the
last human checkpoint before production.

## Key moments (the middle)
- **The board fills.** Task cards arrive one by one into a stakeholder dashboard —
  each carrying a real product badge (`EasyOrder`) and a real status chip. The
  status vocabulary is the product's own: `READY` → `IN_PROGRESS` → `PASSED` → `DEPLOYED`.
- **The app narrates its own flow.** CTT literally ships onboarding copy that says
  *"Complete these 3 steps to finish your UAT flow."* Use those three lines verbatim
  as the spine of the centrepiece — the product describing itself in its own words.
- **A step gets marked.** `Expected Result` / `Actual Result` side by side. The
  PASS chip pops in using the app's real `ctt-status-pop` animation (220ms ease-out).
- **The signature.** A hand-drawn stroke fills the `Draw Signature` canvas in real
  time. This is the single most video-worthy asset in the codebase — a literal
  signature closing a literal ticket.
- **`DEPLOYED`.** Emerald chip. The report emails itself.

## Outro / punchline
Cut to black. One line:

> **"Tested. Signed. Deployed."**

Then, small: **`34 migrations. 65 routes. 3 roles. 0 'I think it works.'`**

## User flow worth showing
Taken verbatim from `views/StakeholderDashboard.tsx` — the app's own Getting Started panel:

1. **Entry** — *"Choose an assigned task and review test steps."*
2. **Key action** — *"Mark PASS/FAIL and add comments or evidence."*
3. **Result** — *"After completion, submit signature to close task."*

This is the centrepiece. Scenes 3 and 4 are the working app, not marketing.

## Tone
- **Preset:** `polished`
- **Creative direction:** *Quiet enterprise product film — the unglamorous thing, done well.*
- **Interpretation:** Fewer scenes, longer holds, confident restraint. Motion is
  crisp but never frantic; the product is serious infrastructure and the edit
  should trust it. The only wink is the name itself, delivered deadpan in scene 1
  and never mentioned again.

## Format: landscape — 1920x1080
## Duration: 20s

## Visual identity (from the project)
Pulled from `tailwind.config.js`, `app/globals.css`, `app/layout.tsx`.

- **Background:** `#f8fafc` (slate-50, set on `body`)
- **Dark surface:** `#0f172a` (slate-900 — the project's stated primary dark)
- **Accent / brand:** `#c4161c` (`brand-500`, DKSH red); deep variant `#991116` (`brand-600`)
- **Text:** `#0f172a` primary, `#64748b` (slate-500) secondary
- **Status palette (real, from the code):**
  - `PASSED` / `DEPLOYED` → emerald (`bg-emerald-100 text-emerald-600`)
  - `FAILED` → `bg-rose-600 text-white`
  - `CONDITIONAL` → `bg-amber-600 text-white`
- **Display font:** Inter (600/700 weights)
- **Body font:** Inter (400/500)
- **Strongest visual element:** the `Draw Signature` canvas (`components/SignatureCanvas.tsx`)
- **Bonus — reuse the app's own motion:** `ctt-status-pop` (220ms ease-out),
  `ctt-card-enter` (260ms, 8px rise), `ctt-shimmer`. Animating the video with the
  product's actual keyframes is the most "specific to this project" choice available.

## Share copy (draft)
> Built CTT — "Cuba Try Test." Malay for *try*. It's the thing that stands between
> a release and production: real test steps, per-market, marked PASS or FAIL with
> evidence, closed with a signature that emails itself as an audit report. 34
> migrations of saying "prove it."

## Audio direction
- **Role:** Warm corporate bed with restrained, motion-matched accents.
- **Music:** `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (114.84 BPM,
  113.64s). Chosen for steady mid-tempo business warmth that suits `polished`
  without tipping into upbeat-ad energy.
- **Music treatment:** Start at 0.00s. Sit low (~-18 LUFS relative to a silent
  mix) under scene 1, lift slightly at the first card reveal, hold flat through
  the flow, and fade out over the final 1.5s of the outro.
- **Music cue guidance:** Preset cue file read (`cues/…vol-9….music-cues.md`).
  - Strong cues to target: **3.70s** (board reveal), **7.92s** (first flow step),
    **16.34s** (`DEPLOYED` chip).
  - Beat-grid window for the 3 sequential flow steps: **7.92 / 10.01 / 12.12** —
    every 4th beat, ~2.1s apart, comfortably above the readable floor for a
    full sentence. Do **not** snap these to consecutive beats.
- **Audio-reactive treatment:** Subtle. Music RMS may breathe the hero card's
  shadow depth and the red accent's glow. No waveform bars, no pumping.
- **SFX posture:** Sparse, motion-matched, professional restraint. Roughly five
  cues total across 20 seconds.
- **Audio-coupled moments:** card-by-card arrival on the board; the three flow
  lines appearing in sequence; the PASS chip pop; the signature stroke (a soft
  continuous pen texture, not a scratch); the `DEPLOYED` chip.
- **Restraint rule:** No whooshes on text, no riser into the outro, no impact hit
  on the logo. If a cue would make this feel like an ad, cut it. Silence is
  allowed in the last 0.5s.

## Storyboard

### Scene 1 — "Someone has to try it." — 3.0s
Full-bleed slate-900 (`#0f172a`). Hook line centred in Inter 700, large, tight
tracking, fading up over 0.4s and then holding still. At ~2.0s, small lowercase
`cuba try test` fades in beneath it in brand red `#c4161c`, letter-spaced wide,
like a dictionary gloss. No motion after that — let it sit.
Reading check: hook is 5 words → ~1.5s floor; it holds ~2.6s. ✓
Sequential/interaction: none — deliberate stillness.
Audio intent: music enters low and unhurried; the room is calm before work starts.
Audio-coupled idea: none. Restraint.
Music: warm, low, steady.
Transition mood: clean → Scene 2

### Scene 2 — The board — 4.0s
Hard cut to slate-50 (`#f8fafc`). The stakeholder dashboard. Search field reading
`Search tasks...`, filter chips `Open Tasks` / `In Progress` / `Unread`. Three task
cards arrive one by one using the app's real `ctt-card-enter` (260ms, 8px rise),
first landing on the **3.70s** strong cue. Each card carries the `EasyOrder`
product badge, a market label, and a status chip — one `READY`, one `IN_PROGRESS`,
one `PASSED` (emerald).
Reading check: chips are 1-word labels → 0.8s floor each; all three hold together
for the final ~1.8s of the scene. ✓
Sequential/interaction: yes — 3 cards arrive one by one, ~0.5s apart, then the full
set holds on screen.
Audio intent: quiet arrival; the sense of a queue of real work.
Audio-coupled idea: soft card-settle cue per arrival, well under the music.
Music: lifts slightly as the first card lands.
Transition mood: soft slide → Scene 3

### Scene 3 — The three steps (centrepiece) — 7.0s
The product's own onboarding copy, verbatim, revealed one line at a time on the
beat grid at **7.92 / 10.01 / 12.12**:

1. *"Choose an assigned task and review test steps."*
2. *"Mark PASS/FAIL and add comments or evidence."*
3. *"After completion, submit signature to close task."*

Each line is paired with a live fragment of the real UI rising alongside it:
line 1 → a test-step row; line 2 → `Expected Result` / `Actual Result` in two
columns with a `PASSED` chip popping in via `ctt-status-pop`; line 3 → the empty
`Draw Signature` canvas with its dashed border.
Reading check: each line is 7-8 words → ~2.1s floor; spacing is exactly 2.1s and
all three hold together through the scene's final beat. ✓
Sequential/interaction: yes — three lines + three UI fragments in strict sequence;
the PASS chip is a simulated marking action, not a static badge.
Audio intent: forward motion without urgency; each step feels decided, not rushed.
Audio-coupled idea: a dry tick on each line arrival; a slightly brighter, shorter
cue on the PASS chip pop.
Music: steady, flat, supportive — no build.
Transition mood: clean → Scene 4

### Scene 4 — Signed and deployed — 4.0s
Push in on the signature canvas. A stroke draws itself left to right over ~1.4s in
slate-900 — real handwriting pace, with the natural pause mid-name. On completion
the canvas border flashes brand red once, then the task's status chip transitions
`IN_PROGRESS` → `DEPLOYED` (emerald) on the **16.34s** strong cue. A small toast
slides in bottom-right: `Email Report to Me`.
Reading check: `DEPLOYED` is one word → 0.8s floor; holds ~1.6s. ✓
Sequential/interaction: yes — the signature is a simulated drawing gesture; the
status change and toast follow as consequences.
Audio intent: quiet resolution — the moment of accountability landing.
Audio-coupled idea: continuous soft pen texture under the stroke (not a scratch);
one clean chime on `DEPLOYED`; a near-silent slide on the toast.
Music: holds; begins its fade at the end of the scene.
Transition mood: soft crossfade → Scene 5

### Scene 5 — Outro — 2.0s
Cut to slate-900. Centred:

> **Tested. Signed. Deployed.**

At ~18.9s, small and slate-500 beneath it:
`34 migrations. 65 routes. 3 roles. 0 "I think it works."`

Brand-red hairline rule underneath. No logo animation, no impact hit.
Reading check: outro line is 3 words → 0.8s floor, holds 2.0s; the stat line is a
deliberate "read it if you catch it" detail. ✓
Sequential/interaction: none.
Audio intent: the bed resolves and steps away; the last ~0.5s is silent.
Audio-coupled idea: none. Deliberate.
Music: fade to zero over the final 1.5s.
Transition mood: hold to black — END

**Music mood for this video:** warm, steady, corporate-but-human — never upbeat-ad.
**Audio summary:** A low warm bed enters under a still hook, lifts once as real work
arrives, holds flat and unhurried through the three-step flow with dry motion-matched
ticks, resolves on a single clean chime at `DEPLOYED`, and fades to deliberate silence
before the last frame.

---

## Scene budget
| Scene | Name | Duration |
|---|---|---|
| 1 | Someone has to try it. | 3.0s |
| 2 | The board | 4.0s |
| 3 | The three steps | 7.0s |
| 4 | Signed and deployed | 4.0s |
| 5 | Outro | 2.0s |
| | **Total** | **20.0s** ✓ (15–25s) |
