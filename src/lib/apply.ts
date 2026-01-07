import fs from 'fs-extra'
import path from 'path'
import { glob } from 'glob'
import { minimatch } from 'minimatch'
import { merge } from 'lodash-es'
import type { VersionJson } from './detect.js'

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export interface ApplyResult {
  replaced: string[]
  merged: string[]
  added: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Apply fileCategories from source to destination
 * - alwaysReplace: copy/overwrite from source
 * - neverTouch: skip entirely
 * - mergeIfChanged: deep merge JSON files (user values win)
 * - addOnly: add only if file doesn't exist
 */
export async function applyFileCategories(
  sourceDir: string,
  destDir: string,
  versionJson: VersionJson
): Promise<ApplyResult> {
  const result: ApplyResult = {
    replaced: [],
    merged: [],
    added: [],
    skipped: [],
    errors: [],
  }

  const alwaysReplace = versionJson.fileCategories?.alwaysReplace ?? []
  const neverTouch = versionJson.fileCategories?.neverTouch ?? []
  const mergeIfChanged = versionJson.fileCategories?.mergeIfChanged ?? []
  const addOnly = versionJson.fileCategories?.addOnly ?? []

  // Track processed files to avoid duplicates
  const processedFiles = new Set<string>()

  // 1. Process alwaysReplace patterns
  for (const pattern of alwaysReplace) {
    try {
      const files = await glob(pattern, {
        cwd: sourceDir,
        dot: true,
        nodir: true,
      })

      for (const file of files) {
        if (processedFiles.has(file)) continue

        // Check if file matches any neverTouch pattern
        const shouldSkip = neverTouch.some((ntPattern) => {
          return matchesPattern(file, ntPattern)
        })

        if (shouldSkip) {
          result.skipped.push(file)
          processedFiles.add(file)
          continue
        }

        const srcPath = path.join(sourceDir, file)
        const destPath = path.join(destDir, file)

        try {
          await fs.ensureDir(path.dirname(destPath))
          await fs.copy(srcPath, destPath, { overwrite: true })
          result.replaced.push(file)
          processedFiles.add(file)
        } catch (err) {
          result.errors.push(`Failed to copy ${file}: ${getErrorMessage(err)}`)
        }
      }
    } catch (err) {
      result.errors.push(`Failed to process pattern ${pattern}: ${getErrorMessage(err)}`)
    }
  }

  // 2. Process mergeIfChanged patterns (JSON deep merge)
  for (const pattern of mergeIfChanged) {
    try {
      const files = await glob(pattern, {
        cwd: sourceDir,
        dot: true,
        nodir: true,
      })

      for (const file of files) {
        if (processedFiles.has(file)) continue

        // Check if file matches any neverTouch pattern
        const shouldSkip = neverTouch.some((ntPattern) => {
          return matchesPattern(file, ntPattern)
        })

        if (shouldSkip) {
          result.skipped.push(file)
          processedFiles.add(file)
          continue
        }

        const srcPath = path.join(sourceDir, file)
        const destPath = path.join(destDir, file)

        try {
          const destExists = await fs.pathExists(destPath)

          if (destExists && file.endsWith('.json')) {
            // Merge JSON files - user's values win (existing overwrites incoming)
            const incoming = await fs.readJson(srcPath)
            const existing = await fs.readJson(destPath)

            // Deep merge: start with incoming, overlay existing (user's changes win)
            const merged = merge({}, incoming, existing)

            await fs.writeJson(destPath, merged, { spaces: 2 })
            result.merged.push(file)
          } else if (destExists) {
            // Non-JSON file exists - skip (preserve user's version)
            result.skipped.push(file)
          } else {
            // File doesn't exist - copy it
            await fs.ensureDir(path.dirname(destPath))
            await fs.copy(srcPath, destPath)
            result.replaced.push(file)
          }
          processedFiles.add(file)
        } catch (err) {
          result.errors.push(`Failed to merge ${file}: ${getErrorMessage(err)}`)
        }
      }
    } catch (err) {
      result.errors.push(`Failed to process merge pattern ${pattern}: ${getErrorMessage(err)}`)
    }
  }

  // 3. Process addOnly patterns (add if missing)
  for (const pattern of addOnly) {
    try {
      const files = await glob(pattern, {
        cwd: sourceDir,
        dot: true,
        nodir: true,
      })

      for (const file of files) {
        if (processedFiles.has(file)) continue

        // Check if file matches any neverTouch pattern
        const shouldSkip = neverTouch.some((ntPattern) => {
          return matchesPattern(file, ntPattern)
        })

        if (shouldSkip) {
          result.skipped.push(file)
          processedFiles.add(file)
          continue
        }

        const srcPath = path.join(sourceDir, file)
        const destPath = path.join(destDir, file)

        try {
          const destExists = await fs.pathExists(destPath)

          if (!destExists) {
            // Only add if file doesn't exist
            await fs.ensureDir(path.dirname(destPath))
            await fs.copy(srcPath, destPath)
            result.added.push(file)
          } else {
            // File exists - skip
            result.skipped.push(file)
          }
          processedFiles.add(file)
        } catch (err) {
          result.errors.push(`Failed to add ${file}: ${getErrorMessage(err)}`)
        }
      }
    } catch (err) {
      result.errors.push(`Failed to process addOnly pattern ${pattern}: ${getErrorMessage(err)}`)
    }
  }

  return result
}

/**
 * Pattern matching using minimatch (supports *, **, etc.)
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  return minimatch(filePath, pattern, { dot: true })
}

/**
 * Check if git is available and directory is a git repo
 */
export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitDir = path.join(dirPath, '.git')
    return await fs.pathExists(gitDir)
  } catch {
    return false
  }
}

/**
 * Create a git backup commit
 */
export async function createGitBackup(
  dirPath: string,
  message: string
): Promise<boolean> {
  try {
    const { spawnSync } = await import('child_process')

    // Stage all changes
    spawnSync('git', ['add', '-A'], { cwd: dirPath, stdio: 'pipe' })

    // Check if there are changes to commit
    const diffResult = spawnSync('git', ['diff', '--cached', '--quiet'], {
      cwd: dirPath,
      stdio: 'pipe',
    })

    if (diffResult.status === 0) {
      // No changes
      return false
    }

    // Has changes, commit them (using spawnSync to avoid shell injection)
    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: dirPath,
      stdio: 'pipe',
    })

    return commitResult.status === 0
  } catch {
    return false
  }
}
