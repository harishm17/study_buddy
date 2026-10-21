# Voice coach API (Claude backend)

The voice coach is now a text conversation with Claude. The browser does speech-to-text (Web Speech API `SpeechRecognition`) and text-to-speech (`speechSynthesis`). The server runs the conversation, runs the drill tools, keeps the history and meters usage. There is no WebRTC, no client secret and no OpenAI key anywhere.

Removed: `POST /api/voice/realtime-token` and `POST /api/voice/tools/execute`. Do not call them.

All routes need the signed-in session cookie. Errors use the B shape unless noted:

```json
{ "error": { "code": "CONFLICT", "message": "friendly text", "details": { "code": "SESSION_ENDED", "retryable": false } } }
```

`error.code` is one of `UNAUTHORIZED | NOT_FOUND | INVALID_INPUT | CONFLICT | RATE_LIMITED | UPSTREAM_ERROR | INTERNAL_ERROR`. For voice turns the useful code is `error.details.code` (table below). `error.message` is always safe to show to the student.

## Lifecycle

```
POST /api/voice/session                 -> { sessionId, ... }
POST /api/voice/turn  { utterance: "" } -> coach greets and asks the first question
POST /api/voice/turn  { utterance }     -> ... one per student reply
PATCH /api/voice/session { heartbeat }  -> every 30 s while the session is open
PATCH /api/voice/session { status: "ended" }   when the student leaves
```

The drill can also end by itself: the turn that gets the last question answered and asks for another sends a `session_complete` event and marks the session ended on the server. After that every turn returns 409 `SESSION_ENDED`.

Usage is billed in voice minutes from the first turn (`connectedAt`) until the session ends, or until the last sign of life (a turn or a heartbeat) if the browser vanished. A session counts as live for 90 s after its last turn or heartbeat. One session is capped at 2 h. The default daily cap is 30 minutes (`VOICE_DAILY_MINUTES`, a 24 h rolling window).

## POST /api/voice/session

Create a session.

Request body:

| field | type | notes |
|---|---|---|
| `projectId` | string | required |
| `mode` | `topic_drill` \| `sprint` | default `topic_drill` |
| `topicId` | string | required for `topic_drill` |
| `style` | `oral_quiz` \| `guided_notes` \| `topic_conversation` | default `oral_quiz`. Now stored and used. |
| `focus` | string \| null | optional, what to concentrate on. Whitespace is collapsed and it is cut to 280 characters. |
| `language` | `/^[a-z]{2,8}$/i` | default `en`. The coach speaks only this language. Also set `SpeechRecognition.lang` and the synthesis voice from it. |
| `voice` | string | accepted and ignored (the browser picks the voice) |

Responses:

