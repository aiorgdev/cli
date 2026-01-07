import * as p from '@clack/prompts'
import pc from 'picocolors'
import { clearConfig, isLoggedIn, loadConfig } from '../lib/auth.js'
import * as logger from '../utils/logger.js'

export async function logout(): Promise<void> {
  p.intro(pc.cyan('aiorg logout'))

  // Check if logged in
  if (!(await isLoggedIn())) {
    logger.info('Not currently logged in')
    p.outro('')
    return
  }

  const config = await loadConfig()
  const email = config?.email

  // Confirm
  const shouldLogout = await p.confirm({
    message: `Log out${email ? ` from ${pc.cyan(email)}` : ''}?`,
    initialValue: true,
  })

  if (p.isCancel(shouldLogout) || !shouldLogout) {
    p.cancel('Logout cancelled')
    return
  }

  // Clear config
  await clearConfig()

  logger.success('Logged out')
  p.outro('')
}
