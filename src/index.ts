import cac from 'cac'
import { login } from './commands/login.js'
import { logout } from './commands/logout.js'
import { init } from './commands/init.js'
import { upgrade } from './commands/upgrade.js'
import { version } from './commands/version.js'
import * as logger from './utils/logger.js'

const cli = cac('aiorg')

// Login command
cli
  .command('login', 'Save your license key')
  .action(async () => {
    try {
      await login()
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Login failed')
      process.exit(1)
    }
  })

// Logout command
cli
  .command('logout', 'Remove saved license key')
  .action(async () => {
    try {
      await logout()
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Logout failed')
      process.exit(1)
    }
  })

// Init command
cli
  .command('init <kit> [path]', 'Download and extract a kit')
  .option('--force', 'Overwrite existing folder')
  .action(async (kit: string, path: string | undefined, options: { force?: boolean }) => {
    try {
      await init(kit, path, options)
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Init failed')
      process.exit(1)
    }
  })

// Upgrade command
cli
  .command('upgrade', 'Upgrade kit in current directory')
  .option('--yes, -y', 'Skip confirmation')
  .option('--backup', 'Always create git backup')
  .action(async (options: { yes?: boolean; backup?: boolean }) => {
    try {
      await upgrade(options)
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Upgrade failed')
      process.exit(1)
    }
  })

// Version command
cli
  .command('version', 'Show CLI and kit versions')
  .action(async () => {
    try {
      await version()
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Version check failed')
      process.exit(1)
    }
  })

// Global options
cli.help()
cli.version('1.0.0')

// Parse and run
cli.parse()
