import { localDateParts } from './study-plan-time'

/**
 * The study plan: a deterministic, pure computation (no database, no model, no clock of its own).
 * It lays the work that is left out over the days from today to the exam date, or over a rolling
 * 14 days when there is no exam date. It is recomputed from the student's state on every load, so
 * "done" always comes from real progress and the plan never drifts from what happened.
 *
 * What goes where, in the order it is placed on each day:
 *   - Mock exams. One after each unit that is fully learned (units with 3 or more topics), and two
 *     full mock exams in the final week, the second at least 2 days before the exam. They are always
 *     placed, even when they are longer than the day's time.
 *   - Reviews at the review schedule's due day (overdue ones today) and the first quiz the day after
 *     a topic is learned. These come before new learning; whatever does not fit moves to the next day.
 *   - Learn blocks, in course order but never before a prerequisite, each `estimatedMinutes` long
 *     (35 when unknown), packed into the daily minutes. A block may run a little over (15% of the
 *     day) rather than wait, and one that is longer than a whole day is split across days (parts of
 *     at least 15 minutes).
 *   - The last 2 days (the day before the exam and the exam day) hold only reviews of the weakest topics.
 *
 * When the exam is too close for everything to fit, the plan says so and chooses: the optional unit
 * mock exams are dropped, then topics that appear on past exams come first, then course order. Topics
 * that still do not fit are listed as not scheduled; nothing is dropped silently.
 */

export const DEFAULT_TOPIC_MINUTES = 35
export const REVIEW_MINUTES = 10
export const QUIZ_MINUTES = 15
export const UNIT_MOCK_MINUTES = 30
export const FULL_MOCK_MINUTES = 60
/** A topic is only split across days into parts of at least this long. */
export const MIN_PART_MINUTES = 15
/** A whole learn block may run this share of the daily minutes over, rather than be split in two. */
export const OVERRUN_SHARE = 0.15
export const ROLLING_DAYS = 14
/** The longest stretch laid out, however far away the exam is. */
export const MAX_PLAN_DAYS = 120
export const MIN_DAILY_MINUTES = 10
export const MAX_DAILY_MINUTES = 600
export const UNIT_MOCK_MIN_TOPICS = 3

export type PlanTopic = {
  id: string
  name: string
  unitId: string | null
  orderIndex: number
  /** Topics (same course) to learn first. */
  prerequisiteIds: string[]
  estimatedMinutes: number | null
  /** The topic's concepts appear on the student's past exams. */
  examRelevant: boolean
  /** Notes and worked examples are both finished. */
  learned: boolean
  /** One of them is finished. */
  started: boolean
  /** The quiz has been taken at least once. */
  quizzed: boolean
  /** Displayed mastery (0..1) or null with no signal yet. */
  mastery: number | null
  /** When the next review is due, from the review schedule. */
  reviewDueAt: Date | null
  /** The topic's learning was finished today (it is quizzed tomorrow, not today). */
  learnedToday: boolean
}

export type PlanUnit = { id: string; title: string; weekLabel: string | null; orderIndex: number }

/** Something finished today, shown ticked on today's list and taking its time out of today. */
export type DoneToday =
  | { kind: 'learn' | 'quiz' | 'review'; topicId: string }
  | { kind: 'mock'; examId: string; name: string }

export type PlanInput = {
  now: Date
  /** The student's IANA time zone: days are their days. */
  timeZone: string
  /** The exam date as YYYY-MM-DD (a calendar date), or null for a rolling two weeks. */
  examDate: string | null
  dailyMinutes: number
  /** The confirmed topics of the course. */
  topics: PlanTopic[]
  units: PlanUnit[]
  /** Units whose topics a mock exam already covered, so no unit mock is planned. */
  unitMocksDone: string[]
  /** Full mock exams already taken in the final week (the 7 days up to the exam), today's included. */
  fullMocksDoneInFinalWeek: number
  doneToday: DoneToday[]
}

export type PlanItemKind = 'learn' | 'quiz' | 'review' | 'unit_mock' | 'full_mock'

