/**
 * Tests for lib/runtime.ts — Python toolchain checks + postUpgrade hooks.
 *
 * These tests assume `uv` is not guaranteed to be installed on CI, so
 * we construct minimal fakes and exercise the no-op / error paths via
 * kit.json shape rather than actual subprocess calls where possible.
 *
 * For the subprocess-heavy paths (runPostUpgrade) we use a tempdir and
 * cross-platform commands (`true`, `false` on POSIX; tests are skipped
 * on Windows CI if those aren't available — the CLI itself is only
 * supported on macOS/Linux anyway).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import {
  ensureRuntime,
  runPostUpgrade,
  formatRuntimeError,
  RuntimeError,
} from '../lib/runtime.js'
import type { KitJson } from '../lib/detect.js'

describe('ensureRuntime', () => {
  it('is a no-op when no runtime is declared', () => {
    const kit: KitJson = { name: 'foo' }
    expect(() => ensureRuntime(kit)).not.toThrow()
  })

  it('is a no-op for node runtime', () => {
    const kit: KitJson = { name: 'foo', runtime: 'node' }
    expect(() => ensureRuntime(kit)).not.toThrow()
  })

  it('is a no-op when kitJson is undefined', () => {
    expect(() => ensureRuntime(undefined)).not.toThrow()
  })

  it('throws for python runtime when uv is missing', () => {
    // We can't reliably assume uv is absent on a contributor's machine,
    // so we approximate: the test only asserts the error SHAPE when uv
    // check fails. We override PATH to make uv unresolvable.
    const originalPath = process.env.PATH
    process.env.PATH = '/nonexistent-dir'
    try {
      const kit: KitJson = { name: 'py', runtime: 'python' }
      expect(() => ensureRuntime(kit)).toThrow(RuntimeError)
      try {
        ensureRuntime(kit)
      } catch (err) {
        expect(err).toBeInstanceOf(RuntimeError)
        expect((err as RuntimeError).message).toContain('uv')
        expect((err as RuntimeError).hint).toContain('astral.sh/uv')
      }
    } finally {
      process.env.PATH = originalPath
    }
  })
})

describe('runPostUpgrade', () => {
  const testDir = path.join(os.tmpdir(), `aiorg-runtime-test-${Date.now()}`)

  beforeEach(async () => {
    await fs.ensureDir(testDir)
  })

  afterEach(async () => {
    await fs.remove(testDir)
  })

  it('returns skipped=true when postUpgrade is missing', () => {
    const kit: KitJson = { name: 'foo' }
    const result = runPostUpgrade(kit, testDir)
    expect(result).toEqual({ ran: 0, skipped: true })
  })

  it('returns skipped=true when postUpgrade is empty array', () => {
    const kit: KitJson = { name: 'foo', postUpgrade: [] }
    const result = runPostUpgrade(kit, testDir)
    expect(result).toEqual({ ran: 0, skipped: true })
  })

  it('runs each command and reports count', () => {
    const kit: KitJson = {
      name: 'foo',
      postUpgrade: ['true', 'true', 'true'],
    }
    const result = runPostUpgrade(kit, testDir)
    expect(result).toEqual({ ran: 3, skipped: false })
  })

  it('invokes onCommand callback for each command', () => {
    const kit: KitJson = {
      name: 'foo',
      postUpgrade: ['true', 'true'],
    }
    const captured: string[] = []
    runPostUpgrade(kit, testDir, (cmd) => captured.push(cmd))
    expect(captured).toEqual(['true', 'true'])
  })

  it('throws RuntimeError when a command exits non-zero', () => {
    const kit: KitJson = {
      name: 'foo',
      postUpgrade: ['true', 'false'],
    }
    expect(() => runPostUpgrade(kit, testDir)).toThrow(RuntimeError)
    try {
      runPostUpgrade(kit, testDir)
    } catch (err) {
      expect(err).toBeInstanceOf(RuntimeError)
      expect((err as RuntimeError).message).toContain('postUpgrade command failed')
      expect((err as RuntimeError).message).toContain('false')
      expect((err as RuntimeError).hint).toContain(testDir)
    }
  })

  it('stops at the first failing command', () => {
    // Use a command that creates a file — if we reach the 3rd command
    // after a failure, we'd see the marker.
    const marker = path.join(testDir, 'should-not-exist.txt')
    const kit: KitJson = {
      name: 'foo',
      postUpgrade: ['true', 'false', `touch "${marker}"`],
    }
    expect(() => runPostUpgrade(kit, testDir)).toThrow(RuntimeError)
    expect(fs.existsSync(marker)).toBe(false)
  })

  it('runs commands in the specified working directory', async () => {
    const kit: KitJson = {
      name: 'foo',
      postUpgrade: ['pwd > cwd.txt'],
    }
    runPostUpgrade(kit, testDir)
    const recorded = (await fs.readFile(path.join(testDir, 'cwd.txt'), 'utf8')).trim()
    // macOS tempdirs may be symlinked (/var vs /private/var) — compare realpath.
    const expectedReal = await fs.realpath(testDir)
    const recordedReal = await fs.realpath(recorded)
    expect(recordedReal).toBe(expectedReal)
  })
})

describe('formatRuntimeError', () => {
  it('returns message + hint for RuntimeError', () => {
    const err = new RuntimeError('boom', 'try this')
    expect(formatRuntimeError(err)).toEqual({
      message: 'boom',
      hint: 'try this',
    })
  })

  it('returns only message for RuntimeError without hint', () => {
    const err = new RuntimeError('boom')
    expect(formatRuntimeError(err)).toEqual({ message: 'boom' })
  })

  it('handles regular Error instances', () => {
    const err = new Error('plain error')
    expect(formatRuntimeError(err)).toEqual({ message: 'plain error' })
  })

  it('coerces unknown values to string', () => {
    expect(formatRuntimeError('string error')).toEqual({ message: 'string error' })
    expect(formatRuntimeError(42)).toEqual({ message: '42' })
    expect(formatRuntimeError(null)).toEqual({ message: 'null' })
  })
})
