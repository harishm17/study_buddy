/** Example questions for the empty chat, built from the project's topic names. */

const TOPIC_TEMPLATES = [
  (topic: string) => `Explain ${topic} in simple terms.`,
  (topic: string) => `What are the key points about ${topic}?`,
  (topic: string) => `Give me an example that shows ${topic}.`,
]

const GENERIC_QUESTIONS = [
  'Summarize the main ideas in my materials.',
  'Which concepts are most likely to show up on an exam?',
  'What definitions should I memorize?',
]

/** Up to `count` example questions: one per topic (first topics first), then generic ones. */
export function exampleQuestions(topicNames: readonly string[], count = 3): string[] {
  const names = topicNames.map((name) => name.trim()).filter(Boolean)
  const questions = names.slice(0, count).map((name, index) => TOPIC_TEMPLATES[index % TOPIC_TEMPLATES.length](name))
  for (const generic of GENERIC_QUESTIONS) {
    if (questions.length >= count) break
    questions.push(generic)
  }
  return questions
}