export type PlanItem = {
  id: string
  kind: PlanItemKind
  /** YYYY-MM-DD. */
  date: string
  title: string
  topicId: string | null
  unitId: string | null
  /** The topics a mock exam covers. */
  topicIds: string[]
  minutes: number
  done: boolean
  /** A learn block split across days: "part 1 of 2". */
  part: { number: number; of: number } | null
  /** A short qualifier: "Overdue", "Weakest topic", "On past exams". */
  note: string | null
}

export type PlanDay = {
  /** YYYY-MM-DD. */
  date: string
  isToday: boolean
  isExamDay: boolean
  /** The last 2 days before the exam, which hold reviews of the weakest topics only. */
  isFinalReview: boolean
  items: PlanItem[]
  /** Minutes of work still to do, and minutes already done today. */
  minutes: number
  doneMinutes: number
}

export type PlanStatus = 'ready' | 'no_topics' | 'exam_passed'

export type Plan = {
  status: PlanStatus
  /** Today's date in the student's time zone, YYYY-MM-DD. */
  today: string
  mode: 'exam' | 'rolling'
  examDate: string | null
  /** Whole days from today to the exam (0 on the exam day), or null without a date. */
  daysToExam: number | null
  dailyMinutes: number
  days: PlanDay[]
  /** The exam is too close to learn everything. */
  short: boolean
  /** Plain words for the short-time warning, or null. */
  shortMessage: string | null
  /** The optional unit mock exams were left out to make room for topics. */
  unitMocksSkipped: boolean
  /** Topics that are not in the plan, with why. Null when everything is scheduled. */
  notScheduled: { reason: 'short' | 'later'; topics: { id: string; name: string }[] } | null
  /** Why fewer than two full mock exams were planned, or null. */
  mockNote: string | null
  /** Learning left: topics and minutes (before scheduling). */
  remaining: { topics: number; minutes: number }
}

// ---------------------------------------------------------------------------------------
// Days

const DAY_MS = 24 * 60 * 60 * 1000
const pad = (value: number) => String(value).padStart(2, '0')

