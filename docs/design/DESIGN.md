# Margins (formerly StudyBuddy) UI and UX specification

This is the source of truth for the new frontend. It replaces the old UI entirely. The backend
(Next.js API routes in `frontend/src/app/api`, server libs in `frontend/src/lib`, Prisma schema,
AI service) stays as it is. The backend contract is in `/tmp/sb-design/API_AND_FEATURES.md`
(and `/tmp/sb-design/VOICE_API.md` for the new voice coach).

Design read: a study workspace for university students preparing for exams. Calm, welcoming,
focused, quick. It should feel like a well made tool (Linear, Things, Notion-level clarity), not
an "AI product". One accent colour, quiet surfaces, strong typography, generous reading layout,
fast navigation. Content (their notes, questions, sources) is the hero, not chrome.

Dials: design variance 4 (product UI, orderly), motion 3 (purposeful transitions only),
density 5 (daily app). Landing page only: variance 7, motion 4, density 3.

---

## 1. Principles

1. **One next step, always visible.** Every course screen answers "what should I do now?" with a
   single primary action. Secondary actions are quieter.
2. **Content first.** Notes read like a good textbook page. Quizzes feel like a calm exam paper.
   Chrome recedes: hairline borders, no heavy cards, no decorative gradients.
3. **Progress is shown where the work is.** Completion and mastery live on the same controls the
   student uses to navigate (topic tabs, sidebar list), not on separate dashboards.
4. **Never leave the student guessing during waits.** Every background job shows what is
   happening in plain words, survives a page refresh, and explains failures with a way forward.
5. **Fast by default.** Server-rendered pages, no loading spinners for data that can be rendered
   on the server, heavy libraries (markdown, KaTeX, chat, voice, exam taker) loaded only where
   needed, instant feedback on every click.
6. **Keyboard friendly.** Command palette, shortcuts for quizzes and exams, visible focus.
7. **Plain, warm language.** Short sentences, sentence case, second person, no hype, no
   exclamation marks, no emojis, never the em dash or en dash character (use commas, colons,
   periods or a plain hyphen).

---

## 2. Vocabulary (UI copy)

