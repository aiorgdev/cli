import * as p from '@clack/prompts'
import pc from 'picocolors'
import { verifyLicense } from '../lib/api.js'
import { saveLicenseKey, isLoggedIn, loadConfig } from '../lib/auth.js'
import * as logger from '../utils/logger.js'

export async function login(): Promise<void> {
  p.intro(pc.cyan('aiorg login'))

  // Check if already logged in
  if (await isLoggedIn()) {
    const config = await loadConfig()
    const shouldContinue = await p.confirm({
      message: `Already logged in${config?.email ? ` as ${pc.cyan(config.email)}` : ''}. Replace license key?`,
      initialValue: false,
    })

    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.outro('Login cancelled')
      return
    }
  }

  // Get license key
  const licenseKey = await p.text({
    message: 'Enter your license key',
    placeholder: 'ak_live_xxxxx',
    validate: (value) => {
      if (!value) return 'License key is required'
      if (!value.startsWith('ak_')) return 'License key should start with "ak_"'
      return undefined
    },
  })

  if (p.isCancel(licenseKey)) {
    p.cancel('Login cancelled')
    process.exit(0)
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