const dayToUtc = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}
const utcToDay = (ms: number): string => {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** The calendar date it is at `instant` in `timeZone`, as YYYY-MM-DD. */
export function localDay(instant: Date, timeZone: string): string {
  const { year, month, day } = localDateParts(instant, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

export const addDays = (day: string, count: number): string => utcToDay(dayToUtc(day) + count * DAY_MS)

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number => Math.round((dayToUtc(to) - dayToUtc(from)) / DAY_MS)

/** The Monday of the week a day is in. */
export function weekStart(day: string): string {
  const weekday = new Date(dayToUtc(day)).getUTCDay() // 0 is Sunday
  return addDays(day, -((weekday + 6) % 7))
}

export const isDayString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return utcToDay(dayToUtc(value)) === value
}

// ---------------------------------------------------------------------------------------
// Building blocks

const clampMinutes = (value: number) =>
  Math.min(MAX_DAILY_MINUTES, Math.max(MIN_DAILY_MINUTES, Math.round(Number.isFinite(value) ? value : 45)))

const roundUp5 = (minutes: number) => Math.max(10, Math.ceil(minutes / 5) * 5)

/** Minutes of learning a topic still needs: all of it, half when one of notes and examples is done, none when learned. */
export function learnMinutesLeft(topic: Pick<PlanTopic, 'estimatedMinutes' | 'learned' | 'started'>): number {
  if (topic.learned) return 0
  const total = topic.estimatedMinutes && topic.estimatedMinutes > 0 ? topic.estimatedMinutes : DEFAULT_TOPIC_MINUTES
  return topic.started ? roundUp5(total / 2) : roundUp5(total)
}

/**
 * The order to learn topics in. Course order, except that a topic never comes before an unlearned
 * prerequisite. With `examFirst`, topics on past exams (and what they need first) come before the
 * rest, each group in course order.
 */
export function learnOrder(topics: PlanTopic[], options: { examFirst: boolean }): PlanTopic[] {
  const byId = new Map(topics.map((topic) => [topic.id, topic]))
  const todo = topics.filter((topic) => !topic.learned).sort((a, b) => a.orderIndex - b.orderIndex)
  const todoIds = new Set(todo.map((topic) => topic.id))
  const rank = (topic: PlanTopic) => (options.examFirst && topic.examRelevant ? 0 : 1)
  const candidates = [...todo].sort((a, b) => rank(a) - rank(b) || a.orderIndex - b.orderIndex)

  const placed = new Set<string>()
  const ordered: PlanTopic[] = []
  // Each topic brings the unlearned prerequisites it needs in front of it (in course order). A
  // cycle, which the course planner never writes, is cut where it closes.
  const place = (topic: PlanTopic, path: Set<string>) => {
    if (placed.has(topic.id) || path.has(topic.id)) return
    path.add(topic.id)
    const needs = topic.prerequisiteIds
      .filter((id) => id !== topic.id && todoIds.has(id))
      .map((id) => byId.get(id) as PlanTopic)
      .sort((a, b) => a.orderIndex - b.orderIndex)
    for (const need of needs) place(need, path)
    path.delete(topic.id)
    placed.add(topic.id)
    ordered.push(topic)
  }
  for (const topic of candidates) place(topic, new Set())
  return ordered
}

type Spaced = {
  kind: 'quiz' | 'review'
  topic: PlanTopic
  /** Day index it is due; later days pick up what did not fit. */
  target: number
  note: string | null
}

type Simulation = {
  days: PlanDay[]
  /** Topics whose learning did not fit before the last learning day, in order. */
  unplaced: PlanTopic[]
  unitMocks: number
  fullMockDays: string[]
  /** A topic was only partly placed: the caller removes it and plays again. */
  partial: PlanTopic | null
}

type SimOptions = {
  dates: string[]
  examDay: string | null
  input: PlanInput
  topics: PlanTopic[]
  order: PlanTopic[]
  unitMocks: boolean
  excluded: Set<string>
  doneMinutes: number
}

const itemId = (kind: PlanItemKind, key: string, date: string, part?: number) =>
  `${kind}:${key}:${date}${part ? `:${part}` : ''}`

function simulate(options: SimOptions): Simulation {
  const { dates, examDay, input, topics, unitMocks, excluded, doneMinutes } = options
  const daily = clampMinutes(input.dailyMinutes)
  const overrun = Math.max(5, Math.round(daily * OVERRUN_SHARE))
  const today = dates[0]
  const orderRank = new Map(topics.map((topic, index) => [topic.id, index]))
  const lastIndex = dates.length - 1

  const examIndex = examDay ? dates.indexOf(examDay) : -1
  // The last two days: the day before the exam and the exam day itself.
  const finalIndexes = new Set<number>()
  if (examIndex >= 0) {
    finalIndexes.add(examIndex)
    if (examIndex - 1 >= 0) finalIndexes.add(examIndex - 1)
  }

  // Full mock exams: the second two days before the exam or earlier, the first three days before that.
  const fullMockIndexes: number[] = []
  if (examIndex >= 0) {
    const needed = Math.max(0, 2 - Math.max(0, input.fullMocksDoneInFinalWeek))
    const second = examIndex - 2
    const first = Math.max(0, examIndex - 5)
    if (needed >= 1 && second >= 0) {
      if (needed >= 2 && first < second) fullMockIndexes.push(first)
      fullMockIndexes.push(second)
    }
  }

  const units = [...input.units].sort((a, b) => a.orderIndex - b.orderIndex)
  const mockUnits = new Map<string, PlanTopic[]>()
  if (unitMocks) {
    for (const unit of units) {
      if (input.unitMocksDone.includes(unit.id)) continue
      const members = topics.filter((topic) => topic.unitId === unit.id)
      if (members.length >= UNIT_MOCK_MIN_TOPICS) mockUnits.set(unit.id, members)
    }
  }

  const fixed = new Map<number, PlanItem[]>()
  const addFixed = (index: number, item: PlanItem) => {
    const list = fixed.get(index) ?? []
    list.push(item)
    fixed.set(index, list)
  }
  const hasUnitMock = (index: number) => (fixed.get(index) ?? []).some((item) => item.kind === 'unit_mock')
  const isFullMockDay = (index: number) => fullMockIndexes.includes(index)
  const allTopicIds = topics.map((topic) => topic.id)
  for (const index of fullMockIndexes) {
    addFixed(index, {
      id: itemId('full_mock', 'course', dates[index]),
      kind: 'full_mock',
      date: dates[index],
      title: 'Full mock exam',
      topicId: null,
      unitId: null,
      topicIds: allTopicIds,
      minutes: FULL_MOCK_MINUTES,
      done: false,
      part: null,
      note: index === fullMockIndexes[fullMockIndexes.length - 1] ? 'Last full practice before the exam' : null,
    })
  }

  /** The first day from `from` on that can hold a unit mock exam, or null. */
  const mockDayFrom = (from: number): number | null => {
    for (let index = Math.max(0, from); index <= lastIndex; index += 1) {
      if (finalIndexes.has(index) || isFullMockDay(index) || hasUnitMock(index)) continue
      return index
    }
    return null
  }
  let unitMockCount = 0
  const placeUnitMock = (unitId: string, from: number) => {
    const members = mockUnits.get(unitId)
    const unit = units.find((item) => item.id === unitId)
    if (!members || !unit) return
    mockUnits.delete(unitId)
    const index = mockDayFrom(from)
    if (index === null) return
    unitMockCount += 1
    addFixed(index, {
      id: itemId('unit_mock', unitId, dates[index]),
      kind: 'unit_mock',
      date: dates[index],
      title: `Mock exam: ${unit.title}`,
      topicId: null,
      unitId,
      topicIds: members.map((topic) => topic.id),
      minutes: UNIT_MOCK_MINUTES,
      done: false,
      part: null,
      note: null,
    })
  }
  // A unit that is already fully learned gets its mock as soon as there is room.
  for (const unit of units) {
    if ((mockUnits.get(unit.id) ?? [null]).every((topic) => topic?.learned)) placeUnitMock(unit.id, 0)
  }

  // Reviews at their due day, first quizzes for what is learned but never quizzed.
  const spaced: Spaced[] = []
  for (const topic of topics) {
    if (topic.reviewDueAt) {
      const dueDay = localDay(topic.reviewDueAt, input.timeZone)
      const gap = daysBetween(today, dueDay)
      spaced.push({
        kind: 'review',
        topic,
        target: Math.max(0, Math.min(lastIndex, gap)),
        note: gap < 0 ? (gap === -1 ? 'Overdue by 1 day' : `Overdue by ${-gap} days`) : null,
      })
    } else if (topic.learned && !topic.quizzed) {
      spaced.push({ kind: 'quiz', topic, target: topic.learnedToday ? Math.min(1, lastIndex) : 0, note: null })
    }
  }

  const queue = options.order.filter((topic) => !excluded.has(topic.id) && !topic.learned)
  const left = new Map(queue.map((topic) => [topic.id, learnMinutesLeft(topic)]))
  const totalMinutes = new Map(queue.map((topic) => [topic.id, learnMinutesLeft(topic)]))
  const partCount = new Map<string, number>()
  const parts = new Map<string, PlanItem[]>()
  // Topics learned now or by an earlier day of the plan.
  const learnedSet = new Set(topics.filter((topic) => topic.learned).map((topic) => topic.id))
  let partial: PlanTopic | null = null

  const days: PlanDay[] = []
  const weakestOrder = (list: PlanTopic[]) =>
    [...list].sort(
      (a, b) =>
        (a.mastery ?? 0) - (b.mastery ?? 0) || (orderRank.get(a.id) ?? 0) - (orderRank.get(b.id) ?? 0)
    )

  for (let index = 0; index <= lastIndex; index += 1) {
    const date = dates[index]
    const items: PlanItem[] = []
    const isToday = index === 0

    if (finalIndexes.has(index)) {
      // Reviews of the weakest topics only: those learned, or learned by the plan.
      const learnedByNow = topics.filter((topic) => learnedSet.has(topic.id))
      const share = Math.min(5, Math.max(1, Math.floor(daily / REVIEW_MINUTES)))
      const count = index === examIndex ? Math.min(2, share) : share
      for (const topic of weakestOrder(learnedByNow).slice(0, count)) {
        items.push({
          id: itemId('review', topic.id, date),
          kind: 'review',
          date,
          title: `Review ${topic.name}`,
          topicId: topic.id,
          unitId: topic.unitId,
          topicIds: [topic.id],
          minutes: REVIEW_MINUTES,
          done: false,
          part: null,
          note: 'One of your weakest topics',
        })
      }
    } else {
      let capacity = daily - (isToday ? doneMinutes : 0)

      for (const mock of fixed.get(index) ?? []) {
        items.push(mock)
        capacity -= mock.minutes
      }

      // Reviews and quizzes due by now, oldest first and weakest first.
      const due = spaced
        .filter((entry) => entry.target <= index)
        .sort(
          (a, b) =>
            a.target - b.target ||
            (a.topic.mastery ?? 0) - (b.topic.mastery ?? 0) ||
            (orderRank.get(a.topic.id) ?? 0) - (orderRank.get(b.topic.id) ?? 0)
        )
      for (const entry of due) {
        const minutes = entry.kind === 'quiz' ? QUIZ_MINUTES : REVIEW_MINUTES
        if (minutes > capacity) continue
        capacity -= minutes
        spaced.splice(spaced.indexOf(entry), 1)
        items.push({
          id: itemId(entry.kind, entry.topic.id, date),
          kind: entry.kind,
          date,
          title: entry.kind === 'quiz' ? `Quiz: ${entry.topic.name}` : `Review ${entry.topic.name}`,
          topicId: entry.topic.id,
          unitId: entry.topic.unitId,
          topicIds: [entry.topic.id],
          minutes,
          done: false,
          part: null,
          note: entry.note,
        })
      }

      // New learning in what is left of the day.
      while (queue.length > 0) {
        const topic = queue[0]
        const need = left.get(topic.id) ?? 0
        if (need <= 0) {
          queue.shift()
          continue
        }
        // The whole topic if it fits; else a part, leaving a remainder that is not tiny.
        let take = 0
        if (need <= capacity + overrun) take = need
        // A block that is shorter than a whole day waits for a day with room; only one longer than a
        // whole day is split, so the plan never cuts a normal topic into scraps.
        else if (need <= daily + overrun) break
        else if (capacity >= MIN_PART_MINUTES) take = need - capacity >= MIN_PART_MINUTES ? capacity : need - MIN_PART_MINUTES
        if (take < MIN_PART_MINUTES && take < need) break

        capacity -= take
        left.set(topic.id, need - take)
        const number = (partCount.get(topic.id) ?? 0) + 1
        partCount.set(topic.id, number)
        const item: PlanItem = {
          id: itemId('learn', topic.id, date, number > 1 || take < need ? number : undefined),
          kind: 'learn',
          date,
          title: `Learn ${topic.name}`,
          topicId: topic.id,
          unitId: topic.unitId,
          topicIds: [topic.id],
          minutes: take,
          done: false,
          part: null,
          note: topic.examRelevant ? 'On past exams' : topic.started ? 'You have started this one' : null,
        }
        items.push(item)
        parts.set(topic.id, [...(parts.get(topic.id) ?? []), item])

        if (take < need) {
          // Out of time for today; the rest continues tomorrow.
          break
        }
        queue.shift()
        learnedSet.add(topic.id)
        // Learned by the plan: its first quiz is the next day.
        if (!topic.reviewDueAt) spaced.push({ kind: 'quiz', topic, target: index + 1, note: null })
        // The last topic of a unit to be learned brings the unit's mock exam, the next day.
        const members = topic.unitId ? mockUnits.get(topic.unitId) : undefined
        if (topic.unitId && members && members.every((member) => learnedSet.has(member.id))) {
          placeUnitMock(topic.unitId, index + 1)
        }
      }
    }

    days.push({
      date,
      isToday,
      isExamDay: index === examIndex,
      isFinalReview: finalIndexes.has(index),
      items,
      minutes: items.reduce((sum, item) => sum + item.minutes, 0),
      doneMinutes: 0,
    })
  }

  // A topic that was started but not finished before the learning days ran out.
  for (const topic of queue) {
    const placedMinutes = (parts.get(topic.id) ?? []).reduce((sum, item) => sum + item.minutes, 0)
    if (placedMinutes > 0 && placedMinutes < (totalMinutes.get(topic.id) ?? 0)) {
      partial = topic
      break
    }
  }

  // Parts know how many there are: "part 1 of 2".
  for (const list of parts.values()) {
    if (list.length > 1) list.forEach((item, position) => (item.part = { number: position + 1, of: list.length }))
  }

  const unplaced = queue.filter((topic) => (left.get(topic.id) ?? 0) > 0)
  return { days, unplaced, unitMocks: unitMockCount, fullMockDays: fullMockIndexes.map((i) => dates[i]), partial }
}

// ---------------------------------------------------------------------------------------
// The plan

const kindOrder: Record<PlanItemKind, number> = { review: 0, quiz: 1, learn: 2, unit_mock: 3, full_mock: 4 }

function doneItems(input: PlanInput, today: string, topicById: Map<string, PlanTopic>): PlanItem[] {
  const items: PlanItem[] = []
  for (const entry of input.doneToday) {
    if (entry.kind === 'mock') {
      items.push({
        id: `mock:${entry.examId}:${today}`,
        kind: 'full_mock',
        date: today,
        title: entry.name,
        topicId: null,
        unitId: null,
        topicIds: [],
        minutes: UNIT_MOCK_MINUTES,
        done: true,
        part: null,
        note: null,
      })
      continue
    }
    const topic = topicById.get(entry.topicId)
    if (!topic) continue
    const minutes = entry.kind === 'learn' ? learnMinutesLeft({ ...topic, learned: false, started: false }) : entry.kind === 'quiz' ? QUIZ_MINUTES : REVIEW_MINUTES
    items.push({
      id: `${entry.kind}:${topic.id}:${today}:done`,
      kind: entry.kind,
      date: today,
      title: entry.kind === 'learn' ? `Learn ${topic.name}` : entry.kind === 'quiz' ? `Quiz: ${topic.name}` : `Review ${topic.name}`,
      topicId: topic.id,
      unitId: topic.unitId,
      topicIds: [topic.id],
      minutes,
      done: true,
      part: null,
      note: null,
    })
  }
  return items
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function hoursLabel(minutes: number): string {
  if (minutes < 90) return `${Math.round(minutes)} minutes`
  const hours = Math.round((minutes / 60) * 2) / 2
  return `${hours} hours`
}

/** Builds the plan from the student's current state. Pure: the same input always gives the same plan. */
export function buildPlan(input: PlanInput): Plan {
  const today = localDay(input.now, input.timeZone)
  const dailyMinutes = clampMinutes(input.dailyMinutes)
  const topics = [...input.topics].sort((a, b) => a.orderIndex - b.orderIndex)
  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const examDate = isDayString(input.examDate) ? input.examDate : null
  const mode: Plan['mode'] = examDate ? 'exam' : 'rolling'
  const daysToExam = examDate ? daysBetween(today, examDate) : null

  const base: Plan = {
    status: 'ready',
    today,
    mode,
    examDate,
    daysToExam,
    dailyMinutes,
    days: [],
    short: false,
    shortMessage: null,
    unitMocksSkipped: false,
    notScheduled: null,
    mockNote: null,
    remaining: { topics: 0, minutes: 0 },
  }

  if (topics.length === 0) return { ...base, status: 'no_topics' }
  if (daysToExam !== null && daysToExam < 0) return { ...base, status: 'exam_passed' }

  const length = daysToExam !== null ? Math.min(daysToExam + 1, MAX_PLAN_DAYS) : ROLLING_DAYS
  const dates = Array.from({ length }, (_, index) => addDays(today, index))
  const examDay = examDate && dates.includes(examDate) ? examDate : null

  const done = doneItems(input, today, topicById)
  const doneMinutes = done.reduce((sum, item) => sum + item.minutes, 0)

  const todo = topics.filter((topic) => !topic.learned)
  const remainingMinutes = todo.reduce((sum, topic) => sum + learnMinutesLeft(topic), 0)

  const run = (config: { examFirst: boolean; unitMocks: boolean }): Simulation => {
    const excluded = new Set<string>()
    let result: Simulation
    // A topic that was only partly placed is taken out and the plan is laid out again, so the
    // time it took goes to topics that fit whole.
    for (let attempt = 0; ; attempt += 1) {
      result = simulate({
        dates,
        examDay,
        input,
        topics,
        order: learnOrder(topics, { examFirst: config.examFirst }),
        unitMocks: config.unitMocks,
        excluded,
        doneMinutes,
      })
      if (!result.partial || attempt > topics.length) break
      excluded.add(result.partial.id)
    }
    return { ...result, unplaced: [...result.unplaced.filter((topic) => !excluded.has(topic.id)), ...topics.filter((t) => excluded.has(t.id))] }
  }

  // First the plan in course order with every mock exam. If that leaves topics out and the exam
  // date is inside the plan, drop the optional unit mock exams; if topics are still left out, the
  // time is short, and past-exam topics go first.
  const eligibleUnitMocks = input.units.some(
    (unit) =>
      !input.unitMocksDone.includes(unit.id) &&
      topics.filter((topic) => topic.unitId === unit.id).length >= UNIT_MOCK_MIN_TOPICS
  )
  let chosen = run({ examFirst: false, unitMocks: true })
  let short = false
  let unitMocksSkipped = false
  if (chosen.unplaced.length > 0 && examDay) {
    unitMocksSkipped = eligibleUnitMocks
    chosen = run({ examFirst: false, unitMocks: false })
    if (chosen.unplaced.length > 0) {
      chosen = run({ examFirst: true, unitMocks: false })
      short = chosen.unplaced.length > 0
    }
  }

  const days: PlanDay[] = chosen.days.map((day) => {
    const items = [...day.items]
    if (day.isToday) items.unshift(...done)
    // Display order within a day: reviews, quizzes, learning, then mock exams; done items first.
    items.sort((a, b) => Number(b.done) - Number(a.done) || kindOrder[a.kind] - kindOrder[b.kind])
    return {
      ...day,
      items,
      minutes: items.filter((item) => !item.done).reduce((sum, item) => sum + item.minutes, 0),
      doneMinutes: items.filter((item) => item.done).reduce((sum, item) => sum + item.minutes, 0),
    }
  })

  const unplaced = [...chosen.unplaced]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((topic) => ({ id: topic.id, name: topic.name }))
  const placedMinutes = days.reduce(
    (sum, day) => sum + day.items.filter((item) => item.kind === 'learn' && !item.done).reduce((s, item) => s + item.minutes, 0),
    0
  )

  let shortMessage: string | null = null
  if (short) {
    const total = todo.length
    const fits = total - unplaced.length
    const anyRelevant = todo.some((topic) => topic.examRelevant)
    shortMessage =
      `Time is short. You have room to learn ${fits} of the ${plural(total, 'topic')} left before your exam ` +
      `(about ${hoursLabel(placedMinutes)} of the ${hoursLabel(remainingMinutes)} they need). ` +
      (anyRelevant ? 'Topics that appear on your past exams come first, then course order.' : 'They are in course order.') +
      (unitMocksSkipped ? ' The mock exams after each unit are left out to make room.' : '')
  }

  let mockNote: string | null = null
  if (examDate && daysToExam !== null) {
    const needed = Math.max(0, 2 - input.fullMocksDoneInFinalWeek)
    if (needed > 0 && chosen.fullMockDays.length < needed) {
      mockNote =
        chosen.fullMockDays.length === 0
          ? 'Your exam is less than 2 days away, so there is no room for a full mock exam. Take one now if you can.'
          : 'There is room for only one full mock exam before the exam.'
    }
  }

  return {
    ...base,
    days,
    short,
    shortMessage,
    unitMocksSkipped,
    mockNote,
    notScheduled: unplaced.length > 0 ? { reason: short ? 'short' : 'later', topics: unplaced } : null,
    remaining: { topics: todo.length, minutes: remainingMinutes },
  }
}

/** Today's items from the plan, in the order to do them (done ones first). */
export const todayItems = (plan: Plan): PlanItem[] => plan.days.find((day) => day.isToday)?.items ?? []
