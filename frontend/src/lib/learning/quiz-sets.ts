import { prisma } from '@/lib/db/prisma'
import { asQuestionList } from './quiz-questions'

type RawQuestion = Record<string, unknown>

/** The first quiz, stored before quiz sets existed, lives in topic_content. */
async function loadLegacyQuestions(topicId: string): Promise<RawQuestion[] | null> {
  const content = await prisma.topicContent.findUnique({
    where: { topicId_contentType: { topicId, contentType: 'topic_quiz' } },
    select: { contentData: true },
  })
  return asQuestionList(content?.contentData)
}

/**
 * The stored questions (with answer keys) for grading and review. Never send these to the
 * browser before the student has submitted. Without a set id this is the legacy quiz.
 */
export async function loadQuizQuestions(
  topicId: string,
  quizSetId: string | null | undefined
): Promise<RawQuestion[] | null> {
  if (!quizSetId) return loadLegacyQuestions(topicId)
  const set = await prisma.topicQuiz.findFirst({
    where: { id: quizSetId, topicId },
    select: { questions: true },
  })
  return asQuestionList(set?.questions)
}

/** Every quiz set of a topic, keyed by set id; the legacy quiz is under the key `null`. */
export async function loadAllQuizQuestionSets(
  topicId: string
): Promise<Map<string | null, RawQuestion[]>> {
  const [sets, legacy] = await Promise.all([
    prisma.topicQuiz.findMany({ where: { topicId }, select: { id: true, questions: true } }),
    loadLegacyQuestions(topicId),
  ])
  const map = new Map<string | null, RawQuestion[]>()
  if (legacy) map.set(null, legacy)
  for (const set of sets) {
    const questions = asQuestionList(set.questions)
    if (questions) map.set(set.id, questions)
  }
  return map
}
