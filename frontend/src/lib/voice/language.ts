// A rough guess at which language a transcript is in. Used only to offer a language switch,
// so it favours distinctive words over common short ones. Patterns are checked in order,
// so a word two languages share goes to the earlier one.
const LANGUAGE_HINTS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'es', pattern: /\b(el|la|los|las|de|que|por|para|gracias|hola|como|est[aá]|donde)\b/i },
  { code: 'fr', pattern: /\b(le|la|les|des|et|bonjour|merci|avec|pour|être|où)\b/i },
  { code: 'de', pattern: /\b(der|die|das|und|ist|nicht|danke|bitte|wie|wo)\b/i },
  // No bare "a" or "as": both are English words. \b does not work next to accented letters,
  // so this one uses letter lookarounds.
  { code: 'pt', pattern: /(?<!\p{L})(obrigad[oa]|ol[aá]|voc[eê]|n[aã]o|uma|isso|tamb[eé]m)(?!\p{L})/iu },
]

export function detectLikelyLanguage(transcript: string): string {
  const value = transcript.toLowerCase()
  if (!value.trim()) return 'en'

  for (const hint of LANGUAGE_HINTS) {
    if (hint.pattern.test(value)) {
      return hint.code
    }
  }
  return 'en'
}
