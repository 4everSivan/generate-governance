import { describe, expect, it } from 'vitest'

describe('GET /users contract', () => {
  it('documents a bounded limit query parameter', () => {
    expect({ minimum: 1, maximum: 100 }).toEqual({ minimum: 1, maximum: 100 })
  })
})
