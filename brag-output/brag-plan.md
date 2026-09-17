# Brag Plan: CTT (Cuba Try Test) — v2

> **Supersedes v1.** The first cut was tonally wrong. It was planned as a `polished`
> "quiet enterprise product film," which is a tone that forbids excitement, and its
> centrepiece was the product's onboarding copy — a numbered list of instructions
> rather than the product doing anything. It had no conflict, so nothing was at stake
> and nothing was won. v2 rebuilds the story around the problem CTT actually solves.

> **Scope lock:** UAT only. SIT is out of scope — no `SitTask`, test cases, evidence,
> defects, QA runs, Jira queue, or AI drafting in any scene. Do not read
> `views/AdminDraftTasks.tsx`, `views/AdminJiraIntake.tsx`, `lib/sit*.ts`, or
> `app/api/sit-*`.

## Audience
DKSH internal — stakeholders, QA leads, managers. They already know what UAT is and
they have personally lived the "before." The video does not explain UAT; it shows the
pain, then the fix.

## What is this app?
CTT is the system that makes a release prove it was tested. Per market, per step,
PASS or FAIL with evidence, closed by a signature that becomes an emailed sign-off report.

## The angle
**The gap between "i think so" and proof.**

Before CTT, "did Malaysia sign off?" was answered in a Teams thread, from memory, by
whoever replied fastest. That thread is the villain, and everyone watching has been in
it. The video opens inside it, lets the question go unanswered, then cuts to CTT
answering the same question with evidence.

The Teams framing is not invented dressing — the product ships Teams webhook
notifications (`lib/teams.ts`), so that thread is literally where this conversation
happens.

The name lands last: *cuba* is Malay for *try*, so CTT is sincerely "Try Try Test."
It plays as the button on the outro, not as the hook.

## Hook (first 3 seconds)
A Teams thread, large and centred. "EasyOrder goes live Friday." Then, from someone
else: **"did MY sign off?"** The hook is the question, because the audience already
knows the answer is going to be bad.

## Key moments
- **"i think so?"** — tinted rose, the only coloured message in the thread. This is the
  whole problem in three words.
- **"TH? SG?"** — the problem multiplying across markets.
- **The typing indicator that never resolves.** Nobody answers. Hold on it.
- **"Nobody could prove it."** — hard cut to black, one line, full frame.
- **The board answers the question directly** — MY / TH / SG, each with status and step
  count. The scene is built as the literal answer to the message that went unanswered.
- **A cursor clicks PASS.** Not a static chip — the product being used.
- **The signature, then `DEPLOYED`, then the report emails itself.**

## Outro / punchline
**"Now you can prove it."** Then the lockup: `CTT · cuba try test`.

## User flow worth showing
Entry → the market board answering "who has signed off?"
Key action → a step marked PASS with evidence, by cursor
Result → signature, `DEPLOYED`, sign-off report emailed

## Tone
- Preset: `deadpan` → `polished` arc. The mess is played completely straight (that is
  what makes it funny and uncomfortable); the fix is played clean.
- Creative direction: *The thread everyone has been in, answered.*
- Interpretation: Scene 1 gets room to breathe so the silence lands. From the cut
  onward, pacing tightens and every beat resolves something the thread left open.

## Format: landscape — 1920x1080
## Duration: 22.0s

## Visual identity (from the project)
- Background: `#f8fafc` light / `#0f172a` slate-900 dark
- Accent: `#c4161c` (`brand-500`), `#e0454a` on dark for contrast
- Muted text: `#6c7786` (contrast-tuned to clear WCAG AA)
- Status colours, real: `PASSED`/`DEPLOYED` emerald, `IN_PROGRESS` amber, `FAILED` rose
- Type: generic `ui-sans-serif, system-ui` stack — no webfont is shipped, and a named
  family without an `@font-face` fails lint
- **Scale rule learned from v1:** author at video scale, not UI scale. Body copy sits at
  33–42px, headlines at 124–128px, and layouts fill the frame instead of floating in it.
- Motion vocabulary reused from `app/globals.css`: `ctt-card-enter` (260ms, 8px rise),
  `ctt-status-pop` (220ms ease-out)

## Share copy
See `share-copy.txt`.

