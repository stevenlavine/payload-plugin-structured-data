import { afterEach, describe, expect, test, vi } from 'vitest'
import { logWarnings } from '../log.js'

afterEach(() => vi.unstubAllEnvs())

describe('logWarnings', () => {
  test('logs each warning outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarnings(['a', 'b'])
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith('[structured-data] a')
    spy.mockRestore()
  })

  test('is silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarnings(['a'])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