| Backend | UI word |
|---|---|
| project | **Course** |
| material, categories lecture_notes / sample_exams / book_chapters / syllabus | **Materials**: Lecture notes / Past exams / Book chapters / Syllabus or schedule |
| material role content / syllabus / exam / other | **Used as**: Content / Syllabus / Past exam / Other |
| unit | **Unit** (a week, chapter or lecture group; its week label is shown as a Badge) |
| topic objectives | **By the end you can ...** |
| topic sources | **Taught from** (in the topic header), **From <file>, p. N** (under an item) |
| topic | **Topic** |
| section_notes | **Notes** |
| solved_examples | **Worked examples** |
| interactive_examples | **Practice** |
| topic_quiz | **Quiz** (a quiz set is "Set 1", "Set 2"...) |
| SampleExam | **Mock exam** |
| chat | **Ask** (page title "Ask your materials") |
| voice coach | **Voice practice** |
| next actions (today's items of the plan) | **Up next** |
| study plan | **Plan** (days, "Today", "Not scheduled: N topics") |
| Project.examDate / dailyMinutes | **Exam date**, **Time to study each day** |
| review schedule due | **Due for review** |
| missed questions quiz | **Retry what you missed** |
| new review set | **New questions** |
| Topic.examRelevant | a small **On past exams** tag |

**Names, one meaning each.** *Review* is only the spaced review of a topic that is due: the Review page,
"Due for review", the plan's "Review X" rows and the sidebar badge. The two ways to do one are
**Retry what you missed** and **New questions**. Speaking answers aloud is **Voice practice** (a topic
tab, and the screen the Review page links to), never "voice review". Timed papers are **Mock exam**
everywhere, including generated titles ("Mock exam, Oct 20"); "Sample exam" is not used.

**One next step.** Home's "Up next", the overview's "Up next", the sidebar badge and the Review page
all read `lib/learning/next-step.ts` (`nextStep`): a pure function of the plan and the due reviews.
"Due" means the review date falls before the end of the student's today, in their time zone, on every
screen. The step is one of: *work* (the first item left in today's plan), *reviews due* (today's plan
is done or full but reviews are due: it names the most overdue one), *clear* ("You're done for today"
only when something was done; "Nothing planned for today" otherwise), *exam passed*, *no topics* and
*setup*. "You're done for today" is never shown while a review is due.

Mastery labels (from `ReviewSchedule.mastery`, 0..1; no row = no signal):
Not started (no data), Learning (< 0.40), Getting there (0.40 to 0.79), Strong (>= 0.80).
The value shown everywhere is the **displayed mastery**: a topic whose review is overdue fades
(`mastery * 0.5^(overdueDays / (2 * intervalDays))`, never below half), worked out when it is read.
Mastery is blended from quizzes (45%), mock exams (25%), voice practice (15%) and practice (15%),
over the sources the student has used.

---

## 3. Visual system

All tokens are CSS variables defined once in `src/app/globals.css` with Tailwind v4 `@theme`.
Components use the semantic tokens only, never raw colours.

### 3.1 Colour

Neutrals are a cool, nearly achromatic grey (hue 255). One accent: **fern** (hue 168), a calm
teal-green that reads as focus and growth. No purple, no gradients in the app UI.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `oklch(0.985 0.002 255)` | `oklch(0.165 0.006 255)` | app background |
| `--surface` | `oklch(0.997 0.001 255)` | `oklch(0.195 0.007 255)` | panels, cards, inputs, sidebar |
| `--surface-2` | `oklch(0.968 0.003 255)` | `oklch(0.228 0.008 255)` | hover fill, segmented track, code bg |
| `--surface-3` | `oklch(0.94 0.004 255)` | `oklch(0.265 0.009 255)` | selected neutral, progress track |
| `--border` | `oklch(0.915 0.004 255)` | `oklch(0.29 0.008 255)` | hairlines |
| `--border-strong` | `oklch(0.85 0.006 255)` | `oklch(0.37 0.01 255)` | inputs, hover borders |
| `--fg` | `oklch(0.22 0.012 255)` | `oklch(0.95 0.004 255)` | primary text |
| `--fg-2` | `oklch(0.43 0.012 255)` | `oklch(0.77 0.008 255)` | secondary text |
| `--fg-3` | `oklch(0.56 0.01 255)` | `oklch(0.63 0.008 255)` | meta, placeholders (never body copy) |
| `--accent` | `oklch(0.52 0.11 168)` | `oklch(0.74 0.12 168)` | primary buttons, links, focus, correct |
| `--accent-hover` | `oklch(0.47 0.11 168)` | `oklch(0.79 0.12 168)` | |
| `--accent-fg` | `oklch(0.99 0.01 168)` | `oklch(0.18 0.03 168)` | text on accent |
| `--accent-soft` | `oklch(0.955 0.03 168)` | `oklch(0.27 0.045 168)` | tinted backgrounds |
| `--accent-soft-fg` | `oklch(0.38 0.09 168)` | `oklch(0.86 0.09 168)` | text on accent-soft |
| `--warning` | `oklch(0.74 0.14 72)` | `oklch(0.8 0.13 75)` | due, low mastery, timer < 5 min |
| `--warning-soft` | `oklch(0.965 0.04 85)` | `oklch(0.29 0.05 75)` | |
| `--warning-soft-fg` | `oklch(0.45 0.1 60)` | `oklch(0.88 0.1 80)` | |
| `--danger` | `oklch(0.56 0.19 27)` | `oklch(0.68 0.17 25)` | destructive, wrong, failed |
| `--danger-soft` | `oklch(0.962 0.025 25)` | `oklch(0.28 0.06 25)` | |
| `--danger-soft-fg` | `oklch(0.45 0.16 27)` | `oklch(0.87 0.08 25)` | |

Rules
- Correct answers, completed states and mastery use the accent. There is no separate green.
- Warning is for time pressure, due reviews and low mastery only. Danger is for errors,
  wrong answers and destructive actions only.
- Info is neutral (surface-2 background, fg-2 text). No blue.
- Never pure black or pure white. Check every text/background pair for WCAG AA (4.5:1 body,
  3:1 for 18px+ and UI glyphs). `--fg-3` is only for meta and placeholders.
- Theme: system preference by default, user can pick Light / Dark / System (next-themes, class
  strategy on `<html>`). Both themes are designed and tested.

### 3.2 Typography

Font: **Geist Sans** and **Geist Mono** (the `geist` npm package, `geist/font/sans` and
`geist/font/mono`, exposed as `--font-sans` / `--font-mono`). Enable `font-feature-settings:
"ss01", "cv11"` only if they look right; use `tabular-nums` for every number that updates or is
compared (scores, timers, counts).

| Style | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| display-xl | 52 / 56 | 600 | -0.025em | landing hero only |
| display | 36 / 42 | 600 | -0.02em | landing sections, exam score |
| title | 26 / 32 | 600 | -0.015em | page titles (h1) |
| heading | 18 / 26 | 600 | -0.01em | section headings (h2) |
| subheading | 15 / 22 | 600 | 0 | card titles, h3 |
| body | 14 / 22 | 400 | 0 | default UI text |
| body-strong | 14 / 22 | 500 | 0 | emphasised UI text, button labels |
| small | 13 / 20 | 400 | 0 | secondary text, table cells |
| caption | 12 / 16 | 500 | 0.01em | meta, badges, labels |
| reading | 17 / 29 | 400 | 0 | notes, examples, chat answers, explanations |
| reading-h2 | 23 / 31 | 600 | -0.012em | headings inside notes |
| reading-h3 | 19 / 28 | 600 | -0.005em | |
| mono | 13.5 / 22 | 400 | 0 | code, kbd |

Reading measure: `max-width: 68ch`. Paragraph spacing 0.9em, list item spacing 0.35em, headings
get 1.8em space above, 0.6em below. Inline code: mono, surface-2 background, radius 4, padding
1px 5px. Code blocks: surface-2 background, border, radius 8, padding 14px 16px, horizontal
scroll, language label top right in caption fg-3, copy button on hover. KaTeX display math is
centred with 1em vertical margin and scrolls horizontally on overflow, never overflows the
column.

Uppercase tracking labels ("eyebrows") are not used in the app. Sections are named by plain
headings.

### 3.3 Space, shape, depth

- 4px grid. Common steps: 4, 8, 12, 16, 20, 24, 32, 48, 64.
- Page padding: 32px desktop, 24px tablet, 16px mobile. Max content width 1120px. Reading pages:
  one 720px column plus an optional 220px right rail.
- Radius (shape lock): 6px for chips, kbd and small controls; **8px for buttons and inputs**;
  **12px for cards, panels, dialogs, popovers**; full for avatars, rings, status dots and the
  voice orb. Nothing else.
- Depth: cards and panels use a 1px border and no shadow. Shadows exist only for things that
  float: popover, dropdown, dialog, sheet, toast, command palette:
  `0 1px 2px oklch(0.2 0.02 255 / 0.06), 0 12px 32px -12px oklch(0.2 0.02 255 / 0.22)`
  (dark: same with higher alpha and a 1px `--border` outline).
- Clickable cards: hover changes border to `--border-strong` and background to a 40% mix toward
  `--surface-2`. Press: `scale(0.995)`.

### 3.4 Motion

- Durations: 120ms (hover, press), 180ms (popover, dropdown, tooltip), 240ms (sheet, dialog).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` for entering, `cubic-bezier(0.4, 0, 1, 1)` for leaving.
- Animate opacity and transform only. Buttons press to `scale(0.98)`.
- Allowed motion: overlays entering, progress bars, skeleton shimmer, the voice orb, streaming
  text caret, quiz/exam question transitions (12px slide + fade), success check draw.
- Everything collapses to instant under `prefers-reduced-motion: reduce`.
- No animation library is needed; use CSS (tailwind transitions, keyframes, `tw-animate-css`
  style utilities written by hand). Do not add Motion/GSAP.

### 3.5 Icons and brand

- **Phosphor Icons** (`@phosphor-icons/react`, import from `@phosphor-icons/react/dist/ssr` in
  server components), weight `regular`, 16px in buttons and lists, 18px in navigation, 20px in
  empty states. Use `fill` weight only for the active nav item and the brand glyph. No other
  icon library, no hand-drawn SVG icons.
- Brand: a 24px tile, radius 7px, `--accent` background, Phosphor `BookOpenText` (fill weight,
  14px, `--accent-fg`) centred, followed by the wordmark "Margins" in 15px/600, tracking
  -0.01em. The name lives in one constant `BRAND_NAME` in `src/config/brand.ts`.

### 3.6 Z-index scale (`src/config/layers.ts`)

base 0, sticky 10, sidebar 20, topbar 30, dropdown 40, overlay 50, modal 60, toast 70.

---

## 4. Component library (`src/components/ui`)

Built on Radix primitives where behaviour is non-trivial (dialog, popover, dropdown menu,
tooltip, hover card, select, checkbox, radio group, slider, scroll area is not needed).
Every component supports light and dark, keyboard use, and visible `:focus-visible` rings
(2px `--accent`, 2px offset, radius matches the element).

| Component | Spec |
|---|---|
| **Button** | Variants: `primary` (accent bg, accent-fg), `secondary` (surface bg, border-strong border, fg), `ghost` (transparent, hover surface-2), `danger` (danger bg, white-ish fg), `link` (accent text, underline on hover). Sizes: `sm` 28px h, 10px x-pad, 13px text; `md` 34px, 14px pad, 14px; `lg` 40px, 18px pad, 15px. Optional leading icon (16px, gap 6px), trailing kbd hint. `loading` prop: spinner replaces the leading icon, label stays, width does not change, button disabled. Icon-only variant is square with an `aria-label` and a tooltip. Labels are verbs, max 3 words, never wrap. |
| **Input / Textarea** | 34px height (textarea auto-grows, min 3 rows), surface bg, 1px border-strong, radius 8, 14px text, placeholder fg-3. Focus: border accent + ring. Error: border danger. Disabled: surface-2, fg-3. Optional leading icon and trailing slot (unit, kbd, clear button). |
| **Field** | Label above (13px/500, fg), optional hint below input (12px fg-3), error below input (12px danger-soft-fg with a WarningCircle icon), `gap 6px`. Required fields are not starred; optional ones say "(optional)" in fg-3. |
| **Select** | Radix select styled like Input with a CaretUpDown icon. |
| **SegmentedControl** | Track surface-2, radius 8, padding 2px; items 30px h, 12px x-pad, 13px/500; selected item: surface bg, fg, 1px border, tiny shadow `0 1px 1px oklch(0.2 0.02 255 / 0.06)`. Arrow-key navigation (radiogroup semantics). |
| **Tabs (underline)** | Used for the topic study path and settings. 40px tall row, items 14px/500 fg-2, active fg with 2px accent underline flush to the row's bottom border; each tab may carry a trailing status glyph (see topic page). Horizontal scroll with fade edges on mobile. Implemented as links (`aria-current="page"`) when they change the URL. |
| **Badge** | 20px tall, radius 6, 12px/500, 6px x-pad. Tones: neutral (surface-2 / fg-2), accent (accent-soft / accent-soft-fg), warning, danger. Optional 12px icon. |
| **Card** | surface bg, 1px border, radius 12, padding 20 (compact 16). `interactive` variant per 3.3. No shadow. Use only where grouping needs a boundary; otherwise separate with spacing or a hairline. |
| **Dialog** | Centered, widths 440 (sm) / 560 (md) / 720 (lg), radius 12, overlay `oklch(0.2 0.01 255 / 0.4)` with 2px backdrop blur, title (heading) + description (small fg-2), footer right-aligned buttons, Escape closes, focus trapped and returned. |
| **ConfirmDialog** | Dialog sm with title, one-sentence consequence, `Cancel` (secondary) and the action (danger for destructive, label names the action: "Delete course", never "OK"). |
| **Sheet** | Right side, 440px (chat drawer, filters), full height, same shadow; on mobile becomes a bottom sheet (max 85vh, drag handle, radius 12 on top). |
| **Popover / DropdownMenu** | radius 12, padding 4, items 32px tall, 13.5px, icon 16, hover/focus surface-2, destructive items danger text, separators hairline, kbd hints right aligned. |
| **Tooltip** | 400ms delay, small text, fg on inverse surface (dark chip in light theme), radius 6, only for icon buttons and truncated text. |
| **HoverCard** | Citations: 340px wide, radius 12, opens on hover (300ms) and on focus/click (touch). |
| **Toast** (sonner) | Bottom right (bottom centre on mobile), max 3, 4s, for transient confirmations and failures of background actions ("Course renamed", "Couldn't delete the file. Try again."). Never for form validation. |
| **Progress** | Linear 4px bar, radius full, track surface-3, fill accent. `indeterminate` shows a moving 30% segment. Used for jobs and quiz/exam completion. |
| **ProgressRing** | Sizes 16 / 28 / 44 / 96. Track surface-3, arc accent, stroke 2/3/4/7. Optional centre label (tabular). Used for mastery and scores. Empty data: dashed track, no arc. |
| **MasteryIndicator** | ProgressRing 16 + label (caption fg-2), or ring only in dense lists with a tooltip "Getting there, 62%". |
| **Skeleton** | surface-2 blocks matching the final layout, radius matching the element, subtle shimmer (disabled under reduced motion). |
| **EmptyState** | 40px tile (radius 12, surface-2, 20px icon fg-2), title (subheading), one or two lines of fg-2 small text (max 52ch), one primary action, optional secondary link. Centred in its container, 48px vertical padding. |
| **InlineAlert** | Full width, radius 8, 12px 14px padding, tone backgrounds (neutral/warning/danger/accent soft), 16px icon, title (body-strong) + text (small), optional action button on the right. |
| **Kbd** | Mono 11.5px, 18px h, radius 5, 1px border, surface-2 bg. |
| **JobStatus** | The one way to show a background job. Row: 16px spinner (or icon for done/failed) + stage text (body-strong) + elapsed time (caption fg-3, tabular) + optional Progress below. Stage words: `validating` "Checking the file", `chunking` "Reading pages", `embedding` "Indexing for search", `extracting` "Finding topics", `generating` "Writing", `saving` "Saving", `grading` "Grading answers", pending "Waiting to start". Failed: danger icon + `describeJobFailure()` text + "Try again" when retryable. Timeout of the poller: neutral text "Still working in the background. You can leave this page." Uses `aria-live="polite"`. |
| **QuestionRenderer** | Shared by quiz, mock exam and practice. See 6.7. |
| **Markdown** | Shared renderer for notes, examples, explanations, chat answers (lazy loaded: react-markdown, remark-gfm, remark-math, rehype-katex, rehype-highlight with a curated set of languages: python, javascript, typescript, java, c, cpp, sql, bash, json, go, rust, latex). `variant="reading"` (17px) or `"compact"` (14px, for cards and feedback). `MarkdownInline` for question text. Applies `formatLearningMarkdown` first for notes. Headings get ids for the outline. Does not know about chat citations: chat passes a `renderCitation` prop. |

All primitives live in `src/components/ui/*.tsx`, one per file, with a `src/components/ui/README.md`
listing them. Feature components live in `src/features/<area>/*`.

---

## 5. App structure

### 5.1 Routes

| Route | Page | Notes |
|---|---|---|
| `/` | Landing | Public. Signed-in users see "Open Margins" in the nav instead of sign in; no forced redirect. |
| `/login`, `/signup` | Auth | Redirect to `/home` (or `?next=`) when already signed in. |
| `/home` | Home | All courses, continue card, due reviews. |
| `/courses/new` | Create course | |
| `/courses/[courseId]` | Course overview | Setup guide until the course is active, then "Today". |
| `/courses/[courseId]/plan` | Plan | The study plan by week; today highlighted. |
| `/courses/[courseId]/materials` | Materials | Upload + list. |
| `/courses/[courseId]/topics` | Topics | List, or the topic editor while topics are unconfirmed (`?edit=1` forces the editor). |
| `/courses/[courseId]/topics/[topicId]` | Topic | `?view=notes|examples|practice|quiz|voice` (default: first incomplete view, or notes). |
| `/courses/[courseId]/ask` | Ask | `?thread=<id>`, `?topic=<id>` preselects scope. |
| `/courses/[courseId]/exams` | Mock exams list | |
| `/courses/[courseId]/exams/new` | Create mock exam | |
| `/courses/[courseId]/exams/[examId]` | Exam lobby | Start/resume, attempt history. |
| `/courses/[courseId]/exams/[examId]/take` | Taking the exam | Focus layout (no sidebar). |
| `/courses/[courseId]/exams/[examId]/results/[submissionId]` | Results | |
| `/courses/[courseId]/review` | Review | Topics due (Retry what you missed, New questions), coming up, and a link to voice practice. |
| `/courses/[courseId]/review/voice` | Voice practice | Focus screen for the weakest-topics voice session. Topic voice practice lives in the topic page. |
| `/courses/[courseId]/settings` | Course settings | Rename, description, exam date, daily time, delete. |

Old URLs redirect permanently in `next.config.js`: `/dashboard` to `/home`,
`/projects/:id` to `/courses/:id`, `/projects/:id/:rest*` to `/courses/:id/:rest*` where the
page exists, `/exams/:examId` to a small server route that looks up the course and redirects.

### 5.2 Layouts

**Marketing layout** (`(marketing)`): top nav 64px, content, footer.

**Auth layout** (`(auth)`): two columns on desktop: left 480px column with the form vertically
centred (brand at top-left, form max 360px wide); right column fills the rest with a large
real product screenshot (the topic notes page) on a surface-2 panel inset 16px with radius 12.
Mobile: form only.

**App layout** (`(app)`), signed-in only (server redirect to `/login?next=`):

```
+------------------+---------------------------------------------------------+
| [brand]          |  Course / Topics / Graph traversal        [actions]    | 56px topbar, sticky
| [course switcher]|---------------------------------------------------------|
|                  |                                                         |
|  Overview        |                     page content                        |
|  Topics          |               (max 1120, padded 32)                     |
|  Materials       |                                                         |
|  Ask             |                                                         |
|  Mock exams      |                                                         |
|  Voice practice    |                                                         |
|                  |                                                         |
|  TOPICS          |                                                         |
|  o Sorting       |                                                         |
|  o Graph trav.   |                                                         |
|  ...             |                                                         |
|                  |                                                         |
|  [Search  Ctrl K]|                                                         |
|  [avatar  name v]|                                                         |
+------------------+---------------------------------------------------------+
   248px sidebar
```

Sidebar (surface bg, right hairline, full height, sticky):
- Top (56px row, aligned with the topbar): brand.
- Course switcher: a button showing the current course name (truncate) with CaretUpDown. Opens a
  dropdown: courses (most recent first, check on current), separator, "All courses" (to /home),
  "New course". Outside a course it shows "All courses" selected.
- Primary nav (inside a course): Overview (House), Topics (ListBullets), Materials (Files), Ask
  (ChatCircleText), Mock exams (Exam), Voice practice (Microphone). Items 34px, radius 8, 14px/500,
  icon 18 fg-3; active item surface-2 bg, fg text, icon fill weight in accent. Badges on the
  right only for real counts: Topics shows a warning dot when topics need review; Overview shows
  the number of due reviews.
- Topics section (only inside an active course): plain heading "Topics" in caption fg-3 (sentence
  case, not uppercase), then a scrollable list of topic links (32px rows, 13.5px, MasteryIndicator
  16 ring on the left, name truncated, current topic highlighted like a nav item). Shows all
  topics; scrolls independently. **Units:** a course with units lists them as disclosure buttons
  (32px, 13.5px/500: CaretDown 12 that turns to point right when closed, unit title truncated, the
  unit's mastery ring 16 on the right; the week label is read by screen readers and shown in the
  tooltip, not in the row), each controlling a list of its topics indented under a 1px `--border`
  rule (margin-left 15px). `aria-expanded` and `aria-controls` on the button; Enter and Space
  toggle. The student's open and closed choices are kept per course in localStorage
  (`margins:sidebar-units:<courseId>`, unit id -> boolean); a unit without a choice is open when it
  holds the current topic, or, away from a topic, when it is the first with unfinished work. Opening
  a topic opens its unit. Topics with no unit follow the units as plain rows (no header). A flat
  course is the plain list above.
- Bottom: "Search" row with Ctrl K / Cmd K kbd (opens the command palette), then the account row:
  avatar circle with initials (accent-soft bg) + name + chevron; menu: email (caption, not
  clickable), Theme (submenu System / Light / Dark with check), separator, Sign out.
- Collapsible to a 64px icon rail via a button in the topbar (state persisted in localStorage);
  in the rail, labels become tooltips and the topics section hides.
- Mobile (< 1024px): sidebar hidden; topbar shows a menu button that opens the sidebar as a left
  sheet (same content). Inside a course a **bottom tab bar** (56px plus the safe area, 5 equal targets, all
  at least 44px) holds Overview (with the due count), Plan, Topics, Ask and **More**; More is a bottom
  sheet with Review (due count), Mock exams, Materials, Course settings and "All courses and topics"
  (the left sheet). Pages leave room for it (`--tabbar-height`, set by the bar). Below 640px the top bar
  shows two lines instead of crumbs: the course and, on a topic, its unit (with the week) in small grey
  type, then the page name, each cut only at its end. The sidebar's "Topics" label is a labelled group,
  not a heading, so the first heading in the page is its h1.

Topbar (56px, canvas bg with 80% opacity + backdrop blur when scrolled, bottom hairline only
when scrolled): breadcrumbs (fg-3 for ancestors, fg for current, `/` separators in fg-3, each
ancestor a link, truncate middle crumbs on small screens), right side: page actions (max one
primary button + one secondary + overflow menu), the background-generation indicator (see 6.3).

**Focus layout** (exam taking, voice session full screen on mobile): no sidebar; a 56px top bar
with "Exit" (or the exam name), the key status (timer) centred or right, and the primary action.

### 5.3 Command palette (cmdk)

Ctrl K / Cmd K anywhere in the app, also the sidebar Search row. 600px wide dialog at 20vh from
the top, input 48px, results grouped: "Topics" (current course first, then others with course
name in fg-3), "Courses", "Actions" (New course, Upload materials, Ask a question, New mock
exam, Start voice practice, Toggle theme, Sign out). Arrow keys, Enter, Escape. Recent items when
empty. Data comes from a server-provided list in the app layout (courses + topics, ids and names
only) so it opens instantly.

### 5.4 Shortcuts

- Ctrl/Cmd K: palette. `?` opens a shortcuts dialog.
- Topic page: `1`-`5` switch views (Notes, Examples, Practice, Quiz, Voice), `[` and `]` previous /
  next topic.
- Quiz and exam: `1`-`4` or `A`-`D` pick options, `T`/`F` for true/false, Enter = next (or check),
  Left/Right arrows = previous/next question, `S` focuses the short-answer box.
- Ask: Enter sends, Shift+Enter newline, Escape stops a streaming answer.

---

## 6. Screens

Each screen lists layout, content, states (loading, empty, error) and behaviour. Every route has
a `loading.tsx` skeleton matching its layout and an `error.tsx` with a retry button.

### 6.1 Landing (`/`)

Light/dark aware, same tokens. Sections (each a different layout family):
1. **Nav**: brand left; right: "Sign in" (ghost) and "Get started" (primary). Signed in: "Open
   Margins" (primary) only.
2. **Hero**, split 5/7: left: headline "Turn your course files into a study plan." (title is
   display-xl, max 2 lines), subtext (max 20 words): "Upload lecture notes and past exams.
   Margins builds notes, practice, quizzes and mock exams from them." CTAs: "Get started"
   (primary lg) and "Sign in" (secondary lg). Right: real screenshot of the topic notes page
   (light theme in light mode, dark in dark mode; `next/image`, priority) in a frame: radius 12,
   border, the float shadow, slightly cropped by the viewport edge on the right. No pills over it.
3. **How it works**: a vertical list of three rows, each: a verb heading ("Upload your
   materials", "Check the topics", "Study, practise, test"), one sentence, and a small cropped
   screenshot on alternating sides only for the middle row (no zigzag of three).
4. **What you get**: bento grid with exactly 5 cells: Notes with sources (large, screenshot),
   Practice that checks each step (screenshot), Quizzes graded with feedback (screenshot), Mock
   exams with a real timer (accent-soft tile with a large timer number rendered in Geist Mono),
   Ask your materials, with citations (screenshot of an answer with a citation hover card).
   Cell copy: heading + one sentence.
5. **Voice practice**: full-width band (surface-2) with the voice orb illustration (CSS, not an
   image) and one paragraph: practise explaining concepts out loud.
6. **Privacy line**: "Your files stay in your account. Delete a course and its files go with
   it." (small, centred, fg-2).
7. **Final CTA**: heading "Start with one course." + "Get started" button.
8. **Footer**: brand, GitHub link, "Made for students" style line is not used; keep it to the
   brand, links (Sign in, GitHub) and year.

Screenshots are produced from the real app with demo data (light and dark), saved under
`public/screens/`. Use `next/image` with explicit sizes.

### 6.2 Sign in / Sign up

Auth layout. Sign in: heading "Welcome back" (title), subtext "Sign in to continue studying."
Google button (only when `getProviders()` includes google): secondary lg full width with the
Google "G" logo from Simple Icons (`https://cdn.simpleicons.org/google`, or an inline copy of
that SVG; this is the one brand logo allowed), divider "or" (caption fg-3 between hairlines),
fields Email, Password (with show/hide toggle), primary lg "Sign in" full width, link row "New
here? Create an account". Errors: inline InlineAlert (danger) above the button: "That email and
password don't match." Google errors from `?error=` mapped via `GOOGLE_SIGN_IN_ERRORS`.

Sign up: heading "Create your account", subtext "Free, and it takes a minute." Fields Name
(optional), Email, Password (hint "At least 8 characters"; live check mark when met). No confirm
password field (use show/hide instead). Button "Create account". After success sign in and go to
`/courses/new?welcome=1`. Errors: 409 shows "An account with this email already exists. Sign in
instead?" with a link.

### 6.3 Home (`/home`)

```
Good evening, Harish                                         [ New course ]
Here's where you left off.

+-------------------------------------------------------------------------+
| Continue   CS 161 Algorithms                                            |
| Study Graph traversal                                    [ Continue -> ]|
| You haven't opened the notes yet. About 15 min.                         |
+-------------------------------------------------------------------------+

Due for review (3)                                             (only if any)
 o Dynamic programming     CS 161 Algorithms        Due today    [Review]
 o Hashing                 CS 161 Algorithms        Overdue 2d   [Review]

Courses
+----------------------+ +----------------------+ +----------------------+
| CS 161 Algorithms    | | Organic Chemistry    | |  + New course        |
| 12 topics, 4 strong  | | Setting up           | |                      |
| [mastery strip]      | | Upload materials     | |                      |
| Updated 2h ago       | |                      | |                      |
+----------------------+ +----------------------+ +----------------------+
```

- Greeting by local time ("Good morning/afternoon/evening", first name from session; no name:
  "Welcome back").
- Continue card (accent-soft left border 3px, surface bg): the top Up next action of the most
  recently updated course (server calls the same logic as the next-actions route through a lib
  function, no client fetch). Hidden when there are no courses.
- Due for review: topics across courses with `ReviewSchedule.dueAt <= end of today`, max 5 rows,
  then a plain "and N more" line. Each row links to the topic's quiz view.
- Courses grid: 3 columns desktop, 2 tablet, 1 mobile. Card (interactive): name (subheading),
  status line (small fg-2): active: "12 topics, 4 strong"; setup: the current setup step
  ("Upload materials", "Review topics"). **Mastery strip**: a row of small 8px squares (radius 2),
  one per topic, coloured by mastery level (surface-3 not started, warning learning, accent 50%
  getting there, accent strong); max 40 squares then "+N". Footer: "Updated 2h ago" caption fg-3.
  The last card is a dashed-border "New course" tile.
- Empty (no courses): EmptyState centred in the page: icon BookOpenText, title "Add your first
  course", text "Upload lecture notes, past exams or chapters. Margins turns them into notes,
  practice and quizzes.", primary "Add a course".

### 6.4 Create course (`/courses/new`)

Centred column 520px. Title "New course". Fields: Course name (placeholder "e.g. CS 161
Algorithms"), Description (optional, textarea 2 rows, hint "What are you preparing for?"), Exam date
(optional, a date Input) and Time to study each day (Select, default 45 minutes). Primary "Create course", secondary "Cancel". With `?welcome=1` the title is "Let's set up your
first course" and a one-line explainer sits under it. On success go to `/courses/[id]` (the setup
guide).

### 6.5 Course overview (`/courses/[courseId]`)

**While setting up** (status `setup` or `topics_pending`, or no confirmed topics): the Setup guide.

```
CS 161 Algorithms
Three steps and you're ready to study.

(1) Add your materials                                        [done check]
    3 files ready. Add more any time in Materials.
(2) Check the topics                                           <- current
    We found 12 topics in your files. Rename, merge or remove any,
    then confirm.                                 [ Review topics ]
(3) Start studying                                               muted
    Notes, worked examples, practice and a quiz for each topic, written as you go.
```

- Vertical stepper: number circle (28px; done = accent with check, current = accent ring, upcoming
  = border), title (subheading), description (small fg-2), and the current step expanded with its
  content:
  - Step 1 current: the Uploader component inline (same as Materials, 6.6) with the file list
    below it. When at least one file is ready and topic finding has started, the step collapses
    to done automatically.
  - Between 1 and 2: if an `extract_topics` job is active, step 2 shows JobStatus "Finding
    topics" (resumes after refresh via GET /api/jobs?active=1). If materials are still
    processing, step 2 says "Waiting for your files to finish processing." If extraction never
    started (no active job, no topics, all files ready), show "Find topics" primary button
    (POST extract-topics).
  - Step 2 current: count + "Review topics" button (to `/topics?edit=1`).
  - Step 3 current (topics confirmed, no content yet): a "Start <first topic>" primary link to the
    first topic, caption "The notes are written when you open a topic, which takes about a
    minute." There is no bulk build button: opening the topic starts its notes (and the AI service
    then queues the rest). While content is being written the step shows the aggregate "Writing
    content, 1 of 4 ready" with a Progress bar. When the first notes exist the course flips to the
    Today view.
- If the course is active but some content is missing, Up next says "Start <topic>" (the first
  topic that is not finished) and the notes are written when it is opened. The only bulk action is
  "Prepare all topics now" in the course "..." menu (see below).

**Active course: Today view**

```
CS 161 Algorithms                                  [ Ask ]  [ Mock exam ]  [...]
12 topics  .  4 strong  .  2 due for review

+---------------------------------------------+  +--------------------------+
| Up next                                     |  | Course mastery           |
| Review Dynamic programming                  |  |   (ring 96: 38%)          |
| Due today. Your last quiz was 55%.          |  |   Strong 4  Getting 3     |
|                                [ Start -> ] |  |   Learning 2  Not st. 3   |
| Then                                        |  +--------------------------+
|  Study Graph traversal         15 min   ->  |
|  Take the Sorting quiz         10 min   ->  |
|  Voice practice: Hashing          8 min   ->  |
+---------------------------------------------+

Topics                                                       [ View all ]
+------------+ +------------+ +------------+ +------------+
| (ring) 82% | | (ring) 61% | | (ring) --  | | ...        |
| Sorting    | | Graph trav.| | Hashing    | |            |
| Strong     | | Due today  | | Not started| |            |
+------------+ +------------+ +------------+ +------------+

Recent mock exams                          Building content (only while jobs run)
 Mock exam, Oct 20   72%   [Results]      JobStatus aggregate + failures list
 [ New mock exam ]
```

- Header meta line is plain text with commas: "12 topics, 4 strong, 2 due for review". (The dots
  in these wireframes are only sketch separators; meta rows never use middle dots. Separate
  meta items with commas or 16px gaps.)
- Up next card: **today's items from the study plan** (section 6.13), not a separate planner. The
  first item still to do is large (title heading, reason small fg-2, "Part 1 of 2" and ETA caption,
  primary button with the verb: "Start", "Continue", "Take quiz", "Review", "Create"). Below, up to
  3 more of today's items as compact rows (title, ETA, arrow), each a link; a caption says how many
  are done today and how long is left. The heading stays "Up next". "See the plan" is a quiet link in
  the card's top right. When today is clear the card says "You're done for today" (or "Nothing planned
  for today") and names the next day's first item ("Next: Quiz: Sorting, Thu, Oct 22."); with nothing
  planned at all it offers "New mock exam". When the plan is short on time the card ends with a
  warning InlineAlert (title "Time is short", the plan's sentence, "See the plan"). Item routing:
  learn -> the topic ("Continue" once started); quiz -> the topic's quiz; review -> `/review#review-<topic>`;
  unit mock / full mock -> the new exam form with the topics ticked. Data: `getPlanData`, rendered on
  the server in the student's time zone; refreshed with `router.refresh()` on window focus.
- "When is your exam?" line (below Up next and the mastery card, never above; only while the course has
  no exam date and the line was not dismissed): one slim row with a sentence ("No exam date yet. Add one
  and Margins plans your days up to it, and tells you if time is short."), a date Input labelled "Exam
  date", "Save date" (secondary) and "Not now" (ghost). A date given when the course was made means it
  never shows. Saving or dismissing hides it at once and stores the choice on the course (it stays
  closed on every device). The overview has one primary button: the one on Up next.
- Course mastery card: big ProgressRing (mean mastery over all topics, not-started ones counting
  as 0; label "Course mastery"), and the four mastery buckets as a 2x2 list with counts.
- Topic tiles: 4 columns desktop (2 mobile), interactive cards: ring 28 + percent, name (2 lines
  max), status caption ("Strong", "Due today" in warning-soft-fg, "Not started"). Max 8, "View
  all" link.
- Recent mock exams: last 3 submissions with score badges; "New mock exam" secondary button;
  empty: one line "Take a timed mock exam when you feel ready." + button.
- Building content panel: only while generate jobs are active or failures exist: aggregate
  progress and the failures list ("Notes for Hashing couldn't be written. The AI service was busy.
  [Try again]").

### 6.6 Materials (`/courses/[courseId]/materials`)

```
Materials                                                     [ Upload ]
Lecture notes, past exams and book chapters for this course.

+-------------------------------------------------------------------------+
|  [UploadSimple]  Drop files here or [browse]                            |
|  PDF, DOCX, PPTX or DOC, up to 25 MB each.                              |
|  These are:  ( Lecture notes | Past exams | Book chapters )             |
+-------------------------------------------------------------------------+

Name                          Type            Size     Status
week1-sorting.pdf             Lecture notes   1.2 MB   (check) Ready              [...]
week2-graphs.pdf              Lecture notes   2.4 MB   (spin) Reading pages  40%  [...]
midterm-2025.pdf              Past exams      640 KB   (x) Not usable: scanned images
```

- Uploader: dashed border-strong, radius 12, 120px tall, surface bg; drag over: accent border +
  accent-soft bg. The category SegmentedControl applies to the next files added. Multiple files.
  Client validation (extension, size against `maxUploadMb` passed from the server page).
- List as a table on desktop (rows 48px, hairline between rows only, no outer box border; name
  with a file-type icon FilePdf/FileDoc/FilePpt), stacked rows on mobile. Status cell shows the
  pipeline: Uploading (with % from XHR), Checking the file, Reading pages, Indexing, Ready,
  Not usable (danger text, reason from validationNotes, full reason in a tooltip), Failed (with
  "Remove and upload again" hint). Row menu: Open (opens `/api/materials/[id]/file` in a new tab),
  Use as (submenu of radio items Content / Syllabus / Past exam / Other, the current one checked;
  `PATCH /api/materials/[id] { role }`), Delete (ConfirmDialog "Delete week1-sorting.pdf? Topics
  built from it keep their content.").
- **Role badge** ("Used as" column on desktop; on mobile it follows "Lecture notes, 1.2 MB" in the
  row's second line): a Badge with the role word, neutral for Content and Other, accent for
  Syllabus and Past exam. The word carries the meaning, the tone only supports it. Changing the
  role shows at once and a toast says what follows: a syllabus or past exam stops being a topic
  source ("Marked as syllabus. Topics no longer use it. Find topics again to update them."), a
  content or other file is placed by "Find topics again". The upload category control has a fourth
  option, "Syllabus or schedule"; it wraps inside the 390px width.
- Live updates: rows with `validationStatus=pending` poll their jobs (resume via GET
  /api/jobs?active=1&types=validate_material,chunk_material and the chunking-job route); when a
  row turns Ready, `router.refresh()`.
- Banner below the uploader when relevant: "Finding topics in your files..." (JobStatus) or, when
  all files are ready and topics exist but are unconfirmed: InlineAlert accent "12 topics found.
  [Review topics]".
- Empty: the uploader alone with EmptyState text under it: "No materials yet. Start with your
  lecture notes, then add past exams if you have them."

### 6.7 Topics (`/courses/[courseId]/topics`)

A topic that appears on the student's past exams carries a small accent Badge "On past exams" after
its name in the list (the plan teaches these first when time is short).

**Editor mode** (any unconfirmed topic, or `?edit=1`):

```
Check the topics                                  [ Find again ]  [ Add topic ]
We found these in your materials. Rename, merge or remove any. You can change them later.

 :: 1  Sorting algorithms          [quicksort] [merge sort] [+3]        [...]
 :: 2  Graph traversal             [BFS] [DFS] [+2]                      [...]
 ...
 [ + Add a topic ............................................ ]

----------------------------------------------------------------------- sticky
 12 topics                                         [ Confirm topics -> ]
```

- Each row: drag handle (DotsSixVertical, keyboard: focus handle + Up/Down arrows to move),
  number (fg-3, tabular), name (click to edit inline: becomes an Input, Enter saves, Escape
  cancels), description (small fg-2, one line, edit in the same inline editor), keyword chips (max
  3 + "+N" with tooltip). Row menu: Rename, Merge into... (submenu listing other topics, then a
  ConfirmDialog "Merge Hashing into Hash tables? Content and quiz history move to Hash tables."),
  Move up/down, Delete (confirm).
- Reorder calls PATCH orderIndex; optimistic, toast on failure and revert.
- "Find again" (re-extract) asks first: "Find topics again? Topics you already confirmed stay."
- Sticky footer bar (surface, top hairline): count + primary "Confirm topics". After confirming:
  go to the course overview (setup step 3 becomes current).
- While extraction runs: JobStatus in place of the list with skeleton rows.

**Units.** A course planned into units shows them in both modes; a flat course (no units) is
exactly the single list described here.

- *Editor:* each unit is a group: a title row (heading 18/26, week label Badge, "3 topics" in small
  fg-3 tabular, and a `...` menu with Edit unit, Move unit up / down, Delete unit; Delete is
  disabled while the unit has topics and the menu says "Move or delete its topics first."), then
  its rows. Topics that belong to no unit come last under a plain "Topics" heading, only when the
  course has units. An empty unit shows one line, "No topics in this unit yet. Move one here from
  its menu, or add a topic below." Row numbers run across the whole course. Reordering (handle with
  Up and Down, drag, or Move up / down) works inside a unit; moving to another unit is the row
  menu's "Move to unit..." which opens a small dialog with a Select of the units plus "No unit"
  (the topic lands last in that unit). "Merge into..." lists the other topics under their unit
  names. Under the description each row shows the files the topic is taught from, read-only, as
  small fg-3 text with a file icon ("algorithms.pdf, pp. 1-2"). Header actions: Find again, Add
  unit (dialog: Title, Week (optional)), Add topic. The add-topic field has a unit Select beside
  it (the last unit by default; stacked under the field on mobile). The footer reads "5 topics in
  2 units".
- *List:* a section per unit (`region` named by the unit): heading 18/26 with the week label Badge,
  "2 topics", and on the right the unit's mastery (MasteryIndicator with percent; mean over all the
  unit's topics, not-started counting as 0); the unit summary under it in small fg-2 when present;
  then the list of rows, `aria-label="Topics in <unit>"`. Sections are 32px apart. The topics with
  no unit follow under a "Topics" heading. "Needs work" is one flat list across units.

**List mode** (all confirmed):

```
Topics                                [ Edit topics ]
12 topics, 4 strong, 2 due for review

  Sorting algorithms        (n)(e)(p)(q 82%)   Strong        Reviewed 3d ago
  Graph traversal           (n)(e)( )( )       Getting there Due today
  ...
```

- Rows (56px): ring 28 + name (body-strong) + one-line description (small fg-2) on the left;
  in the middle the **study path glyphs**: four small 20px circles for Notes, Examples, Practice,
  Quiz: filled accent with a check when completed (progress flags), accent ring when content
  exists but not completed, dashed border when content is missing; quiz shows best score text
  instead of a check when there is one; on the right the mastery label and review timing ("Due
  today" in warning-soft-fg, "Next review in 4 days" fg-3). Whole row is a link.
- No bulk build button: content is written when a topic is opened.
- Sort control (segmented): Course order / Needs work.

### 6.8 Topic (`/courses/[courseId]/topics/[topicId]`) - the core study surface

```
CS 161 / Topics / Graph traversal                        [ Ask about this ] [...]

Graph traversal                                                  [<] [>]
How BFS and DFS explore a graph, and when to use each.
(ring) Getting there 62%  .  Best quiz 70%  .  Next review Thu

 Notes (check)   Worked examples (check)   Practice (2/5)   Quiz 70%   Voice practice
-------------------------------------------------------------------------------------

 [ view content ]                                              | On this page
                                                               |  Overview
                                                               |  Key concepts
                                                               |  ...
                                                               | Sources
                                                               |  week2-graphs.pdf p.4
```

Header:
- Above the title, when the topic has a unit: "Week 3: Sorting" (small fg-3, link to the topics
  list; just the title when there is no week label).
- Title (title style), description (body fg-2, max 2 lines), meta row (small fg-2): mastery
  indicator, best quiz, next review ("Due today" in warning tone), "About 35 min" with a 16px
  Clock.
- **Objectives block** (hidden entirely for a topic with no objectives, prerequisites or sources,
  such as one added by hand): a hairline above, then "By the end you can" (body-strong) and a
  bulleted list of the objectives (body fg-2, model text through MathText), max width 68ch. Under
  640px the heading is a full-width disclosure button (44px, CaretDown that turns, count in
  parentheses, `aria-expanded`, `aria-controls`) and the list is closed until opened. Then a
  two-column definition list (label 80px, small fg-3): "Builds on" with the prerequisite topics as
  links (underlined with a `--border-strong` underline, wrapping), and "Taught from" with one
  entry per file and page range, a file icon and "algorithms.pdf, pp. 1-2" as a link to the file
  viewer at that page (same target as the notes citations; plain text when the file has no id).
  Below 640px the label sits above the value. Previous/next topic icon
  buttons on the right of the title (with tooltips naming the topics; shortcuts `[` `]`).
- Topbar actions: "Ask about this" (opens the Ask sheet scoped to the topic) and an overflow
  menu: Regenerate notes / examples / practice / quiz (each opens the generate popover with
  options), Open in Ask (full page), Edit topic (rename inline dialog).

Study path tabs (Tabs component, links with `?view=`): Notes, Worked examples, Practice, Quiz,
Voice practice. Trailing glyph per tab: check (accent) when completed; for Practice "2/5" steps
solved; for Quiz the best score; a small dashed circle when the content is missing; a spinner
when it is being generated. Sticky under the topbar on scroll.

Views:

**Notes**
- Two columns: reading column (max 720px) and a 220px right rail (sticky, top 120px): "On this
  page" outline of h2 headings with scrollspy (active item accent text, left 2px accent bar), then
  "Sources" (each citation: FilePdf icon + "week2-graphs.pdf, p. 4", link to the file at the page;
  without material_id show text only). Rail hidden below 1200px; then the outline becomes a
  "Contents" dropdown button above the notes and sources move to the end of the notes.
- Above the notes: caption row "8 min read" and "Updated Oct 20".
- After the notes: a completion row: if not completed, primary "Mark as read" (check icon); when
  completed: accent-soft InlineAlert "You've read these notes." with link "Next: Worked examples".
- Strip leftover "[Citation: ...]" lines and "If you want, I can..." lines (existing helper).

**Check yourself** (inside the notes). A fenced block with the language `check` renders as an item
instead of a code block: a Card-like box (12px radius, 1px border, surface, 16px padding) with the
caption "Question", the question as compact markdown at 16/26 (math allowed), a secondary small
button "Show answer" (Eye icon; becomes "Hide answer" with EyeSlash) with `aria-expanded` and
`aria-controls`, and, when open, a surface-2 panel (8px radius) captioned "Answer" holding the
answer as markdown. The first line is `Q: ...`, the answer starts at `A: ...` (either may run over
several lines). A block that does not read that way stays an ordinary code block. Notes written
before check blocks exist render as they did.

**Sources under an item.** Under each worked example (at the end of its body), practice problem
(under the statement and chips), and quiz or mock exam review item, a line in small fg-3: "From
algorithms.pdf, p. 2" (several: "From a.pdf, pp. 1-2 and b.docx"). Pages of one file are merged.
Each file is a link to the viewer at the page, underlined like the header's links; a file with no
id is plain text. Nothing is shown when the item has no sources (content written earlier).

**Worked examples**
- Toolbar: count ("3 examples"), "More examples" (secondary; popover with an optional focus input
  "What should they focus on?" and a "Generate" button; uses regenerate-content with append true).
- Each example is a disclosure card (Card): header row: number + title (subheading) + difficulty
  Badge (easy neutral, medium neutral, hard warning) + chevron. Collapsed by default except the
  first. Body: problem statement (Markdown reading compact? use reading variant at 16px), then
  "Solution" steps as a vertical timeline: step number in a 24px circle (surface-2), description
  (body-strong), work (Markdown, code/math), explanation (small fg-2). Final answer in an
  accent-soft panel with a CheckCircle icon and heading "Answer". Key concepts as neutral badges.
  A "Show all steps" / "Step by step" toggle lets the student reveal steps one at a time
  (default: all shown).
- Footer: "Mark as done" when not completed.

**Practice**
```
 Problem 1 of 3: Shortest path in a grid                 [ <  1 2 3  > ]
 [problem statement]

 (1) done  Which traversal finds the shortest path?      BFS   (check)
 (2) now   How many nodes are visited before reaching T?
           [ input ............ ]  [ Check ]   [ Hint ]
 (3)       ...
```
- One problem at a time with a problem switcher (numbers; solved problems show a check).
- Steps as a vertical stepper. Completed steps collapse to one line with the student's answer and
  a check. The current step shows the question (Markdown), the input by `answer_type` (numeric:
  Input with inputmode decimal; text: Input; multiple_choice: option rows like the quiz, from the step's stored `options` (lettered
  tiles, math allowed in each; content written before options existed splits them out of the
  question text), answered with the arrow keys or Space), "Check"
  primary, "Hint" ghost (reveals the hint in a neutral InlineAlert). After Check: correct ->
  accent-soft panel with feedback_correct + explanation, button "Next step"; incorrect ->
  danger-soft panel with feedback_incorrect, buttons "Try again" and "Show answer" (shows the
  correct answer and explanation, marks the step as revealed, not solved).
- Answer checking happens in the browser (keys are in the payload): trim, case-insensitive, accept
  `acceptable_answers`, numeric comparison with 1% relative tolerance for numeric steps (fix the
  old bug: check acceptable answers AND numeric tolerance).
- Progress (steps solved / total) is shown in the tab glyph and a Progress bar under the problem
  switcher. It is stored on the server per problem (`POST /api/topics/[id]/practice-progress`: solved,
  shown and hinted steps), so it follows the student to another device or browser, and kept in
  localStorage as a cache the views read at once. Opening a topic loads the server's progress and
  uploads whatever only the browser had, once. Opening a hint is remembered. Finishing a problem
  (every step solved or shown) records a practice result (steps solved without a hint over all steps)
  that moves mastery and the review date, and refreshes the header. "Start over" is stored too.
  At >= 80% solved the tab glyph becomes a check.
- "More practice" like "More examples".

**Quiz** (lobby, taking, results in one view with internal state; the URL keeps `?view=quiz`)
- Lobby:
```
 Quiz                                                [ New quiz set ]
 Set 3 (10 questions)   v                          Best 70%  .  2 attempts
 Mix: multiple choice, short answer, numerical
 Answers are checked when you submit. Short answers are graded with feedback.
                                      [ Start quiz ]
 Past attempts
  Oct 20, 3:12 pm   70%   [Review]
  Oct 19, 9:40 am   55%   [Review]
```
  Set selector (Select) lists sets newest first ("Set 3, Oct 20"). "New quiz set" popover: focus
  input, question types (checkbox group, default all), count (segmented 5 / 10 / 15), difficulty
  (segmented). Generating shows JobStatus in place of the lobby body.
- Taking: QuestionRenderer one question per screen inside a 720px column:
```
 Question 3 of 10                                   [ 1 2 3 4 5 6 7 8 9 10 ]
 ---------------------------------------- progress bar
 What is the time complexity of BFS on an adjacency list?   (2 points)

 [A] O(V)
 [B] O(V + E)        <- selected: accent border, accent-soft bg, letter tile accent
 [C] O(V^2)
 [D] O(E log V)

 [ <- Previous ]                                     [ Next -> ]   (last: [ Submit quiz ])
```
  Question navigator: compact number chips (answered: surface-3 bg; current: accent ring;
  unanswered: border). Submit asks for confirmation only when questions are unanswered ("3
  questions are unanswered. They'll be marked wrong."). Answers persist in sessionStorage per quiz
  set so a refresh does not lose them. While grading: button loading "Grading..." (can take up to
  ~30s with short answers): show a calm full-panel state "Grading your answers" with an
  indeterminate Progress.
- Results:
```
 (ring 96: 70%)  7 of 10 points                       [ Retake ]  [ Voice practice ]
 Your best is 70%.
 [ All 10 ]  [ Missed 3 ]                             (segmented filter)
 1  (check)  What is BFS...                          2/2
    Your answer: O(V + E)
 2  (x)      Explain why DFS...                       0/3
    Your answer: ...   Feedback: ...   Sample answer: ...   Why: explanation
```
  Each item: status icon (CheckCircle accent / XCircle danger / partial: half circle warning),
  question (MarkdownInline), points, student answer, then for wrong or partial: correct/sample
  answer, feedback (short answers), explanation (Markdown compact). Retake resets answers.
  After results: optional confidence prompt row "How sure did you feel?" with 5 small buttons
  (1-5) calling POST /api/topics/[id]/confidence {source:'quiz'} (silent success toast "Thanks,
  your review schedule is updated."). This is a new use of an existing route.
- Past attempts: list (date, score badge, Review link that expands the stored review).

**Voice practice**: the VoiceCoach component in topic mode (6.12).

Generation states for any view (content missing):
- EmptyState inside the view: icon per view (Notebook, Lightbulb, PencilSimpleLine, Exam,
  Microphone), title "No notes yet" / "No worked examples yet" / ..., text "Written from your
  materials for Graph traversal. Takes about a minute.", primary "Write notes" / "Create examples"
  / "Create practice" / "Create a quiz", and a small "Options" link opening the options popover
  (notes: detail level segmented Brief / Standard / Detailed (maps to brief / moderate /
  comprehensive); examples & practice: count 2/3/5 and difficulty; quiz: as above).
- Generating: the view body shows JobStatus plus a skeleton of the final layout (notes: heading +
  paragraphs; examples: 3 collapsed cards; quiz: lobby). It resumes after refresh by matching
  active jobs with targetKey `content:{topicId}:{contentType}`. When done, `router.refresh()` and a
  quiet toast "Notes are ready".
- Failed: InlineAlert danger with `describeJobFailure` text and "Try again".
- Preflight 503 (AI unavailable): InlineAlert danger "Study content can't be created right now.
  Try again in a few minutes."
- Daily budget (`LLM_DAILY_BUDGET`): InlineAlert warning "You've used today's AI allowance. It
  resets at 5:00 PM." The reset is midnight UTC shown in the student's time zone ("tomorrow at
  8:00 AM" when that is the next calendar day there). Never a dollar amount, anywhere in student UI.
- Opening a topic with no notes starts them at once and shows the generating state (one job, even
  if the page renders twice); the AI service then queues examples, practice and the quiz one at a
  time, and the tabs show a spinner while each is written. Marking the examples done starts the
  next topic's notes in the background.
- Course "..." menu: "Prepare all topics now" (only while some topic lacks content) opens a
  confirm dialog: "This writes notes, worked examples, practice and a quiz for about N topics, one
  at a time. It uses a large part of today's AI allowance." [Cancel] [Prepare all topics].

### 6.9 Ask (`/courses/[courseId]/ask`) and the Ask sheet

Full page: two panes inside the content area (no outer card):

```
+------------------+-------------------------------------------------------+
| [ New chat ]     |                    (messages, 720px column)           |
| Today            |                                                       |
|  BFS vs DFS      |  You                                                   |
|  Master theorem  |  How does BFS differ from DFS?                         |
| Earlier          |                                                       |
|  ...             |  Margins                                           |
|                  |  BFS goes wide, level by level[1]. DFS goes deep[2]...|
|                  |  Sources  [1] week2-graphs.pdf, p. 4  [2] ... p. 5    |
|                  |                                                       |
|                  |  +-------------------------------------------------+  |
|                  |  | Ask about your materials...                     |  |
|                  |  | [All materials v]                     [ Send ] |  |
|                  |  +-------------------------------------------------+  |
+------------------+-------------------------------------------------------+
```

- Thread list 248px (surface, right hairline), grouped Today / Last 7 days / Earlier, row menu
  Delete (confirm). Collapses into a dropdown on < 1024px.
- Messages: user messages right-aligned in a surface-2 bubble (radius 12, max 80%), 15px.
  Assistant messages full-width Markdown (reading variant at 16px), label row "Margins"
  (caption fg-3) above. Citation markers render as small superscript pills (accent-soft bg,
  accent-soft-fg, 11px mono, radius 6) that open a HoverCard: filename + page (caption), the
  cited text as a quote (small, fg-2, 5-line clamp), and "Open page" (PDF link to the page) or
  "View excerpt" (dialog for DOCX/PPTX). Sources list under the answer: numbered rows, collapsed to
  the first 3 with "Show all N".
- Streaming: "Searching your materials..." (with spinner) then text streams with a blinking caret;
  Escape or a "Stop" button aborts the fetch (the server still saves; note that in a toast "The
  answer will still be saved."). `reset` event clears the partial answer silently.
- Composer: auto-growing textarea (max 8 lines) in a bordered container (radius 12, surface),
  scope Select chip on the bottom left ("All materials" or a topic), character count when > 1800,
  Send icon button (accent) on the right; Enter sends.
- Empty state (no thread): centred heading "Ask your materials", one line "Answers come only from
  your files, with sources.", then 4 example question chips (from `exampleQuestions()`); no
  materials: EmptyState with link to Materials.
- Errors: inline InlineAlert under the failed question with the friendly message and "Try again"
  when retryable; `no_sources` stop reason shows the answer text plus a neutral note "Nothing in
  your materials matched closely. Try naming a concept from your notes."
- Ask sheet (from the topic page): the same conversation component in a Sheet (440px), scope fixed
  to the topic with a link "Open full page".

### 6.10 Mock exams

**List** (`/exams`):
```
Mock exams                                                    [ New mock exam ]
Timed practice exams built from your topics.

 Mock exam, Oct 20      20 questions, 60 min, medium      Best 72%   [ Open ]
 Mock exam, Oct 18      ...                                In progress [ Resume ]
```
Rows with hairlines. Empty: EmptyState (icon Exam) "No mock exams yet" "Pick topics, set a time
limit, and take an exam under real conditions." + "New mock exam" (disabled with explanation when
no confirmed topics).

**New** (`/exams/new`): form in a 640px column:
- Topics: checkbox list (two columns on desktop) with "Select all" / "Clear", each with its
  mastery ring; preselect topics that are due or below Strong.
- Questions: SegmentedControl 10 / 20 / 30 / 40 (default 20).
- Time limit: SegmentedControl 30 / 60 / 90 / 120 / 180 min (default 60).
- Difficulty: Easy / Medium / Hard (default Medium).
- Question mix: SegmentedControl "Balanced" (60/30/10), "More concepts" (40/50/10), "More
  calculation" (40/20/40) mapped to questionTypeDistribution.
- Style (only when a past exam of the course has a style profile): one bordered checkbox row,
  "Match my past exams", on by default, with a caption in fg-3: "Questions follow the wording, task
  verbs and answer length of the exams you uploaded. The question mix above stays as chosen." The
  row uses the same selected treatment as a ticked topic (accent border and accent-soft fill). It
  is hidden entirely when no profile exists (no past exam, or none processed yet), not shown
  disabled. On sends `matchPastExams: true`.
- Primary "Create exam". Then the page shows JobStatus "Writing your exam" (about 1-2 minutes)
  with a skeleton; on completion go to the exam lobby. Resumes after refresh.

**Lobby** (`/exams/[examId]`): title, facts row (questions, time limit, difficulty, topics as
badges), a short "Before you start" list (timer keeps running if you leave; answers save
automatically; you can submit early), primary "Start exam" (or "Resume, 34:12 left" when an
attempt is in progress). Below: attempts history (date, score badge, Results link; pending rows
show "Grading" with a spinner, failed grading shows "Grade again").

**Taking** (focus layout):
```
 [x Exit]   Mock exam, Oct 20        (clock) 41:07        Saved      [ Submit ]
 -------------------------------------------------------------------------------------
  Question 7 of 20                                   | Questions
  ...QuestionRenderer...                             | [1][2][3][4][5]
                                                     | [6][7][8][9][10]
  [ <- Previous ]  [ Flag ]           [ Next -> ]    | ...
                                                     | 14 answered, 2 flagged
```
- Timer from the server deadline (use `deadlineAt` and correct with `serverNow`), mono tabular,
  warning tone under 5 minutes plus a one-time InlineAlert "5 minutes left", danger under 1 minute.
  At zero: auto-submit once.
- Save status: "Saving..." / "Saved" / "Offline, will retry" (from the autosave hook).
- Navigator grid on the right (desktop) or in a bottom sheet behind a "Questions" button (mobile).
  Flag is client-only (sessionStorage).
- Exit: ConfirmDialog "Leave the exam? The timer keeps running and your answers are saved."
- Submit: ConfirmDialog when unanswered ("4 questions are unanswered.").

**Results** (`/results/[submissionId]`):
```
 (ring 96: 72%)  58 of 80 points
 Mock exam, Oct 20, submitted 3:41 pm
 [ Retake exam ]  [ Back to exams ]

 Where to focus                       (weakest first)
  Dynamic programming    40%  [Study]
  Graph traversal        65%  [Study]
  Sorting                92%

 Questions   [ All 20 ] [ Missed 6 ] [ Needs review 1 ]
  ... same review items as the quiz ...
```
- Grading in progress: calm full-panel state "Grading your exam" + indeterminate Progress, polls
  the grading job; failed: InlineAlert with "Grade again".
- "Where to focus": rows with topic name, percent, a thin inline bar (no track), and "Study" link
  to the topic (hidden when not linkable).

### 6.11 Course settings (`/courses/[courseId]/settings`)

Simple form: name, description, **Exam date** (optional date Input, "Margins plans your days up to
it."), **Time to study each day** (Select: 20, 30, 45, 60, 90 minutes, 2 hours, 3 hours; default
45), Save. The same two fields are on the create-course form (6.4), the date optional. Danger zone (hairline-separated section, not a red box):
"Delete course" with explanation and a ConfirmDialog requiring the course name to be typed.

### 6.12 Review (`/courses/[courseId]/review`) and Voice practice

The Review page (h1 "Review", "Go over the topics that are due, most overdue first."):

```
 Due for review (2)
 +--------------------------------------------------------------+
 | Graph traversal                                    Due today |
 | (ring) Getting there 44%   You missed 2 questions lately.     |
 | [ Retry what you missed ]  [ New questions ]                   |
 +--------------------------------------------------------------+
 | Hash tables                                        Overdue 2d |
 | (ring) Learning 21%        No missed questions to retry.      |
 | [ New questions ]                                              |
 +--------------------------------------------------------------+
 Coming up
  Sorting algorithms                                       Oct 28
 Voice practice: Covers your 3 weakest topics: ...        [ Start voice practice ]
```

- Due = review date reached by the end of today in the student's time zone, most overdue first.
  Each is a list item with an id `review-<topicId>` (plan items link to it; the target is outlined in
  accent). Empty: EmptyState "Nothing is due" with the date of the next review.
- One filled button on the page: the first (most overdue) topic's main action. Every other row's buttons
  are secondary, so five rows do not compete. A caption says what a review changes: score 70% or more
  and the next review moves out; below that it comes back tomorrow. When mastery reads lower than the
  last score because the review is late, the row says so ("Showing 44%, faded from 62% because the
  review is 5 days late."). Names are at least 44px tall on a phone. Empty: a one-line card.
- **Retry what you missed** (primary on the first row; hidden when nothing was missed): a quiz of the questions
  wrong in the last two attempts, no model call. It opens the topic's quiz on a set named "Retry"
  and starts it. **New questions** (secondary, primary when it is the only action of the first row): a new 6-question set
  focused on the missed concepts, difficulty from mastery, with a question or two from a prerequisite
  topic; it opens the quiz while the set is written ("Writing" skeleton as for any new set). Failures
  show an InlineAlert under the buttons. Both buttons name the topic in their accessible name
  ("Retry what you missed for Graph traversal").
- The same two buttons sit in a "Due for review" panel at the top of a due topic's quiz lobby.
- Attempts on these sets update mastery and the schedule exactly like a quiz.

Voice practice:

The Review page does not run a session. "Start voice practice" opens
`/courses/[courseId]/review/voice`, a focus screen (no sidebar; a top bar with Exit back to Review) with
an h1, the topics it covers, then the lobby, live session and summary in place. The page keeps its full
height so starting a session does not move it; on a phone the live session is full screen. The topic's
Voice practice tab is unchanged.

Built on the new Claude voice backend (see `/tmp/sb-design/VOICE_API.md`): browser
SpeechRecognition for listening, speechSynthesis for speaking, server turns streamed as NDJSON.

Lobby:
```
 Voice practice                                        18 min left today
 Answer questions out loud and get feedback, like a study partner.

 Style      ( Quiz me | Walk me through it | Just talk )
 Language   [ English v ]
 Focus      [ optional: e.g. "edge cases in Dijkstra" ]

 [ Start voice practice ]      Works best in Chrome, Edge or Safari with a microphone.
```
Sprint page adds a line "Covers your 3 weakest topics: ...".

Session (in place of the lobby; on mobile it uses the focus layout):
```
 Question 2 of 8                                             [ End ]
 Explain why BFS finds shortest paths in unweighted graphs.

                         ( orb 128px )
                          Listening

 You:   because it visits nodes in order of distance...        (interim in fg-3 italic)
 Coach: Right. Each level is one step further...
 [ Correct ]  You explained the level-by-level order.

 [ mic toggle ]  [ Type instead ]  [ Hint ]  [ Skip ]
```
- Orb: a 128px circle of accent-soft with an inner accent circle whose scale follows mic level
  while listening (motion value via requestAnimationFrame writing a CSS variable, not React
  state); thinking: a slow rotating conic ring; speaking: gentle pulse; idle/paused: static
  muted. Under it a status word: Listening / Thinking / Speaking / Paused.
- Transcript: last 6 turns visible, older ones scroll; coach turns fg, student turns fg-2;
  interim recognition italic fg-3. Evaluations appear as a small row under the coach turn: Badge
  (Correct accent / Partly warning / Not quite danger) + comment.
- Barge-in: when the student starts speaking, cancel speech synthesis immediately.
- Text mode: "Type instead" swaps the mic for an Input + Send; automatically on when
  SpeechRecognition is unavailable (with an InlineAlert "Voice input isn't supported in this
  browser. You can type your answers.").
- End: PATCH session ended, show a summary card: questions answered, correct count, topics to
  revisit, "Start again" and "Back to topic".
- Limits: show minutes left; at 0 the Start button is disabled with "You've used today's voice
  time. It resets in Xh."

### 6.13 Plan (`/courses/[courseId]/plan`)

```
 Plan                                                     [ Exam date and time ]
 Your exam is in 21 days, Wednesday, Nov 11. Planned for 45 minutes a day.

 [warning] Time is short   You have room to learn 3 of the 6 topics left ...
 Not scheduled: 3 topics    [Later] [Hardest] [Extra]

 This week  Oct 19 to Oct 25
 +--------------------------------------------------------------+
 | Wed, Oct 21     (o) Learn Sorting algorithms        [ Start ] |
 | [Today]             Read the notes, then work through ...    |
 | 35 min done, ...    35 min                                    |
 +--------------------------------------------------------------+
 | Thu, Oct 22     (o) Quiz: Sorting algorithms                  |
 |                 (o) Learn Graph traversal                     |
```

- Course nav: "Plan" after Overview (CalendarCheck icon), command palette "Open the plan".
- A page of **weeks** (Monday to Sunday headings; the current one says "This week"), each a list of
  **day cards**. A day card has the date (h3), badges ("Today" accent, "Exam day" warning, "Final
  review" neutral), "About N min" (today: "N min done, M to go"), and the list of its items. Today's
  card has an accent border and `aria-current="date"`. On phones the date sits above the list; from
  the `sm` breakpoint it is a 148px column to the left. No horizontal scrolling at 390px.
- An item row: a status mark (empty circle, or an accent check for done: also named "Done"/"To do"
  for screen readers), the title as a link to its action, one line of reason, "Part 1 of 2, 35 min"
  caption, and on today's undone items a small secondary button with the verb (named with the title).
  Done items are quiet (fg-3) and show no reason. A day with nothing says "Nothing planned. A good day
  to rest."
- Above the weeks: the summary line (exam in N days / the next 14 days), then, as they apply: the
  short-time warning (InlineAlert warning, title "Time is short", plain words: how many topics fit,
  that past-exam topics come first, that unit mocks were left out and that only one full mock exam is
  planned), a neutral notice when only the mocks were dropped to make everything fit, a note when the
  exam is too close for two full mocks, and the **Not scheduled:
  N topics** card (heading, one sentence, topics as links). Nothing the plan leaves out is hidden.
- After learning the days fill with revision, so the run to the exam is not empty: **Review** items on
  a spaced ladder (a week after the first quiz, then two weeks, always one before the final review days;
  these read the same as any review, with the line "A spaced review, timed to keep it fresh." and open
  the topic's quiz), and **Mixed practice: A, B and C** items (15 to 30 minutes, up to the daily time,
  2 or 3 topics, weakest and past-exam topics first; "Create" opens the new mock exam form with those
  topics ticked). The 7th day of each run is left free to rest. The first full mock is the day after
  everything is learned when 7 or more days remain.
- When time is short the plan gives mock exams up before topics: the unit mocks first, then the earlier
  of the two final-week mocks. One full mock stays, 2 days before the exam; with an exam tomorrow it is
  today.
- A long plan stays short: today and the two days after it show their items; every later day is one
  line (date, what is on it, minutes, a caret) that opens; the first two weeks and the last two before
  the exam list those lines, and the weeks in between fold into one line each ("Later weeks"). Every
  row links to its action (the whole row is the link, with a caret; today's rows also have a button).
  Reasons are specific: a review says how late it is and the topic's mastery, a first quiz says it sets
  mastery and the review date, a learn row names its unit. The loading shape follows the page. Before
  the browser's time zone is known the page shows that shape for one request rather than a plan for the
  wrong day. Empty states: no topics (EmptyState with "Go to topics"), exam date
  passed (neutral InlineAlert with "Change the date"), all caught up (EmptyState with "New mock exam").
- The plan is worked out on the server from real progress on every load (topics learned, quizzes and
  reviews, mock exams); nothing on the page is stored, so it never drifts from what happened.

---

## 7. Shared behaviours

- **Jobs**: one hook `useJob(jobId)` (wraps `pollJobUntilDone` from `src/lib/jobs/poll-job.ts`)
  and `useActiveJobs({courseId, types, targetPrefix})` (GET /api/jobs?active=1) so every screen
  resumes running work after refresh. On completion call `router.refresh()`.
- **API client** `src/lib/api/client.ts`: `apiFetch<T>(url, init)` returns typed JSON or throws
  `ApiError {status, code, message, details}` normalised from all three error shapes
  (string `error`, `{error:{code,message,details}}`, and `details.code`). UI shows `message`.
- **Server data**: pages are Server Components that read through `src/server/queries/*.ts`
  (Prisma, always filtered by the session user id). Client components receive plain props.
  Mutations go through API routes, then `router.refresh()`.
- **Empty, loading, error** for every page and every async panel (see each screen).
- **Optimistic UI** for reorder, rename, mark-as-read, delete (with rollback + toast on failure).
- **Dates**: `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` helpers in `src/lib/format.ts`
  ("2h ago", "Oct 20", "Thu"). Remove date-fns.
- **Accessibility**: skip link, landmarks (nav, main, aside), one h1 per page, `aria-current` on
  nav and tabs, `aria-live` for job status, streaming answers (polite) and timer warnings
  (assertive at 5 min and 1 min only), labelled icon buttons, 44px touch targets on mobile, focus
  returned after dialogs, no keyboard traps, contrast AA in both themes.
- **Responsive**: breakpoints 640 / 768 / 1024 / 1280. Every multi-column layout declares its
  single-column fallback. Test at 390px, 768px, 1280px, 1536px.

## 8. Performance budget

- Server Components by default; client components are leaves.
- No client-side data fetching for first paint of any page (exceptions: chat thread switching,
  quiz attempts history, job polling).
- First-load JS: landing and auth < 110 KB gzipped beyond the framework baseline; app pages
  < 160 KB. Markdown + KaTeX + highlight, the chat client, the voice coach and the exam taker are
  `next/dynamic` imports loaded only on their pages. KaTeX CSS loads only with the markdown chunk.
- `next/font` (geist package), `next/image` for screenshots, no layout shift from fonts or images.
- Prefetch sidebar links (default Link behaviour). `loading.tsx` skeletons make navigation feel
  instant.
- Targets: Lighthouse performance >= 95 on `/`, `/login`; >= 90 on `/home` and a topic page
  (desktop). CLS < 0.05.

## 9. Engineering conventions for implementers

- Next.js 16 App Router, React 19, TypeScript strict, **Tailwind CSS v4** (`@tailwindcss/postcss`,
  CSS-first `@theme` in `globals.css`, `@custom-variant dark (&:where(.dark, .dark *))`). Remove
  Tailwind v3 config, `tailwindcss-animate`, `autoprefixer` if unused.
- Dependencies to add: `@phosphor-icons/react`, `cmdk`, `sonner`, `next-themes`, `geist`,
  `@radix-ui/react-popover`, `@radix-ui/react-tooltip`, `@radix-ui/react-hover-card`,
  `@radix-ui/react-select`, `rehype-highlight`, `highlight.js` (only the languages listed).
  Remove: `lucide-react`, `react-syntax-highlighter`, `@types/react-syntax-highlighter`,
  `date-fns`, `react-hook-form`, `@hookform/resolvers`, `@radix-ui/react-toast`,
  `@radix-ui/react-progress`, `@auth/prisma-adapter` (unused) after confirming nothing imports
  them. Keep `@tanstack/react-query` only if used.
- Folder layout:
  - `src/app/(marketing)`, `src/app/(auth)`, `src/app/(app)`, `src/app/(focus)`; `src/app/api`
    untouched.
  - `src/components/ui` (primitives), `src/components/shell` (sidebar, topbar, palette, account
    menu), `src/features/<area>` (home, courses, materials, topics, topic, quiz, exams, ask,
    voice), `src/server/queries` (read models), `src/lib` (existing libs + `api/client.ts`,
    `format.ts`), `src/config` (brand, layers).
- Delete the old UI: all old `page.tsx`/`layout.tsx` outside `api`, `src/components/**`,
  `src/hooks/useRealtimeVoice.ts` (after the voice backend merge), old `globals.css`,
  `tailwind.config.ts`, the old Playwright smoke test (replace with new e2e specs).
- Keep the pure libs in `src/lib` (jobs, chat events/citations, uploads, quiz helpers, exam
  timing, learning markdown) and reuse them.
- Copy rules from section 1 apply to every string, including errors and aria labels. No em or en
  dashes anywhere in UI text.
- Every feature PR includes screenshots (light and dark, 1440px and 390px) taken with the
  Playwright script against the local dev stack with demo data.

---

## 10. Domain, SEO and legal pages

Site: **https://studymargins.com** (apex is canonical). Brand "Margins".

### 10.1 Technical SEO
- `metadataBase: new URL('https://studymargins.com')` in the root layout. Title template
  `"%s - Margins"`, default title `"Margins: study from your own course files"`. Default
  description: "Upload lecture notes and past exams. Margins builds notes, practice, quizzes and
  timed mock exams from them, with sources for every answer." (Under 160 characters.)
- Canonical URL on every public page (`alternates.canonical`).
- `www.studymargins.com` permanently redirects to the apex: a `redirects()` entry in
  `next.config.js` with `has: [{ type: 'host', value: 'www.studymargins.com' }]` (keep path and
  query).
- `src/app/robots.ts`: allow `/`, `/privacy`, `/terms`, `/signup`, `/login`; disallow `/api/`,
  `/home`, `/courses/`. Sitemap link `https://studymargins.com/sitemap.xml`.
- `src/app/sitemap.ts`: `/` (priority 1), `/signup` (0.6), `/privacy` (0.3), `/terms` (0.3),
  with `lastModified` = build time.
- Every signed-in page sets `robots: { index: false, follow: false }` in its layout metadata.
  `/login` is `index: false, follow: true`.
- Open Graph and Twitter cards for `/`: `src/app/opengraph-image.tsx` (next/og, 1200x630): canvas
  background, brand tile + wordmark top left, headline "Study from your own course files." in
  64px Geist 600, and a cropped real product screenshot on the right (load from
  `public/screens/notes-light.png`). `twitter-image` re-exports it. `og:type website`,
  `og:site_name Margins`, `twitter:card summary_large_image`.
- JSON-LD on `/` (script type application/ld+json): `SoftwareApplication` with name "Margins",
  url, `applicationCategory: "EducationalApplication"`, `operatingSystem: "Web"`,
  `offers: { price: 0, priceCurrency: "USD" }`, description; plus an `Organization` with name,
  url and logo (`/icon-512.png`).
- Icons: `src/app/icon.tsx` (32px brand tile), `apple-icon.tsx` (180px), and static
  `public/icon-192.png`, `public/icon-512.png`; `src/app/manifest.ts` (name "Margins",
  short_name "Margins", start_url "/home", display "standalone", background and theme colours
  from `--canvas` / `--accent` light values in hex).
- The landing page is fully static (no session read on the server for the content; the nav's
  signed-in state is a tiny client island reading the session) so it is cacheable and fast.
  Target Lighthouse SEO 100, performance >= 95.
- Semantic structure on public pages: one h1, logical h2s, descriptive link text, alt text on
  every screenshot ("Margins notes page showing Graph traversal notes with sources").

### 10.2 Legal pages (`/privacy`, `/terms`)
Marketing layout, a 680px reading column (reading typography), last-updated date at the top,
headings h2. Linked from the footer and the sign-up page ("By creating an account you agree to
the Terms and Privacy Policy." in caption fg-3 under the button). Google's OAuth consent screen
links to both, so they must exist before the new UI ships. Copy (use verbatim, adjusting only
formatting):

**Privacy Policy** (title "Privacy")
- Intro: "Margins is a study tool run by Harish Manoharan. This page explains what we store and
  why. Last updated October 20, 2026."
- What we store: "Your account: your email address, your name if you give one, and a hashed
  password (or your Google account ID if you sign in with Google). Your course files and what
  Margins creates from them: notes, examples, practice, quizzes, mock exams, chat answers, your
  answers and scores, and voice review transcripts. Basic usage records, such as how much AI
  processing your account used each day, so we can keep the service within its limits."
- How it's used: "Only to run Margins for you: to process your files, create study material,
  grade your answers and show your progress. We don't sell your data, show ads, or use your files
  to train AI models."
- Services we use: "Anthropic processes the text of your files and your questions to create study
  material and answers (Anthropic does not use this data to train its models by default).
  Railway hosts the app, the database and file storage in the United States. Google provides
  sign-in if you choose it. Voice review uses your browser's built-in speech recognition, which
  may send audio to your browser vendor (Google for Chrome, Apple for Safari)."
- Your choices: "Delete a course and its files and everything created from them are deleted. To
  delete your account entirely, email hello@studymargins.com from the address you signed up with
  and we'll remove it within 30 days."
- Contact: "hello@studymargins.com"

**Terms of Use** (title "Terms")
- Intro: "By using Margins you agree to these terms. Last updated October 20, 2026."
- "Margins is provided as is, for personal study. It is free to use, and features or limits may
  change."
- "Only upload material you have the right to use. You keep ownership of your files and of what
  you write."
- "Study material created by Margins can contain mistakes. Check important facts against your
  course materials and your instructors."
- "Don't use Margins to break the law, to attack the service, or to break your school's academic
  integrity rules, such as using it during an exam where that isn't allowed."
- "We may suspend accounts that misuse the service. You can stop using Margins and delete your
  data at any time."
- "These terms may be updated; the date at the top shows the latest version. Questions:
  hello@studymargins.com."
