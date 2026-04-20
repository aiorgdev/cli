import * as p from '@clack/prompts'
import pc from 'picocolors'
import path from 'path'
import os from 'os'
import { getLicenseKey, isLoggedIn } from '../lib/auth.js'
import { fetchLatestVersion, getDownloadUrl, downloadFile } from '../lib/api.js'
import {
  createTempDir,
  saveToFile,
  extractZipToDir,
  cleanupTempDir,
  dirExistsAndNotEmpty,
  getFileSizeKB,
} from '../lib/extract.js'
import { setupProject } from '../lib/project.js'
import { detectKit } from '../lib/detect.js'
import { ensureRuntime, runPostUpgrade, formatRuntimeError } from '../lib/runtime.js'
import * as logger from '../utils/logger.js'
import { login } from './login.js'

interface InitOptions {
  force?: boolean
}

export async function init(
  kitName: string,
  targetPath: string | undefined,
  options: InitOptions
): Promise<void> {
  p.intro(pc.cyan(`aiorg init ${kitName}`))

  // Resolve target path
  const resolvedPath = targetPath
    ? path.resolve(targetPath.replace(/^~/, os.homedir()))
    : path.resolve(process.cwd(), kitName)

  // Check if target exists
  if (!options.force && (await dirExistsAndNotEmpty(resolvedPath))) {
    logger.error(`Folder already exists: ${pc.yellow(resolvedPath)}`)
    logger.log(pc.dim('Use --force to overwrite'))
    process.exit(1)
  }

  // Fetch latest version info first (to check tier)
  const spinner = p.spinner()
  spinner.start('Fetching version info...')

  let versionInfo
  try {
    versionInfo = await fetchLatestVersion(kitName)
    spinner.stop(`Found ${pc.cyan(versionInfo.packageDisplayName)} v${versionInfo.version}`)
  } catch (error) {
    spinner.stop('Failed to fetch version info')
    throw error
  }

  const isFreeKit = versionInfo.tier === 'free'
  let licenseKey: string | null = null

  // Only require login for paid kits
  if (!isFreeKit) {
    if (!(await isLoggedIn())) {
      logger.info('Not logged in. Please log in first.')
      logger.blank()
      await login()
      logger.blank()
    }

    licenseKey = await getLicenseKey()
    if (!licenseKey) {
      logger.error('No license key found. Run "aiorg login" first.')
      process.exit(1)
    }
  }

  // Get download URL
  if (isFreeKit) {
    spinner.start('Getting download URL...')
  } else {
    spinner.start('Verifying license...')
  }

  let downloadInfo
  try {
    downloadInfo = await getDownloadUrl(kitName, licenseKey)
    spinner.stop(isFreeKit ? 'Ready to download' : 'License verified')
  } catch (error) {
    spinner.stop(isFreeKit ? 'Failed to get download URL' : 'License verification failed')
    throw error
  }

  // Download ZIP
  spinner.start(`Downloading ${kitName} v${versionInfo.version}...`)

  let tempDir: string | null = null
  try {
    tempDir = await createTempDir('aiorg-init-')
    const zipPath = path.join(tempDir, 'kit.zip')

    const zipData = await downloadFile(downloadInfo.downloadUrl)
    await saveToFile(zipData, zipPath)

    const sizeKB = await getFileSizeKB(zipPath)
    spinner.stop(`Downloaded ${kitName} v${versionInfo.version} (${sizeKB} KB)`)

    // Extract to target
    spinner.start(`Extracting to ${resolvedPath}...`)
    await extractZipToDir(zipPath, resolvedPath)
    spinner.stop(`Extracted to ${pc.yellow(resolvedPath)}`)

    // Cleanup
    await cleanupTempDir(tempDir)
  } catch (error) {
    if (tempDir) {
      await cleanupTempDir(tempDir)
    }
    throw error
  }

  // Runtime toolchain checks + postUpgrade (e.g. `uv sync --frozen` for Python kits).
  // We run this AFTER extract but BEFORE the success message so a missing
  // toolchain shows as an install-time failure, not a silent half-install.
  const installedKit = await detectKit(resolvedPath)
  if (installedKit?.kitJson) {
    try {
      ensureRuntime(installedKit.kitJson)
    } catch (err) {
      const { message, hint } = formatRuntimeError(err)
      logger.blank()
      logger.error(message)
      if (hint) {
        logger.blank()
        logger.log(pc.dim(hint))
      }
      process.exit(1)
    }

    if (installedKit.kitJson.postUpgrade && installedKit.kitJson.postUpgrade.length > 0) {
      logger.blank()
      logger.log(pc.dim('Running post-install hooks:'))
      try {
        runPostUpgrade(installedKit.kitJson, resolvedPath, (command) => {
          logger.listItem(pc.dim(`$ ${command}`))
        })
      } catch (err) {
        const { message, hint } = formatRuntimeError(err)
        logger.blank()
        logger.error(message)
        if (hint) {
          logger.blank()
          logger.log(pc.dim(hint))
        }
        process.exit(1)
      }
    }
  }

  // Success message
  logger.blank()
  logger.success(`${versionInfo.packageDisplayName} v${versionInfo.version} installed!`)

  // Setup project linking (for kit ecosystem)
  // Personal kits (like Investor OS) skip this - they don't need shared business context
  if (!installedKit?.isPersonal) {
    await setupProject(resolvedPath, kitName)
  }
  logger.blank()
  logger.log('Next steps:')
  logger.listItem(`cd ${resolvedPath}`)
  logger.listItem('claude')
  logger.listItem('/setup')

  // Kit-specific outro messages
  const outroMessages: Record<string, string> = {
    'investor-os': 'Happy investing!',
  }
  const outro = outroMessages[kitName] || 'Happy building!'
  p.outro(pc.green(outro))
}
