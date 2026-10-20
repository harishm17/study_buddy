import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JOB_STATUS_SELECT, serializeJob, type JobStatusRow } from './status'

describe('job status response', () => {
  it('never selects inputData, which can hold a student\'s exam answers', () => {
    assert.equal('inputData' in JOB_STATUS_SELECT, false)
    assert.equal(JOB_STATUS_SELECT.status, true)
    assert.equal(JOB_STATUS_SELECT.resultData, true)
  })

  it('fills in the stage from the job type when the job has none', () => {
    const row = { jobType: 'grade_exam', stage: null } as JobStatusRow
    assert.equal(serializeJob(row).stage, 'grading')
    assert.equal(serializeJob({ jobType: 'grade_exam', stage: 'saving' } as JobStatusRow).stage, 'saving')
  })
})
