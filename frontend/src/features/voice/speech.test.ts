import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultLanguageCode, languageTag, pickVoice, scoreVoice, VOICE_LANGUAGES, type VoiceInfo } from './speech'

const voices: VoiceInfo[] = [
  { name: 'Albert', lang: 'en-US', localService: true },
  { name: 'eSpeak English', lang: 'en', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true, default: true },
  { name: 'Google UK English Female', lang: 'en-GB', localService: false },
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  { name: 'Monica', lang: 'es-ES', localService: true },
  { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
]

describe('pickVoice', () => {
  it('prefers a natural or neural voice in the exact language', () => {
    assert.equal(pickVoice(voices, 'en-US')?.name, 'Microsoft Aria Online (Natural) - English (United States)')
  })

  it('falls back to a same-language voice from another region', () => {
    const onlyUk = voices.filter((voice) => voice.name.startsWith('Google UK'))
    assert.equal(pickVoice(onlyUk, 'en-US')?.name, 'Google UK English Female')
  })

  it('never picks a voice for another language', () => {
    assert.equal(pickVoice(voices, 'fr-FR'), null)
    assert.equal(scoreVoice({ name: 'Monica', lang: 'es-ES' }, 'en-US'), -1)
  })

  it('avoids novelty and robotic voices when something else exists', () => {
    const picked = pickVoice(voices.filter((voice) => ['Albert', 'eSpeak English', 'Samantha'].includes(voice.name)), 'en-US')
    assert.equal(picked?.name, 'Samantha')
  })

  it('handles underscores in the voice language (older Android)', () => {
    assert.equal(pickVoice([{ name: 'x', lang: 'es_ES' }], 'es-ES')?.name, 'x')
  })

  it('picks the Google voice for Spanish over the plain local one', () => {
    assert.equal(pickVoice(voices, 'es-ES')?.name, 'Google español de Estados Unidos')
  })
})

describe('languages', () => {
  it('maps codes to browser tags and keeps unknown codes', () => {
    assert.equal(languageTag('en'), 'en-US')
    assert.equal(languageTag('hi'), 'hi-IN')
    assert.equal(languageTag('sv'), 'sv')
  })

  it('every code is accepted by the server pattern', () => {
    for (const language of VOICE_LANGUAGES) assert.match(language.code, /^[a-z]{2,8}$/i)
  })

  it('defaults to the browser language when listed, else English', () => {
    assert.equal(defaultLanguageCode('es-MX'), 'es')
    assert.equal(defaultLanguageCode('sv-SE'), 'en')
    assert.equal(defaultLanguageCode(undefined), 'en')
  })
})