- 200 `{ sessionId, questionCount, mode, style, focus }`
- 400 `INVALID_INPUT` (no `topicId` for a topic drill, bad body)
- 404 `NOT_FOUND` (project or topic is not the user's)
- 422 `{ "error": { "code": "CONFLICT", "message": "No conceptual questions available" }, "requiresGeneration": true }` when the style is `oral_quiz`, or the mode is `sprint`, and there are no questions. Offer to generate notes and a quiz (`POST /api/topics/{id}/generate-content` for `section_notes` and `topic_quiz`) and retry. `guided_notes` and `topic_conversation` topic drills work without questions.

Creating a session can call the LLM once (it builds the question pack from the notes when the topic has no quiz). Nothing is metered until the first turn.

## PATCH /api/voice/session

Body: `{ sessionId, status?, heartbeat?, lastDetectedLanguage?, incrementInterruptCount? }`

- `status`: `active` | `ended` | `aborted`. `ended` or `aborted` sets `endedAt`. An ended session cannot be reopened (a late `active` returns `{ session: { id, endedAt } }`).
- `heartbeat: true` refreshes `lastSeenAt`. Turns also refresh it, so the heartbeat is only needed while the student is silent or the coach is speaking. Send it every 30 s while the session is open. Missing it for 90 s makes the session count as gone.
- `incrementInterruptCount` (0..20): call with `1` on each barge-in.
- `lastDetectedLanguage` (`/^[a-z]{2,8}$/i` or null).
- 200 `{ session: { id, status, interruptCount, lastDetectedLanguage, endedAt } }`. 404 if the session is not the user's.

Always send `status: "ended"` when the student leaves (use `navigator.sendBeacon`-style `fetch(..., { keepalive: true })` on `pagehide`).

## GET /api/voice/usage

200 `{ dailyMinutes, usedSeconds, remainingSeconds, hasLiveSession }`. Use it to show the minutes left and to warn before starting. `hasLiveSession: true` means another session is open, and the first turn of a new one would get 409 `ACTIVE_SESSION`.

## POST /api/voice/metrics

Optional client timing. Body `{ sessionId, entry }` where `entry` is strict (unknown keys are rejected) with non-negative numbers: `ttftMs`, `ttfaMs`, `speechMs`, `responseMs`, `toolLatencyMs`, `toolFailures`, `interrupts`, `lastDetectedLanguage`. 200 `{ success: true }`. Useful fields now: `ttftMs` (time to the first `text` event), `ttfaMs` (time until the first sentence started speaking), `responseMs` (whole turn).

## GET /api/voice/drill-pack?mode=&projectId=&topicId=

Unchanged. Preview of up to 5 questions. Not needed by the session flow.

## POST /api/voice/turn

One exchange with the coach.

Request body:

```json
{ "sessionId": "uuid", "utterance": "A hash function maps a key to a bucket" }
```

- `utterance`: trimmed, at most 2000 characters. The empty string means "start the session" the first time (the coach greets and, for `oral_quiz`, asks the first question) and "carry on" on a session that already has history (use it for a retry after a failed turn, or to nudge a silent student). Send the speech recognizer's final transcript as is.
- The conversation is kept on the server (the last ~30 messages). The client sends only the new words and cannot forge tool results.

### Errors before the stream starts

The status is not 200 and the body is JSON (B shape). The session keeps its old conversation, so the same request can be retried. Read `error.details.code`:

| status | `details.code` | meaning | what to do |
|---|---|---|---|
| 400 | (INVALID_INPUT) | bad body, utterance over 2000 | fix and resend |
| 401 | | not signed in | sign in |
| 404 | | session is not the user's | |
| 409 | `SESSION_ENDED` | session was ended (by the student, or the drill finished) | show the summary, offer a new session |
| 409 | `ACTIVE_SESSION` | another voice session is live (first turn only) | ask the student to end it |
| 409 | `TURN_IN_PROGRESS` | a turn is still running for this session | wait for `done`; do not send two turns at once |
| 429 | `VOICE_DAILY_LIMIT` | daily minutes used up (first turn only). `details.remainingSeconds` is 0 | show the limit |
| 429 | `RATE_LIMITED` | more than 30 turns a minute. `Retry-After` header is set | back off |
| 429 | `LLM_DAILY_BUDGET` | the user's daily AI spend cap is reached | not retryable until midnight UTC |
| 503 | `VOICE_UNAVAILABLE` | the AI service is unreachable | retry later |
| 503/502 | `LLM_NOT_CONFIGURED`, `LLM_AUTH_FAILED`, `LLM_CREDIT_EXHAUSTED`, `LLM_RATE_LIMITED`, `LLM_UNAVAILABLE`, `LLM_REFUSED`, `LLM_REQUEST_REJECTED`, `LLM_BAD_OUTPUT`, `VOICE_TURN_FAILED` | model problems | `details.retryable` says whether a retry makes sense |

Every error body has `details.retryable`.

### The stream

200, `Content-Type: application/x-ndjson`, `Cache-Control: no-cache, no-transform`. One JSON object per line, camelCase. Order within a turn: tool events (`question`, `evaluation`, `hint`, `session_complete`) arrive as soon as a tool has run, `text` deltas arrive as the coach writes, and the turn ends with exactly one `done` or one `error`.

| event | shape | notes |
|---|---|---|
| `text` | `{ "type": "text", "delta": "That is right. " }` | speakable text, no markdown. Append to the coach bubble and feed the sentence chunker. |
| `question` | `{ "type": "question", "index": 2, "total": 10, "text": "...", "questionType": "short_answer", "options"?: [{ "id": "A", "text": "..." }] }` | the coach is about to ask this question (the exact bank text). `options` only for multiple choice. Show a question card. Does not include the answer. |
| `evaluation` | `{ "type": "evaluation", "isCorrect": true, "score": 0.8, "comment": "...", "explanation": "...", "ungraded"?: true }` | the student's answer was graded on the server. `score` is 0..1. `ungraded: true` means the question had no answer key (do not show a score). The coach's spoken feedback follows in `text`. |
| `hint` | `{ "type": "hint", "text": "..." }` | a nudge (never the answer). The coach also says it. |
| `session_complete` | `{ "type": "session_complete" }` | the drill is over and the session is marked ended. The coach's goodbye follows in `text`. Next turns return 409 `SESSION_ENDED`. |
| `done` | `{ "type": "done", "text": "the whole reply" }` | last event of a good turn. The conversation has been saved. |
| `error` | `{ "type": "error", "code": "LLM_UNAVAILABLE", "message": "friendly text", "retryable": true }` | last event of a failed turn. `code` is one of the codes above plus `VOICE_INTERRUPTED` (stream cut), `VOICE_NOT_SAVED` (reply was fine but the conversation could not be stored; the coach may repeat itself). `message` is safe to show. |

Behaviour of a failed turn:

- Nothing was said and no tool ran: nothing is kept; the student's words are dropped. Retry with the same `utterance`.
- A tool ran (for example an answer was recorded) and then the model failed: the recorded answer is kept and will not be recorded twice. Retry with `utterance: ""` (carry on), not by repeating the answer.
- A turn makes up to 4 model calls (the reply, plus up to 3 rounds of tool results). Text from before and after a tool call is separated by a space delta.

If the browser closes the stream early the server finishes the turn and stores it.

### Styles and tools

- `oral_quiz`: the coach asks bank questions one at a time (`get_next_question`), always records the student's answer (`record_answer`, graded on the server) before giving feedback, and gives hints (`get_hint`) on request. Expect `question` then `text`, then after the student answers `evaluation` then `text`.
- `guided_notes`: conversational walk through the topic notes. Tools only if the student asks for a practice question.
- `topic_conversation`: free conversation, no tools, only `text` events.
- `sprint` mode: questions come from the 3 weakest topics (max 12).

### Client helpers

`frontend/src/lib/voice/turn-client.ts` (no React):

```ts
import { readVoiceEvents, parseVoiceEvent, createSentenceChunker, isTerminal, type VoiceEvent } from '@/lib/voice/turn-client'

const res = await fetch('/api/voice/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, utterance }), signal })
if (!res.ok) { const { error } = await res.json(); /* error.details.code, error.message */ }
const chunker = createSentenceChunker()          // { minChars?: number }
for await (const event of readVoiceEvents(res.body!)) {
  if (event.type === 'text') for (const sentence of chunker.push(event.delta)) speak(sentence)
  else if (event.type === 'done' || event.type === 'error') for (const sentence of chunker.flush()) speak(sentence)
  // question / evaluation / hint / session_complete update the UI
}
```

`createSentenceChunker().push(delta)` returns the sentences that are complete. A sentence ends at `.` `!` `?` followed by a space and the next word, or at a newline. It does not split decimals (`3.14`), abbreviations (`Dr.`, `e.g.`, `vs.`), initials, or before a lower-case word. A sentence is released only once the next one starts, so call `flush()` on `done` / `error` / cancel to get the tail. `minChars` merges very short sentences into the next one if the voice sounds choppy.

## Recommended browser flow

1. Check `window.SpeechRecognition || window.webkitSpeechRecognition` and `window.speechSynthesis`. Without recognition (Firefox) show a text input and send what is typed; the rest of the flow is the same. Without synthesis, show the coach text only.
2. `GET /api/voice/usage`, show the minutes left. Create the session (`POST /api/voice/session`), handle 422 `requiresGeneration`.
3. Start the heartbeat (30 s) and call `turn('')` for the greeting.
4. Recognition: `continuous = true`, `interimResults = true`, `lang` from the session language. Show interim text live. Treat the transcript as final when the recognizer marks it final and then ~800 ms of silence passes with no new result; only then send `turn(text)`. Join the final segments of one utterance into one string. Ignore empty or very short transcripts (noise).
5. While the student speaks, do not run `speechSynthesis`. Pause recognition while the coach is speaking (or keep it on and drop results that arrive during playback) so the coach does not hear itself; on devices with good echo cancellation keep it on for barge-in.
6. Speak each sentence from the chunker with `speechSynthesis.speak(new SpeechSynthesisUtterance(sentence))` as soon as it arrives, so speech starts on the first sentence while the rest is still being written. Queue them; wait for the queue to drain before resuming recognition. Pick a voice that matches the session language.
7. Barge-in: when the recognizer produces speech while the coach is talking, call `speechSynthesis.cancel()`, abort the in-flight `fetch` with `AbortController` (the server still finishes and saves the turn, so wait for it to settle before the next `turn`, or expect one 409 `TURN_IN_PROGRESS` and retry), clear the chunker, and `PATCH { incrementInterruptCount: 1 }`.
8. Show a question card on `question`, an evaluation card on `evaluation`, and keep a transcript of student and coach text. On `session_complete`, show the summary after the coach finishes speaking.
9. Idle handling: if the student says nothing for a while, call `turn('')` once to let the coach nudge them, or end the session after ~2 minutes. Chrome's recognizer stops by itself after silence, so restart it in its `onend` while the session is open.
10. Leaving: stop recognition, `speechSynthesis.cancel()`, `PATCH { status: 'ended' }`.

Never send two turns at once for a session. On a retryable `error`, offer "try again" which re-sends the same utterance (or `''` if tools ran, see above). Do not retry non-retryable codes (`LLM_DAILY_BUDGET`, `SESSION_ENDED`, `VOICE_DAILY_LIMIT`, `LLM_REFUSED`).

## Server notes (for reference)

- Model: the AI service `POST /voice/turn` calls the fast tier (`ANTHROPIC_FAST_MODEL`, Haiku) at low effort with max 800 tokens, streaming, tool choice auto. One `llm_usage_events` row (source `voice`, source id = session id) is written per call and counts toward `DAILY_LLM_BUDGET_USD`.
- Prompt: built on the server each turn from the session (style, language, focus), the topic name and description, up to 6000 characters of the topic's notes (sprint: the topic names).
- `LLM_PROVIDER=mock` gives a scripted coach (asks the first question, records the next message as the answer) with no API key.
- Rate limits are in memory per server instance: 30 turns a minute per user, 30 graded answers a minute per user.
