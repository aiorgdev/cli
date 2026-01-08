import pc from 'picocolors'
import { fetchKitsList } from '../lib/api.js'
import * as logger from '../utils/logger.js'

/**
 * Format price in cents to display string
 */
function formatPrice(cents: number): string {
  if (cents === 0) return ''
  return `$${(cents / 100).toFixed(0)}`
}

/**
 * List all available kits
 */
export async function list(): Promise<void> {
  const { kits } = await fetchKitsList()

  if (kits.length === 0) {
    logger.warn('No kits available')
    return
  }

  // Group by tier
  const freeKits = kits.filter(k => k.tier === 'free')
  const paidKits = kits.filter(k => k.tier === 'paid')

  logger.blank()
  console.log(pc.bold('Available Kits'))
  logger.blank()

  // Free kits
  if (freeKits.length > 0) {
    console.log(pc.green(pc.bold('FREE')))
    logger.blank()
    for (const kit of freeKits) {
      printKit(kit)
    }
  }

  // Paid kits
  if (paidKits.length > 0) {
    console.log(pc.yellow(pc.bold('PAID')))
    logger.blank()
    for (const kit of paidKits) {
      printKit(kit)
    }
  }

  // Footer
  console.log(pc.dim('─'.repeat(50)))
  logger.blank()
  console.log(pc.dim('Free kits work without login.'))
  console.log(pc.dim(`Run '${pc.cyan('aiorg login')}' first for paid kits.`))
  console.log(pc.dim(`Visit ${pc.cyan('https://aiorg.dev')} for details.`))
  logger.blank()
}

function printKit(kit: {
  name: string
  displayName: string
  description: string | null
  tier: 'free' | 'paid'
  version: string
  priceCents: number
}): void {
  const price = formatPrice(kit.priceCents)
  const priceStr = price ? pc.yellow(price) : ''

  // Kit name and version
  console.log(
    `  ${pc.bold(kit.name.padEnd(24))} ${pc.cyan(`v${kit.version}`)}  ${priceStr}`
  )

  // Description
  if (kit.description) {
    console.log(`  ${pc.dim(kit.description)}`)
  }

  // Example command
  console.log(
    `  ${pc.dim('→')} ${pc.dim('npx @aiorg/cli init')} ${pc.magenta(kit.name)} ${pc.dim('~/my-project')}`
  )

  logger.blank()
}
