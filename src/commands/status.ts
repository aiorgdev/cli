import * as p from '@clack/prompts'
import pc from 'picocolors'
import { detectKitInCwd } from '../lib/detect.js'
import {
  readAiorgFile,
  readProjectContext,
  listProjects,
  getProjectDir,
} from '../lib/project.js'
import * as logger from '../utils/logger.js'

export async function status(): Promise<void> {
  p.intro(pc.cyan('aiorg status'))

  // Check for kit in current directory
  const kit = await detectKitInCwd()
  const aiorgFile = await readAiorgFile(process.cwd())

  if (!kit && !aiorgFile) {
    // Show global status
    const projects = await listProjects()

    if (projects.length === 0) {
      logger.info('No AI Org projects found')
      logger.blank()
      logger.log(pc.dim('Get started with:'))
      logger.listItem('npx @aiorg/cli init <kit-name> <path>')
      p.outro('')
      return
    }

    logger.header('Your Projects')

    for (const projectName of projects) {
      const context = await readProjectContext(projectName)
      if (context) {
        logger.blank()
        logger.log(pc.cyan(projectName))
        if (context.business?.name) {
          logger.log(pc.dim(`  Business: ${context.business.name}`))
        }
        if (context.business?.stage) {
          logger.log(pc.dim(`  Stage: ${context.business.stage}`))
        }
        if (context.installedKits && context.installedKits.length > 0) {
          logger.log(pc.dim(`  Kits: ${context.installedKits.join(', ')}`))
        }
        if (context.pmf?.status && context.pmf.status !== 'not-started') {
          logger.log(pc.dim(`  PMF: ${context.pmf.status}`))
        }
      } else {
        logger.blank()
        logger.log(pc.cyan(projectName))
        logger.log(pc.dim('  (no context)'))
      }
    }

    logger.blank()
    logger.log(pc.dim(`Projects stored in: ~/.aiorg/projects/`))
    p.outro('')
    return
  }

  // Show status for current directory
  if (kit) {
    logger.keyValue('Kit', pc.magenta(kit.displayName))
    logger.keyValue('Version', pc.cyan(`v${kit.version}`))
  }

  if (aiorgFile) {
    logger.keyValue('Project', pc.cyan(aiorgFile.project))

    const context = await readProjectContext(aiorgFile.project)
    if (context) {
      logger.blank()
      logger.header('Project Context')

      if (context.business?.name) {
        logger.keyValue('Business', context.business.name)
      }
      if (context.business?.stage) {
        logger.keyValue('Stage', context.business.stage)
      }
      if (context.validation?.ideaValidated) {
        logger.keyValue('Idea Validated', pc.green('Yes'))
        if (context.validation.ideaScore) {
          logger.keyValue('Idea Score', `${context.validation.ideaScore}/100`)
        }
      }
      if (context.pmf?.status && context.pmf.status !== 'not-started') {
        const pmfColor = context.pmf.status === 'achieved' ? pc.green : pc.yellow
        logger.keyValue('PMF Status', pmfColor(context.pmf.status))
        if (context.pmf.score !== null && context.pmf.score !== undefined) {
          logger.keyValue('PMF Score', `${context.pmf.score}/100`)
        }
      }
      if (context.installedKits && context.installedKits.length > 0) {
        logger.blank()
        logger.log(pc.dim('Installed kits:'))
        for (const kitName of context.installedKits) {
          logger.listItem(kitName)
        }
      }

      logger.blank()
      logger.log(pc.dim(`Context: ~/.aiorg/projects/${aiorgFile.project}/`))
    }
  } else if (kit) {
    logger.blank()
    logger.warn('Not linked to a project')
    logger.log(pc.dim('Run upgrade to set up project linking'))
  }

  p.outro('')
}
