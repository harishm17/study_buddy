/**
 * Headers for every server-side call into the AI service.
 *
 * The AI service refuses job and voice requests without the shared AI_INTERNAL_TOKEN
 * (outside local development), so every caller goes through here.
 */
export const AI_INTERNAL_TOKEN_HEADER = 'x-ai-internal-token'

export function aiServiceHeaders(): Record<string, string> {
  const token = process.env.AI_INTERNAL_TOKEN
  return {
    'Content-Type': 'application/json',
    ...(token ? { [AI_INTERNAL_TOKEN_HEADER]: token } : {}),
  }
}
