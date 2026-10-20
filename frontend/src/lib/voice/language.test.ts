import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectLikelyLanguage } from './language'

test('plain English, including the word "a", stays English', () => {
  assert.equal(detectLikelyLanguage('A stack is a last in first out structure'), 'en')
  assert.equal(detectLikelyLanguage('It works as a buffer'), 'en')
  assert.equal(detectLikelyLanguage(''), 'en')
})

test('Portuguese is recognised by words that are not English', () => {
  assert.equal(detectLikelyLanguage('Obrigado, eu não entendi'), 'pt')
  assert.equal(detectLikelyLanguage('Olá, tudo bem'), 'pt')
})

test('Spanish, French and German are still recognised', () => {
  assert.equal(detectLikelyLanguage('Hola, gracias'), 'es')
  assert.equal(detectLikelyLanguage('Bonjour, merci'), 'fr')
  assert.equal(detectLikelyLanguage('Danke, ich verstehe das nicht'), 'de')
})
