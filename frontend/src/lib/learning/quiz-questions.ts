/**
 * Quiz and exam questions carry their answer key (correct_answer, sample_answer, key_points,
 * explanation, acceptable_answers). The key stays on the server until a student has
 * submitted: everything a browser receives before that goes through `toPublicQuestion`,
 * which keeps only the fields needed to show and answer the question.
 */

const PUBLIC_FIELDS = [
  'question_type',
  'question_text',
  'options',
  'unit',
  'points',
  'difficulty',
  'concepts_tested',
  // Exam questions say which topic they belong to.
  'topic_id',
  'topic_name',
] as const

type RawQuestion = Record<string, unknown>

export type PublicQuizQuestion = {
  question_type: 'multiple_choice' | 'short_answer' | 'numerical' | 'true_false'
  question_text: string
  options?: Array<{ id: string; text: string }>
  unit?: string
  points: number
  difficulty?: string
  concepts_tested?: string[]
  topic_id?: string
  topic_name?: string
}

// Words a model puts in `unit` that name the kind of quantity, not a unit: "400 probability" is not an answer.
const NOT_A_UNIT =
  /^(probabilit(y|ies)|chance|likelihood|number|count|value|values|answer|ratio|fraction|proportion|decimal|rate|none|n\/?a|unitless|dimensionless|no units?)\.?$/i

/**
 * The unit to print after a numerical answer ("m/s", "%", "dollars"), or "" when there is none. A
 * quantity with no unit (a probability, a count, a ratio) comes back from the generator with the
 * name of the quantity in `unit`, and printing it makes "400 probability". The cause is in the
 * stored data, so this one rule is applied wherever a unit is read (the answer box, the review,
 * the grader's key): descriptor words, empty text and anything sentence-like give "".
 */
export function answerUnit(unit: unknown): string {
  if (typeof unit !== 'string') return ''
  const text = unit.trim()
  if (!text || NOT_A_UNIT.test(text)) return ''
  // A unit is a symbol or a word or two ("mol/L", "square metres"), not a sentence.
  if (text.length > 24 || text.split(/\s+/).length > 3) return ''
  return text
}

const isRecord = (value: unknown): value is RawQuestion =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function toPublicQuestion(question: unknown): PublicQuizQuestion {
  const source = isRecord(question) ? question : {}
  const result: RawQuestion = {}
  for (const field of PUBLIC_FIELDS) {
    if (source[field] !== undefined) result[field] = source[field]
  }
  if ('unit' in result) {
    const unit = answerUnit(result.unit)
    if (unit) result.unit = unit
    else delete result.unit
  }
  if (Array.isArray(result.options)) {
    // Options are { id, text } only, in case a generator ever adds a flag to them.
    result.options = result.options.filter(isRecord).map((option) => ({ id: option.id, text: option.text }))
  }
  return result as PublicQuizQuestion
}

/** Public questions from a stored list (or an object with a `questions` list). */
export function toPublicQuestions(data: unknown): PublicQuizQuestion[] {
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.questions) ? data.questions : []
  return list.map(toPublicQuestion)
}

/** Topic content as stored, safe to send to the browser: quiz answer keys removed. */
export function toPublicContentData(contentType: string, contentData: unknown): unknown {
  return contentType === 'topic_quiz' ? toPublicQuestions(contentData) : contentData
}

/** The stored questions as a list, or null when the data is not a usable quiz. */
export function asQuestionList(data: unknown): RawQuestion[] | null {
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.questions) ? data.questions : null
  if (!list || list.length === 0 || !list.every(isRecord)) return null
  return list
}

const display = (value: unknown) => (value === undefined || value === null ? '' : String(value))

/** The answer shown in a review: the sample answer for short answers, the key otherwise. */
export function reviewAnswer(question: RawQuestion): string {
  switch (question.question_type) {
    case 'short_answer':
      return display(question.sample_answer)
    case 'true_false': {
      const key = question.correct_answer
      const isTrue = key === true || String(key).trim().toLowerCase() === 'true'
      return isTrue ? 'True' : 'False'
    }
    case 'numerical': {
      return `${display(question.correct_answer)} ${answerUnit(question.unit)}`.trim()
    }
    default:
      return display(question.correct_answer)
  }
}
