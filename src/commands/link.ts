import * as p from '@clack/prompts'
import pc from 'picocolors'
import { detectKitInCwd } from '../lib/detect.js'
import {
  readAiorgFile,
  writeAiorgFile,
  listProjects,
  projectExists,
  createProject,
  addKitToProject,
  readProjectContext,
} from '../lib/project.js'
import * as logger from '../utils/logger.js'

export async function link(): Promise<void> {
  p.intro(pc.cyan('aiorg link'))

  const cwd = process.cwd()

  // Check for kit in current directory
  const kit = await detectKitInCwd()
  if (!kit) {
    logger.error('No kit found in current directory')
    logger.blank()
    logger.log(pc.dim('Run this command from a folder with an AI Org kit.'))
    p.outro('')
    process.exit(1)
  }

  // Check current link
  const currentAiorg = await readAiorgFile(cwd)
  if (currentAiorg) {
    logger.info(`Currently linked to: ${pc.cyan(currentAiorg.project)}`)
    logger.blank()
  }

  // Get existing projects
  const existingProjects = await listProjects()

  // Build options
  const options: { value: string; label: string; hint?: string }[] = []

  if (existingProjects.length > 0) {
    for (const name of existingProjects) {
      const isCurrent = currentAiorg?.project === name
      options.push({
        value: name,
        label: isCurrent ? `${name} ${pc.dim('(current)')}` : name,
        hint: isCurrent ? 'no change' : 'existing project',
      })
    }
  }

  options.push({
    value: '__new__',
    label: 'Create new project',
    hint: 'start fresh',
  })

  // Ask user
  const projectChoice = await p.select({
    message: 'Link this kit to:',
    options,
  })

  if (p.isCancel(projectChoice)) {
    p.outro(pc.dim('Cancelled'))
    return
  }

  let projectName: string

  if (projectChoice === '__new__') {
    // Ask for new project name
    const newName = await p.text({
      message: 'Project name:',
      placeholder: 'my-project',
      validate: (value) => {
        if (!value) return 'Project name is required'
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only'
        }
        return undefined
      },
    })

    if (p.isCancel(newName)) {
      p.outro(pc.dim('Cancelled'))
      return
    }

    projectName = newName as string

    // Check if project already exists
    if (await projectExists(projectName)) {
      logger.warn(`Project "${projectName}" already exists, linking to it`)
      await addKitToProject(projectName, kit.name)
    } else {
      // Create new project
      await createProject(projectName, kit.name)
      logger.success(`Created project: ${pc.cyan(projectName)}`)
    }
  } else {
    projectName = projectChoice as string

    // Check if it's the same as current
    if (currentAiorg?.project === projectName) {
      logger.info('Already linked to this project')
      p.outro('')
      return
    }

    // Add kit to existing project
    await addKitToProject(projectName, kit.name)
  }

  // Write .aiorg file
  await writeAiorgFile(cwd, projectName)

  // Show success
  logger.blank()
  logger.success(`Linked to project: ${pc.cyan(projectName)}`)

  const context = await readProjectContext(projectName)
  if (context?.installedKits && context.installedKits.length > 0) {
    logger.log(pc.dim(`  Kits: ${context.installedKits.join(', ')}`))
  }
  logger.log(pc.dim(`  Context: ~/.aiorg/projects/${projectName}/`))

  p.outro('')
}
