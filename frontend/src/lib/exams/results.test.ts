import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestionResults, displayStudentAnswer, readOverall, summarizeTopics } from './results'

const questions = [
  {
    question_type: 'multiple_choice',
    question_text: 'Pick',
    topic_id: 't1',
    topic_name: 'Stacks',
    points: 2,
    options: [
      { id: 'A', text: 'one' },
      { id: 'B', text: 'two' },
    ],
    correct_answer: 'B',
  },
  {
    question_type: 'short_answer',
    question_text: 'Explain a queue',
    topic_id: 't2',
    topic_name: 'Queues',
    points: 4,
    sample_answer: 'First in, first out.',
    key_points: ['FIFO'],
  },
  {
    question_type: 'numerical',
    question_text: 'How many?',
    topic_id: 't1',
    topic_name: 'Stacks',
    points: 2,
    unit: 'm',
    correct_answer: 9.8,
  },
  { question_type: 'true_false', question_text: 'Is it?', points: 1, correct_answer: true },
]

const grading = {
  overall_score: 37.5,
  earned_points: 3,
  total_points: 8,
  graded_questions: [
    { question_index: 0, points_possible: 2, points_earned: 2, is_correct: true, feedback: 'Correct!' },
    {
      question_index: 1,
      points_possible: 4,
      points_earned: 0,
      is_correct: false,
      needs_review: true,
      feedback: 'This answer could not be graded automatically.',
    },
    { question_index: 2, points_possible: 2, points_earned: 1, is_correct: false, feedback: 'Close.' },
  ],
}

const answers = { '0': 'B', '1': 'LIFO', '2': 9.5 }

test('each question gets its answer, the key, points and feedback', () => {
  const results = buildQuestionResults(questions, grading, answers)
  assert.equal(results.length, 4)
  assert.equal(results[0].studentAnswer, 'B. two')
  assert.equal(results[0].correctAnswer, 'B. two')
  assert.equal(results[0].feedback, 'Correct!')
  assert.equal(results[1].correctAnswer, 'First in, first out.')
  assert.equal(results[1].needsReview, true)
  assert.equal(results[2].studentAnswer, '9.5 m')
  assert.equal(results[2].correctAnswer, '9.8 m')
})

test('an unanswered or ungraded question shows no answer and zero points', () => {
  const results = buildQuestionResults(questions, grading, answers)
  assert.equal(results[3].studentAnswer, null)
  assert.equal(results[3].pointsEarned, 0)
  assert.equal(results[3].points, 1)
  assert.equal(results[3].correctAnswer, 'True')
  assert.equal(results[3].isCorrect, false)
})

test('malformed stored data gives an empty list instead of throwing', () => {
  assert.deepEqual(buildQuestionResults(null, null, null), [])
  assert.equal(buildQuestionResults([{ question_text: 'x' }], 'nonsense', []).length, 1)
})

test('weak topics are sorted weakest first with per-topic points', () => {
  const topics = summarizeTopics(buildQuestionResults(questions, grading, answers))
  assert.deepEqual(
    topics.map((topic) => [topic.topicName, topic.pointsEarned, topic.pointsPossible, topic.percent]),
    [
      ['Queues', 0, 4, 0],
      ['Stacks', 3, 4, 75],
    ]
  )
})

test('topics tied on score list the one with more points at stake first', () => {
  const topics = summarizeTopics([
    { topicId: 'a', topicName: 'A', points: 2, pointsEarned: 1 },
    { topicId: 'b', topicName: 'B', points: 6, pointsEarned: 3 },
  ] as never)
  assert.deepEqual(topics.map((topic) => topic.topicName), ['B', 'A'])
})

test('questions without a topic are left out of the topic summary', () => {
  const topics = summarizeTopics(buildQuestionResults([questions[3]], grading, answers))
  assert.deepEqual(topics, [])
})

test('displayStudentAnswer formats by question type', () => {
  assert.equal(displayStudentAnswer({ question_type: 'true_false' }, false), 'False')
  assert.equal(displayStudentAnswer({ question_type: 'true_false' }, true), 'True')
  assert.equal(displayStudentAnswer({ question_type: 'short_answer' }, '   '), null)
  assert.equal(displayStudentAnswer({ question_type: 'multiple_choice', options: [] }, 'C'), 'C')
})

test('readOverall reads the stored score', () => {
  assert.deepEqual(readOverall(grading), { score: 37.5, earned: 3, total: 8 })
  assert.equal(readOverall({}), null)
  assert.equal(readOverall(null), null)
})
