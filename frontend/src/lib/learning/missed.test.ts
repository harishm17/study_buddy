import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  focusFromConcepts,
  missedConcepts,
  missedQuestions,
  pickPrerequisite,
  questionKey,
  questionSetKey,
  reviewDifficulty,
  type AttemptForReview,
} from './missed'

const q = (text: string, concepts: string[] = []) => ({
  question_type: 'true_false',
  question_text: text,
  correct_answer: true,
  explanation: 'x',
  concepts_tested: concepts,
})

const results = (...correct: boolean[]) =>
  Object.fromEntries(correct.map((isCorrect, index) => [String(index), { isCorrect, pointsEarned: isCorrect ? 1 : 0, pointsPossible: 1 }]))

const attempt = (questions: ReturnType<typeof q>[], ...correct: boolean[]): AttemptForReview => ({ questions, results: results(...correct) })

test('the questions got wrong in the last two attempts are the ones to retry', () => {
  const newest = attempt([q('A'), q('B'), q('C')], true, false, false)
  const older = attempt([q('D'), q('E')], false, true)
  const missed = missedQuestions([newest, older])
  assert.deepEqual(missed.map((item) => item.question.question_text), ['B', 'C', 'D'])
})

test('only the last two attempts count', () => {
  const missed = missedQuestions([attempt([q('A')], true), attempt([q('B')], true), attempt([q('Old miss')], false)])
  assert.deepEqual(missed, [])
})

test('a question missed first and answered right later is no longer missed', () => {
  const newest = attempt([q('Same question'), q('Other')], true, true)
  const older = attempt([q('same  QUESTION'), q('Third')], false, false)
  assert.deepEqual(missedQuestions([newest, older]).map((item) => item.question.question_text), ['Third'])
})

test('a question answered right first and missed later is missed', () => {
  const newest = attempt([q('Q')], false)
  const older = attempt([q('Q')], true)
  assert.deepEqual(missedQuestions([newest, older]).map((item) => item.question.question_text), ['Q'])
})

test('a question missed twice appears once', () => {
  const missed = missedQuestions([attempt([q('Q')], false), attempt([q('Q')], false)])
  assert.equal(missed.length, 1)
})

test('nothing is returned when the last two attempts were perfect, or there are none', () => {
  assert.deepEqual(missedQuestions([attempt([q('A'), q('B')], true, true)]), [])
  assert.deepEqual(missedQuestions([]), [])
})

test('the retry quiz is capped', () => {
  const questions = Array.from({ length: 14 }, (_, index) => q(`Question ${index}`))
  const wrong = attempt(questions, ...questions.map(() => false))
  assert.equal(missedQuestions([wrong]).length, 10)
  assert.equal(missedQuestions([wrong], 3).length, 3)
})

test('questions with no text are skipped, and old results stored as plain booleans still count', () => {
  const blank = attempt([q('   ')], false)
  assert.deepEqual(missedQuestions([blank]), [])
  const old: AttemptForReview = { questions: [q('Legacy')], results: { '0': false } }
  assert.equal(missedQuestions([old]).length, 1)
})

test('question keys ignore case and spacing', () => {
  assert.equal(questionKey(q('  What   IS x? ')), 'what is x?')
  assert.equal(questionSetKey([q('B'), q('a')]), questionSetKey([q('A'), q('b')]))
})

test('the concepts of the missed questions are listed once each', () => {
  const missed = missedQuestions([
    attempt([q('A', ['Bayes rule', 'Priors']), q('B', ['bayes rule', ' Likelihood '])], false, false),
  ])
  assert.deepEqual(missedConcepts(missed), ['Bayes rule', 'Priors', 'Likelihood'])
  assert.deepEqual(missedConcepts(missed, 2), ['Bayes rule', 'Priors'])
  assert.deepEqual(missedConcepts([]), [])
})

test('the focus text names the concepts and fits the limit', () => {
  assert.equal(focusFromConcepts(['Bayes rule', 'Priors']), 'Concepts you missed: Bayes rule; Priors')
  assert.equal(focusFromConcepts([]), null)
  const long = Array.from({ length: 30 }, (_, index) => `A fairly long concept name number ${index}`)
  const focus = focusFromConcepts(long) as string
  assert.ok(focus.length <= 280)
  assert.ok(focus.startsWith('Concepts you missed: A fairly long concept name number 0'))
  assert.ok(!focus.endsWith(';'))
})

test('review difficulty follows mastery: under 0.4 easy, under 0.75 medium, else hard', () => {
  assert.equal(reviewDifficulty(0), 'easy')
  assert.equal(reviewDifficulty(0.39), 'easy')
  assert.equal(reviewDifficulty(0.4), 'medium')
  assert.equal(reviewDifficulty(0.74), 'medium')
  assert.equal(reviewDifficulty(0.75), 'hard')
  assert.equal(reviewDifficulty(1), 'hard')
  assert.equal(reviewDifficulty(null), 'easy')
  assert.equal(reviewDifficulty(undefined), 'easy')
})

test('the prerequisite to review from is the weakest one', () => {
  assert.equal(pickPrerequisite([]), null)
  assert.deepEqual(pickPrerequisite([{ id: 'a', mastery: 0.9 }, { id: 'b', mastery: 0.3 }, { id: 'c', mastery: null }]), { id: 'c', mastery: null })
  assert.equal(pickPrerequisite([{ id: 'a', mastery: 0.9 }, { id: 'b', mastery: 0.3 }])?.id, 'b')
})
