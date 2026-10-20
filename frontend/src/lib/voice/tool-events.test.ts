import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { eventsForToolOutput } from './tool-events'
import { VOICE_TOOLS } from './tools'

describe('eventsForToolOutput', () => {
  it('a question becomes a question event with options for multiple choice', () => {
    const events = eventsForToolOutput(
      'get_next_question',
      {
        done: false,
        question_index: 3,
        question: {
          question_text: 'Which?',
          question_type: 'multiple_choice',
          options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }],
          concepts_tested: ['x'],
        },
      },
      10
    )
    assert.deepEqual(events, [
      {
        type: 'question',
        index: 3,
        total: 10,
        text: 'Which?',
        questionType: 'multiple_choice',
        options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }],
      },
    ])
  })

  it('a question with no options has no options key, and never carries the answer key', () => {
    const [event] = eventsForToolOutput(
      'get_next_question',
      { done: false, question_index: 0, question: { question_text: 'Why?', question_type: 'conceptual', options: [] } },
      4
    )
    assert.ok(event && !('options' in event))
    assert.deepEqual(Object.keys(event).sort(), ['index', 'questionType', 'text', 'total', 'type'])
  })

  it('a finished drill becomes session_complete, from either tool', () => {
    assert.deepEqual(eventsForToolOutput('get_next_question', { done: true, message: 'Drill complete.' }, 4), [{ type: 'session_complete' }])
    assert.deepEqual(eventsForToolOutput('record_answer', { done: true, message: 'Drill complete.' }, 4), [{ type: 'session_complete' }])
  })

  it('a graded answer becomes an evaluation', () => {
    assert.deepEqual(
      eventsForToolOutput('record_answer', { is_correct: true, score: 0.8, feedback: { comment: 'Nice', explanation: 'Because' } }, 4),
      [{ type: 'evaluation', isCorrect: true, score: 0.8, comment: 'Nice', explanation: 'Because' }]
    )
  })

  it('an ungraded answer is flagged', () => {
    const [event] = eventsForToolOutput(
      'record_answer',
      { is_correct: false, score: 0, feedback: { comment: 'No key', explanation: '', ungraded: true } },
      4
    )
    assert.equal(event.type === 'evaluation' && event.ungraded, true)
  })

  it('a hint becomes a hint event', () => {
    assert.deepEqual(eventsForToolOutput('get_hint', { hint: 'Think', concepts: [], note: 'n' }, 4), [{ type: 'hint', text: 'Think' }])
  })

  it('errors and unknown tools produce no events', () => {
    assert.deepEqual(eventsForToolOutput('record_answer', { error: 'Grading is unavailable' }, 4), [])
    assert.deepEqual(eventsForToolOutput('get_hint', { error: 'Question not found' }, 4), [])
    assert.deepEqual(eventsForToolOutput('mystery', { hint: 'x' }, 4), [])
  })
})

describe('VOICE_TOOLS', () => {
  it('are the three drill tools, with no session id for the model to supply', () => {
    assert.deepEqual(VOICE_TOOLS.map((tool) => tool.name), ['get_next_question', 'record_answer', 'get_hint'])
    for (const tool of VOICE_TOOLS) {
      assert.equal(tool.input_schema.type, 'object')
      assert.ok(!('session_id' in tool.input_schema.properties))
      assert.ok(tool.description.length > 20)
    }
    assert.deepEqual(VOICE_TOOLS[1].input_schema.required, ['question_index', 'user_answer'])
  })
})
