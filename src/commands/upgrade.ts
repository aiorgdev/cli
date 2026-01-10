import * as p from '@clack/prompts'
import pc from 'picocolors'
import path from 'path'
import fs from 'fs/promises'
import semver from 'semver'
import { detectKitInCwd, detectKit } from '../lib/detect.js'
import { getLicenseKey, isLoggedIn } from '../lib/auth.js'
import { fetchLatestVersion, getDownloadUrl, downloadFile } from '../lib/api.js'
import {
  createTempDir,
  saveToFile,
  extractZipToDir,
  cleanupTempDir,
  getFileSizeKB,
} from '../lib/extract.js'
import { applyFileCategories, isGitRepo, createGitBackup } from '../lib/apply.js'
import { needsProjectMigration, migrateToProjectSystem, readAiorgFile, addKitToProject } from '../lib/project.js'
import * as logger from '../utils/logger.js'
import { login } from './login.js'

interface UpgradeOptions {
  yes?: boolean
  backup?: boolean
}

export async function upgrade(options: UpgradeOptions): Promise<void> {
  p.intro(pc.cyan('aiorg upgrade'))

  // Detect kit in current directory
  const kit = await detectKitInCwd()

  if (!kit) {
    logger.error('Not in a kit directory')
    logger.log(pc.dim('Run this command from a folder with .claude/version.json'))
    process.exit(1)
  }

  logger.keyValue('Kit', pc.magenta(kit.displayName))
  logger.keyValue('Current version', pc.cyan(`v${kit.version}`))

  // Check if this installation needs project migration
  // Personal kits (like Investor OS) skip project linking entirely
  if (!kit.isPersonal) {
    if (await needsProjectMigration(kit.rootPath)) {
      const projectName = await migrateToProjectSystem(kit.rootPath, kit.name)
      if (!projectName) {
        // User cancelled migration - that's OK, continue with upgrade
        logger.blank()
        logger.log(pc.dim('Skipping project setup. You can run it later.'))
      }
    } else {
      // Already has project, just ensure kit is listed
      const aiorgFile = await readAiorgFile(kit.rootPath)
      if (aiorgFile) {
        await addKitToProject(aiorgFile.project, kit.name)
      }
    }
  }

  // Check for updates
  const spinner = p.spinner()
  spinner.start('Checking for updates...')

  let latest
  try {
    latest = await fetchLatestVersion(kit.name)
    spinner.stop('Version info fetched')
  } catch (error) {
    spinner.stop('Failed to check for updates')
    throw error
  }

  // Compare versions
  if (!semver.gt(latest.version, kit.version)) {
    logger.blank()
    logger.success(`Already on latest version (${pc.cyan(`v${kit.version}`)})`)
    p.outro('')
    return
  }

  // Show update available
  logger.blank()
  logger.log(
    `Update available: ${pc.cyan(`v${kit.version}`)} → ${pc.green(`v${latest.version}`)}`
  )

  // Show changelog for ALL intermediate versions
  // API returns allVersions array with { version, changelog, releasedAt } objects
  if (latest.allVersions && Array.isArray(latest.allVersions)) {
    // Filter versions between current and latest (exclusive current, inclusive latest)
    const versionsToShow = latest.allVersions
      .filter((v: { version: string }) => {
        if (!semver.valid(v.version)) return false
        try {
          return semver.gt(v.version, kit.version) && semver.lte(v.version, latest.version)
        } catch {
          return false
        }
      })
      .sort((a: { version: string }, b: { version: string }) =>
        semver.rcompare(a.version, b.version)
      ) // newest first

    if (versionsToShow.length > 0) {
      logger.blank()
      const versionCount = versionsToShow.length
      logger.header(`Changelog (${versionCount} version${versionCount > 1 ? 's' : ''})`)

      for (const versionEntry of versionsToShow) {
        const { version, changelog: entry } = versionEntry as {
          version: string
          changelog: { highlights?: string[]; added?: string[]; upgradeNotes?: string }
        }
        if (!entry) continue

        // Version header with highlights
        const highlights = entry.highlights?.join(', ') || ''
        logger.blank()
        logger.log(`${pc.green(`v${version}`)}${highlights ? ` - ${pc.white(highlights)}` : ''}`)

        // Show first 2 added items (condensed)
        if (entry.added && entry.added.length > 0) {
          for (const item of entry.added.slice(0, 2)) {
            logger.log(pc.dim(`  + ${item}`))
          }
          if (entry.added.length > 2) {
            logger.log(pc.dim(`  + ... and ${entry.added.length - 2} more`))
          }
        }

        // Show upgrade notes if present (important for breaking changes)
        if (entry.upgradeNotes && version === latest.version) {
          logger.log(pc.yellow(`  Note: ${entry.upgradeNotes}`))
        }
      }
    }
  }

  // Show what will be preserved
  logger.blank()
  logger.log('Your data will be preserved:')
  const neverTouch = kit.versionJson.fileCategories?.neverTouch ?? []
  for (const pattern of neverTouch.slice(0, 5)) {
    logger.listItem(pc.dim(pattern))
  }
  if (neverTouch.length > 5) {
    logger.log(pc.dim(`  ... and ${neverTouch.length - 5} more patterns`))
  }

  // Confirm upgrade
  if (!options.yes) {
    logger.blank()
    const shouldUpgrade = await p.confirm({
      message: 'Proceed with upgrade?',
      initialValue: true,
    })

    if (p.isCancel(shouldUpgrade) || !shouldUpgrade) {
      p.cancel('Upgrade cancelled')
      return
    }
  }

  // Check if kit is free (no license required)
  const isFreeKit = latest.tier === 'free'
  let licenseKey: string | null = null

  // Only require login for paid kits
  if (!isFreeKit) {
    if (!(await isLoggedIn())) {
      logger.blank()
      logger.info('Login required for download')
      await login()
      logger.blank()
    }

    licenseKey = await getLicenseKey()
    if (!licenseKey) {
      logger.error('No license key found')
      process.exit(1)
    }
  }

  // Git backup
  const inGitRepo = await isGitRepo(kit.rootPath)
  if (inGitRepo) {
    if (options.backup) {
      spinner.start('Creating git backup...')
      const created = await createGitBackup(
        kit.rootPath,
        `chore: backup before upgrade to v${latest.version}`
      )
      spinner.stop(created ? 'Git backup created' : 'No changes to backup')
    } else if (!options.yes) {
      const shouldBackup = await p.confirm({
        message: 'Create git backup commit first?',
        initialValue: true,
      })

      if (shouldBackup === true) {
        spinner.start('Creating git backup...')
        const created = await createGitBackup(
          kit.rootPath,
          `chore: backup before upgrade to v${latest.version}`
        )
        spinner.stop(created ? 'Git backup created' : 'No changes to backup')
      }
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
    downloadInfo = await getDownloadUrl(kit.name, licenseKey)
    spinner.stop(isFreeKit ? 'Ready to download' : 'License verified')
  } catch (error) {
    spinner.stop(isFreeKit ? 'Failed to get download URL' : 'License verification failed')
    throw error
  }

  // Download
  spinner.start(`Downloading v${latest.version}...`)

  let tempDir: string | null = null
  try {
    tempDir = await createTempDir('aiorg-upgrade-')
    const zipPath = path.join(tempDir, 'kit.zip')
    const extractPath = path.join(tempDir, 'extracted')

    const zipData = await downloadFile(downloadInfo.downloadUrl)
    await saveToFile(zipData, zipPath)

    const sizeKB = await getFileSizeKB(zipPath)
    spinner.stop(`Downloaded v${latest.version} (${sizeKB} KB)`)

    // Extract to temp
    spinner.start('Extracting...')
    await extractZipToDir(zipPath, extractPath)
    spinner.stop('Extracted')

    // Read fileCategories from NEW version (extracted), not old local version
    // This is critical - old kit might not have fileCategories defined
    const newKit = await detectKit(extractPath)
    if (!newKit) {
      throw new Error('Failed to read version.json from downloaded kit')
    }

    // Apply fileCategories from new version
    spinner.start('Applying updates...')
    const result = await applyFileCategories(
      extractPath,
      kit.rootPath,
      newKit.versionJson
    )
    spinner.stop('Updates applied')

    // Write upgrade marker for "what's new" on next Claude session
    const markerPath = path.join(kit.rootPath, '.upgrade-marker.json')
    const marker = {
      fromVersion: kit.version,
      toVersion: latest.version,
      kitName: kit.packageName,
      upgradedAt: new Date().toISOString(),
    }
    await fs.writeFile(markerPath, JSON.stringify(marker, null, 2))

    // Show summary
    logger.blank()
    logger.success(
      `Upgraded ${kit.displayName}: ${pc.cyan(`v${kit.version}`)} → ${pc.green(`v${latest.version}`)}`
    )
    logger.blank()
    logger.keyValue('Files updated', String(result.replaced.length))
    if (result.merged.length > 0) {
      logger.keyValue('Files merged', String(result.merged.length))
    }
    if (result.added.length > 0) {
      logger.keyValue('Files added', String(result.added.length))
    }
    logger.keyValue('Files preserved', String(result.skipped.length))

    if (result.errors.length > 0) {
      logger.blank()
      logger.warn(`${result.errors.length} errors occurred:`)
      for (const err of result.errors) {
        logger.listItem(pc.dim(err))
      }
    }

    // Cleanup
    await cleanupTempDir(tempDir)
  } catch (error) {
    if (tempDir) {
      await cleanupTempDir(tempDir)
    }
    throw error
  }

  // Post-upgrade note
  logger.blank()
  logger.log(pc.yellow('⚠️  Restart Claude Code to use new commands'))
  logger.log(pc.dim('   Type "exit" then start a new session'))

  p.outro(pc.green('Upgrade complete!'))
}
