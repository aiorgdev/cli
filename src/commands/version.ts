import pc from 'picocolors'
import semver from 'semver'
import { detectKitInCwd } from '../lib/detect.js'
import { fetchLatestVersion } from '../lib/api.js'
import * as logger from '../utils/logger.js'

const CLI_VERSION = '1.0.0'

export async function version(): Promise<void> {
  logger.header('aiorg version')

  // CLI version
  logger.keyValue('CLI', pc.cyan(`v${CLI_VERSION}`))

  // Detect kit in current directory
  const kit = await detectKitInCwd()

  if (!kit) {
    logger.blank()
    logger.info('No kit detected in current directory')
    logger.log(pc.dim('Run this command from a folder containing a kit'))
    return
  }

  // Show current kit version
  logger.keyValue(kit.displayName, pc.cyan(`v${kit.version}`))

  // Check for updates
  try {
    const latest = await fetchLatestVersion(kit.name)

    if (semver.gt(latest.version, kit.version)) {
      logger.blank()
      logger.warn(
        `Update available: ${pc.cyan(`v${kit.version}`)} → ${pc.green(`v${latest.version}`)}`
      )
      logger.log(pc.dim("Run 'aiorg upgrade' to update"))
    } else {
      logger.blank()
      logger.success('You are on the latest version')
    }
  } catch {
    // Silently ignore API errors for version check
    logger.blank()
    logger.log(pc.dim('Could not check for updates'))
  }
}
