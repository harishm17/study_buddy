import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlan, type PlanItem, type PlanTopic } from './plan'
import { dayLabel, describePlanItem, planItemHref, upNextFromPlan, weekLabel } from './plan-copy'
import { nextActionsFromPlan, setupNextAction } from './next-actions'

const item = (over: Partial<PlanItem>): PlanItem => ({
  id: 'x',
  kind: 'learn',
  date: '2026-10-21',
  title: 'Learn Graph traversal',
  topicId: 't1',
  unitId: null,
  topicIds: ['t1'],
  minutes: 35,
  done: false,
  part: null,
  note: null,
  projected: false,
  ...over,
})

test('each kind of item links to its action', () => {
  assert.equal(planItemHref(item({}), 'c1'), '/courses/c1/topics/t1')
  assert.equal(planItemHref(item({ kind: 'quiz' }), 'c1'), '/courses/c1/topics/t1?view=quiz')
  assert.equal(planItemHref(item({ kind: 'review' }), 'c1'), '/courses/c1/review#review-t1')
  assert.equal(
    planItemHref(item({ kind: 'unit_mock', topicId: null, topicIds: ['a', 'b', 'c'] }), 'c1'),
    '/courses/c1/exams/new?topics=a,b,c'
  )
  assert.equal(planItemHref(item({ kind: 'full_mock', topicId: null, topicIds: ['a'] }), 'c1'), '/courses/c1/exams/new?topics=all')
})

test('mixed practice and projected reviews link to their actions', () => {
  const mixed = item({ kind: 'mixed', topicId: null, topicIds: ['a', 'b'], title: 'Mixed practice: A and B', minutes: 30 })
  assert.equal(planItemHref(mixed, 'c1'), '/courses/c1/exams/new?topics=a,b')
  const described = describePlanItem(mixed, 'c1')
  assert.equal(described.verb, 'Create')
  assert.match(described.reason, /mixed together/)
  const projected = item({ kind: 'review', projected: true })
  assert.equal(planItemHref(projected, 'c1'), '/courses/c1/topics/t1?view=quiz')
  assert.match(describePlanItem(projected, 'c1').reason, /spaced review/)
  assert.equal(nextActionsFromPlan(planFor([topic('a', { orderIndex: 0 })])).length, 1)
})

test('items are described in plain words with a button and a time', () => {
  const learn = describePlanItem(item({ part: { number: 1, of: 2 }, minutes: 45 }), 'c1')
  assert.equal(learn.verb, 'Start')
  assert.equal(learn.etaLabel, 'About 45 min')
  assert.equal(learn.partLabel, 'Part 1 of 2')
  assert.equal(describePlanItem(item({ note: 'You have started this one' }), 'c1').verb, 'Continue')
  assert.match(describePlanItem(item({ note: 'On past exams' }), 'c1').reason, /past exams/)
  assert.equal(describePlanItem(item({ kind: 'quiz' }), 'c1').verb, 'Take quiz')
  assert.equal(describePlanItem(item({ kind: 'review', note: 'Overdue by 2 days' }), 'c1').reason, 'Overdue by 2 days')
  assert.equal(describePlanItem(item({ kind: 'review' }), 'c1').reason, 'Due for review.')
  for (const kind of ['learn', 'quiz', 'review', 'mixed', 'unit_mock', 'full_mock'] as const) {
    const described = describePlanItem(item({ kind }), 'c1')
    assert.doesNotMatch(`${described.title} ${described.reason} ${described.verb}`, /generate|\$|undefined|null/i, kind)
  }
})

test('day and week labels do not depend on a time zone', () => {
  assert.equal(dayLabel('2026-10-21'), 'Wed, Oct 21')
  assert.equal(dayLabel('2026-10-21', { long: true }), 'Wednesday, Oct 21')
  assert.equal(dayLabel('2026-12-01'), 'Tue, Dec 1')
  assert.equal(weekLabel('2026-10-19'), 'Oct 19 to Oct 25')
  assert.equal(weekLabel('2026-10-26'), 'Oct 26 to Nov 1')
})

const topic = (id: string, over: Partial<PlanTopic> = {}): PlanTopic => ({
  id,
  name: id,
  unitId: null,
  orderIndex: 0,
  prerequisiteIds: [],
  estimatedMinutes: 35,
  examRelevant: false,
  learned: false,
  started: false,
  quizzed: false,
  mastery: null,
  reviewDueAt: null,
  learnedToday: false,
  ...over,
})

const planFor = (topics: PlanTopic[], doneToday: Parameters<typeof buildPlan>[0]['doneToday'] = []) =>
  buildPlan({
    now: new Date('2026-10-21T15:00:00Z'),
    timeZone: 'UTC',
    examDate: null,
    dailyMinutes: 45,
    topics,
    units: [],
    unitMocksDone: [],
    fullMocksDoneInFinalWeek: 0,
    doneToday,
  })

test("Up next is today's items still to do, and done items are kept apart", () => {
  const plan = planFor(
    [topic('a', { orderIndex: 0, learned: true, learnedToday: true }), topic('b', { orderIndex: 1 })],
    [{ kind: 'learn', topicId: 'a' }]
  )
  const data = upNextFromPlan(plan, 'c1')
  assert.deepEqual(data.doneToday.map((entry) => entry.title), ['Learn a'])
  assert.deepEqual(data.upNext, [])
  // Today is full (35 done of 45): b is tomorrow.
  assert.equal(data.later?.item.title, 'Quiz: a')
  assert.equal(data.later?.date, '2026-10-22')
})

test('Up next is empty with nothing planned', () => {
  const plan = planFor([topic('a', { learned: true, quizzed: true, mastery: 0.9 })])
  assert.deepEqual(upNextFromPlan(plan, 'c1'), { upNext: [], doneToday: [], later: null })
})

test('the next-actions API lists today\'s items in order, and the setup step before that', () => {
  const plan = planFor([topic('a', { orderIndex: 0 }), topic('b', { orderIndex: 1 })])
  const actions = nextActionsFromPlan(plan)
  assert.deepEqual(actions.map((action) => [action.type, action.topicId, action.etaMinutes, action.priority]), [['study_topic', 'a', 35, 0]])
  assert.equal(setupNextAction('c1', { mode: 'active', step: null, label: null }, 3), null)
  assert.equal(setupNextAction('c1', { mode: 'setup', step: 1, label: 'x' }, 0)?.type, 'upload_materials')
  assert.equal(setupNextAction('c1', { mode: 'setup', step: 2, label: 'x' }, 0)?.type, 'extract_topics')
  assert.equal(setupNextAction('c1', { mode: 'setup', step: 2, label: 'x' }, 4)?.type, 'confirm_topics')
  assert.equal(setupNextAction('c1', { mode: 'setup', step: 3, label: 'x' }, 4), null)
})