## Audio direction
- Role: low bed under the mess, lift at the turn, resolve on the payoff, fade on the lockup.
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (114.84 BPM)
- Music treatment: 0.5 under scene 1, up to 0.72 at the cut to CTT (8.44s), fade to 0
  from 20.3s.
- SFX (implemented, unlike v1 which specified them and shipped none):
  - message arrivals ×4 — `interface/drop_002.ogg`
  - market rows ×3 — `ui/rollover2.ogg`
  - the click on PASS — `ui/mouseclick1.ogg` + `interface/click_002.ogg`
  - `DEPLOYED` — `interface/bong_001.ogg`
  - All are low high-frequency-risk per the skill's `sfx-analysis.md`.
- Audio-reactive: `none`, deliberate. An audit tool should not visibly pulse to music.
- Restraint rule: no whooshes on text, no riser into the outro, no impact on the lockup.

## Storyboard

### Scene 1 — the thread — 0.00 to 6.34 (6.34s)
A Teams thread, 1560px wide, centred on slate-50. Messages arrive on every other beat
(1.07 / 2.12 / 3.18 / 4.23) so each is readable at 40px. "i think so?" is the only
tinted message. At 5.28 a typing indicator appears and pulses — and nobody answers.
Sequential/interaction: yes — four messages arriving one by one, then an unresolved
typing indicator.
Audio: soft message drop per arrival; music low and unhurried.
Transition mood: hard cut → Scene 2

### Scene 2 — the turn — 6.34 to 8.44 (2.10s)
// beat-locked: 6.34s strong cue
Slate-900, full frame, 128px: **"Nobody could prove it."** Nothing else moves.
Reading check: 4 words → ~1.2s floor; holds ~1.6s. ✓
Transition mood: hard cut → Scene 3

### Scene 3 — the board answers — 8.44 to 12.65 (4.21s)
// beat-locked: 8.44s strong cue
CTT. "Now you can answer that." Three market rows — MY `PASSED` (7 of 7, signed off,
evidence attached), TH `IN_PROGRESS` (4 of 7), SG `READY` (0 of 7) — arriving on the
beat grid at 8.96 / 9.50 / 10.01 with the app's own card-enter motion.
Sequential/interaction: yes — rows arrive one by one.
Audio: soft row cue per arrival; music lifts at the cut.
Transition mood: clean → Scene 4

### Scene 4 — the step, marked — 12.65 to 15.81 (3.16s)
Thailand's step 5 of 7. `Expected Result` / `Actual Result` side by side with a real
confirmation number and an attached screenshot. A cursor travels in and **clicks PASS**
at 14.22s; the button commits to filled emerald with a click ripple.
Sequential/interaction: yes — simulated cursor click, the product being used.
Audio: mouse click + a dry commit tick, landing together with the visual.
Transition mood: clean → Scene 5

### Scene 5 — signed and deployed — 15.81 to 19.48 (3.67s)
The signature draws itself across the canvas over 1.35s. The border flashes brand red
on completion, then `IN_PROGRESS` cross-fades to `DEPLOYED`. A toast slides in:
"Sign-off report emailed."
// beat-locked: 17.91s strong cue — the payoff
Audio: one warm announcement cue on `DEPLOYED`. Nothing else.
Transition mood: soft crossfade → Scene 6

### Scene 6 — outro — 19.48 to 22.00 (2.52s)
Slate-900. **"Now you can prove it."** at 124px, then the lockup: the CTT mark, `CTT`,
and `cuba try test` in brand red. Music fades to silence under it.
Audio: no cue on the lockup. Deliberate.

**Audio summary:** A low bed under a thread that never gets answered, a lift the moment
CTT takes the question, motion-matched cues on every real interaction, one warm
resolution on `DEPLOYED`, and silence on the name.

## Scene budget
| Scene | Name | Start | Duration |
|---|---|---|---|
| 1 | The thread | 0.00 | 6.34s |
| 2 | The turn | 6.34 | 2.10s |
| 3 | The board answers | 8.44 | 4.21s |
| 4 | The step, marked | 12.65 | 3.16s |
| 5 | Signed and deployed | 15.81 | 3.67s |
| 6 | Outro | 19.48 | 2.52s |
| | **Total** | | **22.00s** ✓ (15–25s) |
