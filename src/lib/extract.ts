import extractZip from 'extract-zip'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

/**
 * Create a temporary directory for downloads
 */
export async function createTempDir(prefix: string = 'aiorg-'): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `${prefix}${Date.now()}`)
  await fs.ensureDir(tempDir)
  return tempDir
}

/**
 * Save buffer to a file
 */
export async function saveToFile(
  data: ArrayBuffer,
  filePath: string
): Promise<void> {
  await fs.ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, Buffer.from(data))
}

/**
 * Extract ZIP file to a directory
 */
export async function extractZipToDir(
  zipPath: string,
  destPath: string
): Promise<void> {
  await fs.ensureDir(destPath)
  await extractZip(zipPath, { dir: destPath })
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.remove(tempDir)
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if a directory exists and is not empty
 */
export async function dirExistsAndNotEmpty(dirPath: string): Promise<boolean> {
  try {
    const exists = await fs.pathExists(dirPath)
    if (!exists) return false

    const files = await fs.readdir(dirPath)
    return files.length > 0
  } catch {
    return false
  }
}

/**
 * Get the size of a file in KB
 */
export async function getFileSizeKB(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath)
  return Math.round(stats.size / 1024)
}
