/**
 * Runtime checks and post-install hooks.
 *
 * Some kits declare `runtime: "python"` in kit.json because their tooling
 * is Python (e.g. tax-accountant uses uv + pyproject.toml). The JS-centric
 * CLI install flow doesn't know how to sync Python deps — so after the
 * ZIP is extracted we:
 *   1. Verify the runtime toolchain is installed (e.g. `uv --version`).
 *   2. Verify the interpreter satisfies `pythonMin` if set.
 *   3. Run each command in `postUpgrade` in the kit's root directory.
 *
 * Any failure is fatal — we don't want half-installed kits where the CLI
 * cheerfully reports success but the user's first `/setup` crashes on a
 * missing dependency. Better to fail loudly at install time.
 */

import { spawnSync } from 'child_process'
import semver from 'semver'
import type { KitJson } from './detect.js'

export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly hint?: string
  ) {
    super(message)
    this.name = 'RuntimeError'
  }
}

/**
 * Verify the declared runtime's toolchain is installed and the interpreter
 * version is adequate. No-op for kits without runtime constraints.
 *
 * Throws RuntimeError with a `hint` carrying install instructions the CLI
 * surfaces to the user verbatim.
 */
export function ensureRuntime(kit: KitJson | undefined): void {
  if (!kit?.runtime || kit.runtime === 'node') {
    return
  }

  if (kit.runtime === 'python') {
    ensurePythonRuntime(kit.pythonMin)
    return
  }

  throw new RuntimeError(`Unknown runtime declared in kit.json: ${kit.runtime as string}`)
}

/**
 * Expose Python runtime check directly for testing / other callers.
 */
export function ensurePythonRuntime(pythonMin?: string): void {
  // uv is our canonical Python dep tool. We don't support raw pip — the
  // kit ships a uv.lock and expects `uv sync --frozen` to be deterministic.
  const uvResult = spawnSync('uv', ['--version'], { encoding: 'utf8' })
  if (uvResult.status !== 0) {
    throw new RuntimeError(
      'This kit requires uv (https://astral.sh/uv) for Python dependency management.',
      'Install uv with:\n  curl -LsSf https://astral.sh/uv/install.sh | sh\n\n' +
        'Or via brew:\n  brew install uv'
    )
  }

  if (!pythonMin) {
    return
  }

  // `uv python list --only-installed` lists available interpreters. We use
  // `python3 --version` as a lightweight check — uv can auto-download an
  // interpreter later via `uv sync`, so we don't require a system Python
  // ≥ pythonMin, only that one is available somewhere.
  const pythonResult = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  if (pythonResult.status !== 0) {
    // Not fatal — uv sync can download Python. Just warn via hint.
    return
  }

  const versionOutput = (pythonResult.stdout || pythonResult.stderr || '').trim()
  const match = versionOutput.match(/Python (\d+\.\d+(?:\.\d+)?)/)
  if (!match) {
    return // can't parse, don't block
  }

  const installed = match[1]
  // Coerce 'x.y' to 'x.y.0' for semver comparison; similar for pythonMin.
  const installedSemver = semver.coerce(installed)
  const requiredSemver = semver.coerce(pythonMin)

  if (!installedSemver || !requiredSemver) {
    return // malformed; don't block
  }

  if (semver.lt(installedSemver, requiredSemver)) {
    throw new RuntimeError(
      `This kit requires Python >= ${pythonMin} (you have ${installed}).`,
      `uv can install a newer Python for you automatically — run:\n  uv python install ${pythonMin}\n\n` +
        'Or install a matching Python from https://www.python.org/downloads/'
    )
  }
}

export interface PostUpgradeResult {
  ran: number
  skipped: boolean
}

/**
 * Run each command from `kit.postUpgrade` in the given working directory.
 *
 * Commands run serially; if any exits non-zero we throw RuntimeError so
 * the CLI prints a clean failure message rather than leaving the user
 * with a half-configured kit.
 *
 * `onCommand` lets the CLI surface "now running: …" updates through its
 * existing spinner / logger.
 */
export function runPostUpgrade(
  kit: KitJson | undefined,
  workingDir: string,
  onCommand?: (command: string) => void
): PostUpgradeResult {
  if (!kit?.postUpgrade || kit.postUpgrade.length === 0) {
    return { ran: 0, skipped: true }
  }

  let ran = 0
  for (const command of kit.postUpgrade) {
    onCommand?.(command)
    // We intentionally use `shell: true` so kit.json authors can use
    // common shell idioms (`&&`, env-var interpolation). Inputs come from
    // kit.json which is a trusted artifact — same trust model as the ZIP
    // itself.
    const result = spawnSync(command, {
      cwd: workingDir,
      stdio: 'inherit',
      shell: true,
    })
    if (result.status !== 0) {
      throw new RuntimeError(
        `postUpgrade command failed with exit ${result.status}: ${command}`,
        `Try running the command manually in ${workingDir} to see the full error, ` +
          'then re-run `aiorg init` / `aiorg upgrade`.'
      )
    }
    ran++
  }
  return { ran, skipped: false }
}

/**
 * Format a RuntimeError (or any error) into a multi-line message suitable
 * for logger.error() + a follow-up hint line.
 */
export function formatRuntimeError(err: unknown): { message: string; hint?: string } {
  if (err instanceof RuntimeError) {
    return { message: err.message, hint: err.hint }
  }
  if (err instanceof Error) {
    return { message: err.message }
  }
  return { message: String(err) }
}
