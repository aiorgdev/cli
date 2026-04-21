import * as p from '@clack/prompts'
import pc from 'picocolors'
import { verifyLicense } from '../lib/api.js'
import { saveLicenseKey, isLoggedIn, loadConfig } from '../lib/auth.js'
import * as logger from '../utils/logger.js'

export async function login(providedKey?: string): Promise<void> {
  p.intro(pc.cyan('aiorg login'))

  const isInteractive = Boolean(process.stdin.isTTY)

  // Check if already logged in — interactive confirms, non-interactive
  // with a new key overwrites silently (scripted/CI use).
  if (await isLoggedIn()) {
    const config = await loadConfig()
    if (providedKey) {
      logger.info(
        `Replacing existing login${config?.email ? ` (${config.email})` : ''}`,
      )
    } else if (isInteractive) {
      const shouldContinue = await p.confirm({
        message: `Already logged in${config?.email ? ` as ${pc.cyan(config.email)}` : ''}. Replace license key?`,
        initialValue: false,
      })

      if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.outro('Login cancelled')
        return
      }
    } else {
      logger.error(
        `Already logged in${config?.email ? ` as ${config.email}` : ''}. Pass the new key as an argument to replace it.`,
      )
      process.exit(1)
    }
  }

  // Get license key — from arg when provided, otherwise interactive prompt.
  // Non-interactive terminals (CI, spawned child processes) must pass the key.
  let licenseKey: string
  if (providedKey) {
    if (!providedKey.startsWith('ak_')) {
      logger.error('License key should start with "ak_"')
      process.exit(1)
    }
    licenseKey = providedKey
  } else if (!isInteractive) {
    logger.error('No TTY detected. Pass your key as an argument: aiorg login <key>')
    process.exit(1)
  } else {
    const prompted = await p.text({
      message: 'Enter your license key',
      placeholder: 'ak_live_xxxxx',
      validate: (value) => {
        if (!value) return 'License key is required'
        if (!value.startsWith('ak_')) return 'License key should start with "ak_"'
        return undefined
      },
    })

    if (p.isCancel(prompted)) {
      p.cancel('Login cancelled')
      process.exit(0)
    }
    licenseKey = prompted
  }

  // Verify with API
  const spinner = p.spinner()
  spinner.start('Verifying license...')

  try {
    const result = await verifyLicense(licenseKey)

    if (!result.valid) {
      spinner.stop('License verification failed')
      logger.error(result.error || 'Invalid license key')
      process.exit(1)
    }

    // Save to config
    const kitsRecord: Record<string, { tier: 'free' | 'paid' | 'private' | 'beta'; purchasedAt: string }> = {}
    if (result.kits) {
      for (const kit of result.kits) {
        kitsRecord[kit.name] = {
          tier: kit.tier,
          purchasedAt: kit.purchasedAt,
        }
      }
    }

    await saveLicenseKey(licenseKey, result.email, kitsRecord)
    spinner.stop('License verified')

    // Show success
    logger.blank()
    logger.success(`Logged in${result.email ? ` as ${pc.cyan(result.email)}` : ''}`)

    if (result.kits && result.kits.length > 0) {
      logger.blank()
      logger.log('Licensed kits:')
      for (const kit of result.kits) {
        logger.listItem(`${kit.name} (${kit.tier})`)
      }
    }

    p.outro('Ready to use aiorg kits!')
  } catch (error) {
    spinner.stop('License verification failed')
    throw error
  }
}
