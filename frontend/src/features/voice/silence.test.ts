import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUtteranceCollector,
  idleAction,
  isEcho,
  isSpeakable,
  joinTranscripts,
  type SpeechResult,
  type Timers,
} from './silence'

/** A clock the test moves by hand. */
function fakeTimers() {
  let now = 0
  let nextId = 1
  const scheduled = new Map<number, { at: number; fn: () => void }>()
  const timers: Timers = {
    set(fn, ms) {
      const id = nextId++
      scheduled.set(id, { at: now + ms, fn })
      return id
    },
    clear(handle) {
      scheduled.delete(handle as number)
    },
  }
  return {
    timers,
    pending: () => scheduled.size,
    advance(ms: number) {
      const target = now + ms
      while (true) {
        const due = [...scheduled.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        now = due[1].at
        scheduled.delete(due[0])
        due[1].fn()
      }
      now = target
    },
  }
}

const final = (transcript: string): SpeechResult => ({ transcript, isFinal: true })
const interim = (transcript: string): SpeechResult => ({ transcript, isFinal: false })

function setup() {
  const clock = fakeTimers()
  const commits: string[] = []
  const interims: string[] = []
  const collector = createUtteranceCollector({
    timers: clock.timers,
    onCommit: (text) => commits.push(text),
    onInterim: (text) => interims.push(text),
  })
  return { clock, commits, interims, collector }
}

describe('createUtteranceCollector', () => {
  it('commits a final result after 800 ms of silence, not before', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('a hash function maps keys')])
    clock.advance(799)
    assert.deepEqual(commits, [])
    clock.advance(1)
    assert.deepEqual(commits, ['a hash function maps keys'])
  })

  it('restarts the wait when a new result arrives and joins the final segments', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('a hash function')])
    clock.advance(600)
    collector.update([final('a hash function'), final('maps a key to a bucket')])
    clock.advance(600)
    assert.deepEqual(commits, [])
    clock.advance(200)
    assert.deepEqual(commits, ['a hash function maps a key to a bucket'])
  })

  it('waits while the recognizer still reports interim text', () => {
    const { clock, commits, interims, collector } = setup()
    collector.update([final('because it visits'), interim('nodes in order')])
    clock.advance(1500)
    assert.deepEqual(commits, [])
    assert.equal(interims.at(-1), 'because it visits nodes in order')
    collector.update([final('because it visits nodes in order')])
    clock.advance(800)
    assert.deepEqual(commits, ['because it visits nodes in order'])
  })

  it('commits an interim result that never finalises, after the stale wait', () => {
    const { clock, commits, collector } = setup()
    collector.update([interim('stuck phrase')])
    clock.advance(2499)
    assert.deepEqual(commits, [])
    clock.advance(1)
    assert.deepEqual(commits, ['stuck phrase'])
  })

  it('does not commit the same words twice and keeps counting from the committed length', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('first answer')])
    clock.advance(800)
    collector.update([final('first answer'), final('second answer')])
    clock.advance(800)
    assert.deepEqual(commits, ['first answer', 'second answer'])
  })

  it('drops noise: empty, one character, or no letters', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('  ')])
    clock.advance(2000)
    collector.update([final('a')])
    clock.advance(2000)
    collector.update([final('a'), final('...')])
    clock.advance(2000)
    assert.deepEqual(commits, [])
    assert.equal(clock.pending(), 0)
  })

  it('skip forgets what was heard (the coach echo) and cancels the timer', () => {
    const { clock, commits, interims, collector } = setup()
    const results = [final('that is right')]
    collector.update(results)
    collector.skip(results)
    clock.advance(2000)
    assert.deepEqual(commits, [])
    assert.equal(interims.at(-1), '')
    assert.equal(collector.peek(results), '')
    collector.update([...results, final('my real answer')])
    clock.advance(800)
    assert.deepEqual(commits, ['my real answer'])
  })

  it('flush commits right away, reset starts the result list again from zero', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('half a thought')])
    collector.flush()
    assert.deepEqual(commits, ['half a thought'])
    collector.reset()
    collector.update([final('after a restart')])
    clock.advance(800)
    assert.deepEqual(commits, ['half a thought', 'after a restart'])
  })

  it('peek shows only the uncommitted words', () => {
    const { collector, clock } = setup()
    const first = [final('one two')]
    collector.update(first)
    clock.advance(800)
    assert.equal(collector.peek(first), '')
    assert.equal(collector.peek([...first, interim('three')]), 'three')
  })

  it('dispose cancels a pending commit', () => {
    const { clock, commits, collector } = setup()
    collector.update([final('never sent')])
    collector.dispose()
    clock.advance(5000)
    assert.deepEqual(commits, [])
  })
})

describe('helpers', () => {
  it('joinTranscripts trims and collapses spaces', () => {
    assert.equal(joinTranscripts([' hello ', '', 'big   world ']), 'hello big world')
  })

  it('isSpeakable needs a letter or digit and enough characters', () => {
    assert.equal(isSpeakable('ok'), true)
    assert.equal(isSpeakable('7'), false)
    assert.equal(isSpeakable('7', 1), true)
    assert.equal(isSpeakable('?!'), false)
    assert.equal(isSpeakable('   '), false)
  })
})

describe('isEcho', () => {
  const spoken = 'Right. Each level is one step further from the start, so BFS finds the shortest path.'

  it('spots a fragment of the coach text', () => {
    assert.equal(isEcho('each level is one step', spoken), true)
    assert.equal(isEcho('Shortest path.', spoken), true)
  })

  it('spots a slightly garbled copy', () => {
    assert.equal(isEcho('each level is a step further from start so bfs finds shortest path', spoken), true)
  })

  it('lets a real interruption through', () => {
    assert.equal(isEcho('wait can you repeat the question', spoken), false)
    assert.equal(isEcho('stop', spoken), false)
  })

  it('is not an echo with nothing spoken or nothing heard', () => {
    assert.equal(isEcho('hello there', ''), false)
    assert.equal(isEcho('', spoken), false)
  })
})

describe('idleAction', () => {
  it('nudges a silent voice student once, then ends', () => {
    assert.equal(idleAction({ inputMode: 'voice', idleMs: 10_000, nudged: false }), 'none')
    assert.equal(idleAction({ inputMode: 'voice', idleMs: 45_000, nudged: false }), 'nudge')
    assert.equal(idleAction({ inputMode: 'voice', idleMs: 60_000, nudged: true }), 'none')
    assert.equal(idleAction({ inputMode: 'voice', idleMs: 75_000, nudged: true }), 'end')
  })

  it('gives a typing student ten minutes and never nudges', () => {
    assert.equal(idleAction({ inputMode: 'text', idleMs: 120_000, nudged: false }), 'none')
    assert.equal(idleAction({ inputMode: 'text', idleMs: 600_000, nudged: false }), 'end')
  })
})
