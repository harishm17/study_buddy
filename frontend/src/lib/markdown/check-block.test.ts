import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCheckBlock } from './check-block'

describe('parseCheckBlock', () => {
  it('reads a question and an answer', () => {
    assert.deepEqual(parseCheckBlock('Q: What is $2+2$?\nA: $4$'), { question: 'What is $2+2$?', answer: '$4$' })
  })

  it('keeps multi-line questions and answers', () => {
    const item = parseCheckBlock('Q: Name two things.\nThink about cost.\nA: First, speed.\n\nSecond, memory.')
    assert.equal(item?.question, 'Name two things.\nThink about cost.')
    assert.equal(item?.answer, 'First, speed.\n\nSecond, memory.')
  })

  it('accepts bold labels and the long words', () => {
    assert.deepEqual(parseCheckBlock('**Q:** Why?\n**A:** Because.'), { question: 'Why?', answer: 'Because.' })
    assert.deepEqual(parseCheckBlock('Question: Why?\nAnswer: Because.'), { question: 'Why?', answer: 'Because.' })
  })

  it('tolerates blank lines and Windows line breaks', () => {
    assert.deepEqual(parseCheckBlock('\r\nQ: One?\r\n\r\nA: Two.\r\n'), { question: 'One?', answer: 'Two.' })
  })

  it('gives null when it is not a question and answer', () => {
    assert.equal(parseCheckBlock('print("hi")'), null)
    assert.equal(parseCheckBlock('Q: Only a question'), null)
    assert.equal(parseCheckBlock('A: only an answer'), null)
    assert.equal(parseCheckBlock('Q:\nA: nothing asked'), null)
    assert.equal(parseCheckBlock('some text\nQ: late\nA: x'), null)
  })
})
