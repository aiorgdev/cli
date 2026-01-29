import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { z } from 'zod'
import * as logger from '../utils/logger.js'

// Schema for .aiorg file (links folder to project)
const AiorgFileSchema = z.object({
  project: z.string(),
  version: z.string().optional(),
})

// Schema for context.json (shared project context)
// CLI creates minimal context - kits add their own fields as needed
const ContextJsonSchema = z.object({
  version: z.string(),
  // Business info - added by business kits (Idea OS, Product OS, Marketing OS)
  business: z.object({
    name: z.string(),
    description: z.string().optional(),
    stage: z.enum(['idea', 'building', 'launched', 'pmf', 'scaling']).optional(),
    launchDate: z.string().optional(),
  }).optional(),
  // Validation data - added by Idea OS
  validation: z.object({
    ideaValidated: z.boolean().optional(),
    ideaScore: z.number().optional(),
    targetCustomer: z.string().optional(),
    valueProp: z.string().optional(),
    validatedAt: z.string().optional(),
  }).optional(),
  // PMF data - added by Product OS
  pmf: z.object({
    status: z.enum(['not-started', 'searching', 'approaching', 'achieved']).optional(),
    score: z.number().nullable().optional(),
    seanEllisScore: z.number().nullable().optional(),
    activationRate: z.number().nullable().optional(),
    weeklyRetention: z.number().nullable().optional(),
    measuredAt: z.string().nullable().optional(),
  }).optional(),
  installedKits: z.array(z.string()).optional(),
  lastUpdated: z.string(),
  updatedBy: z.string(),
})

export type AiorgFile = z.infer<typeof AiorgFileSchema>
export type ContextJson = z.infer<typeof ContextJsonSchema>

/**
 * Get the path to ~/.aiorg/ directory
 */
export function getAiorgDir(): string {
  return path.join(os.homedir(), '.aiorg')
}

/**
 * Get the path to ~/.aiorg/projects/ directory
 */
export function getProjectsDir(): string {
  return path.join(getAiorgDir(), 'projects')
}

/**
 * Get the path to a specific project's directory
 */
export function getProjectDir(projectName: string): string {
  return path.join(getProjectsDir(), projectName)
}

/**
 * Check if ~/.aiorg/ exists and is initialized
 */
export async function isAiorgInitialized(): Promise<boolean> {
  return fs.pathExists(getProjectsDir())
}

/**
 * Initialize ~/.aiorg/ directory structure
 */
export async function initializeAiorg(): Promise<void> {
  const aiorgDir = getAiorgDir()
  const projectsDir = getProjectsDir()

  await fs.ensureDir(projectsDir)

  // Create config.json if it doesn't exist
  const configPath = path.join(aiorgDir, 'config.json')
  if (!(await fs.pathExists(configPath))) {
    await fs.writeJson(configPath, {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    }, { spaces: 2 })
  }
}

/**
 * List all existing projects
 */
export async function listProjects(): Promise<string[]> {
  const projectsDir = getProjectsDir()

  if (!(await fs.pathExists(projectsDir))) {
    return []
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

/**
 * Check if a project exists
 */
export async function projectExists(projectName: string): Promise<boolean> {
  const projectDir = getProjectDir(projectName)
  return fs.pathExists(projectDir)
}

/**
 * Create a new project with minimal context
 * Business kits (Idea OS, Product OS, Marketing OS) add their own data via /setup
 */
export async function createProject(
  projectName: string,
  kitName: string
): Promise<void> {
  const projectDir = getProjectDir(projectName)

  // Ensure parent directories exist
  await initializeAiorg()

  // Create project directory
  await fs.ensureDir(projectDir)

  // Create minimal context.json
  // Kits add business/validation/pmf data as needed
  const contextJson = {
    version: '1.0.0',
    installedKits: [kitName],
    lastUpdated: new Date().toISOString(),
    updatedBy: kitName,
  }

  await fs.writeJson(
    path.join(projectDir, 'context.json'),
    contextJson,
    { spaces: 2 }
  )

  // Create empty learnings.json
  await fs.writeJson(
    path.join(projectDir, 'learnings.json'),
    {
      version: '1.0.0',
      whatWorks: [],
      whatDoesntWork: [],
    },
    { spaces: 2 }
  )
}

/**
 * Read the .aiorg file from a directory
 */
export async function readAiorgFile(dirPath: string): Promise<AiorgFile | null> {
  const aiorgPath = path.join(dirPath, '.aiorg')

  if (!(await fs.pathExists(aiorgPath))) {
    return null
  }

  try {
    const content = await fs.readJson(aiorgPath)
    return AiorgFileSchema.parse(content)
  } catch {
    return null
  }
}

/**
 * Write the .aiorg file to a directory
 */
export async function writeAiorgFile(dirPath: string, projectName: string): Promise<void> {
  const aiorgPath = path.join(dirPath, '.aiorg')
  const aiorgFile: AiorgFile = {
    project: projectName,
    version: '1.0.0',
  }
  await fs.writeJson(aiorgPath, aiorgFile, { spaces: 2 })
}

/**
 * Add a kit to an existing project's installedKits list
 */
export async function addKitToProject(projectName: string, kitName: string): Promise<void> {
  const contextPath = path.join(getProjectDir(projectName), 'context.json')

  if (!(await fs.pathExists(contextPath))) {
    return
  }

  try {
    const context = await fs.readJson(contextPath)
    const installedKits = context.installedKits || []

    if (!installedKits.includes(kitName)) {
      installedKits.push(kitName)
      context.installedKits = installedKits
      context.lastUpdated = new Date().toISOString()
      await fs.writeJson(contextPath, context, { spaces: 2 })
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Read context.json for a project
 */
export async function readProjectContext(projectName: string): Promise<ContextJson | null> {
  const contextPath = path.join(getProjectDir(projectName), 'context.json')

  if (!(await fs.pathExists(contextPath))) {
    return null
  }

  try {
    const content = await fs.readJson(contextPath)
    return ContextJsonSchema.parse(content)
  } catch {
    return null
  }
}

/**
 * Suggest a project name from the directory name
 */
export function suggestProjectName(dirPath: string): string {
  const dirName = path.basename(dirPath)
  // Convert to kebab-case, remove special chars
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Interactive project setup
 * Returns the project name that was set up
 */
export async function setupProject(
  targetPath: string,
  kitName: string,
  options: { silent?: boolean } = {}
): Promise<string | null> {
  // Check if already linked to a project
  const existingAiorg = await readAiorgFile(targetPath)
  if (existingAiorg) {
    // Already has a project, just add the kit
    await addKitToProject(existingAiorg.project, kitName)

    if (!options.silent) {
      const context = await readProjectContext(existingAiorg.project)
      if (context) {
        logger.blank()
        logger.info(`Linked to project: ${pc.cyan(existingAiorg.project)}`)
        if (context.installedKits && context.installedKits.length > 0) {
          logger.log(pc.dim(`  Installed kits: ${context.installedKits.join(', ')}`))
        }
      }
    }

    return existingAiorg.project
  }

  // Initialize ~/.aiorg/ if needed
  await initializeAiorg()

  // Get existing projects
  const existingProjects = await listProjects()

  let projectName: string

  if (existingProjects.length > 0) {
    // Ask: new or existing project?
    logger.blank()
    logger.header('Project Setup')
    logger.log(pc.dim('AI Org kits can share context across a project.'))
    logger.blank()

    const projectChoice = await p.select({
      message: 'Link this kit to:',
      options: [
        ...existingProjects.map(name => ({
          value: name,
          label: name,
          hint: 'existing project',
        })),
        {
          value: '__new__',
          label: 'Create new project',
          hint: 'start fresh',
        },
      ],
    })

    if (p.isCancel(projectChoice)) {
      return null
    }

    if (projectChoice === '__new__') {
      // Create new project
      const newProjectName = await askForNewProject(targetPath, kitName)
      if (!newProjectName) return null
      projectName = newProjectName
    } else {
      projectName = projectChoice as string
      // Add kit to existing project
      await addKitToProject(projectName, kitName)
    }
  } else {
    // First project ever
    logger.blank()
    logger.header('Project Setup')
    logger.log(pc.dim('AI Org kits share context through projects.'))
    logger.log(pc.dim('This helps kits work together and share data.'))
    logger.blank()

    const newProjectName = await askForNewProject(targetPath, kitName)
    if (!newProjectName) return null
    projectName = newProjectName
  }

  // Create .aiorg file
  await writeAiorgFile(targetPath, projectName)

  // Show success
  if (!options.silent) {
    logger.blank()
    logger.success(`Project ${pc.cyan(projectName)} linked`)
    logger.log(pc.dim(`  Context: ~/.aiorg/projects/${projectName}/`))
  }

  return projectName
}

/**
 * Ask user for new project details and create it
 */
async function askForNewProject(
  targetPath: string,
  kitName: string
): Promise<string | null> {
  const suggestedName = suggestProjectName(targetPath)

  const projectName = await p.text({
    message: 'Project name:',
    placeholder: suggestedName,
    defaultValue: suggestedName,
    validate: (value) => {
      if (!value) return 'Project name is required'
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Use lowercase letters, numbers, and hyphens only'
      }
      return undefined
    },
  })

  if (p.isCancel(projectName)) {
    return null
  }

  // Create project with minimal context
  // Business kits (Idea OS, Product OS, Marketing OS) will ask for business name in /setup
  await createProject(projectName as string, kitName)

  return projectName as string
}

/**
 * Check if this is an existing kit installation that needs migration
 * (has kit files but no .aiorg file)
 */
export async function needsProjectMigration(dirPath: string): Promise<boolean> {
  const aiorgFile = await readAiorgFile(dirPath)
  if (aiorgFile) {
    // Already has project link
    return false
  }

  // Check for signs of existing kit installation
  const hasClaudeDir = await fs.pathExists(path.join(dirPath, '.claude'))
  const hasVersionJson = await fs.pathExists(path.join(dirPath, '.claude', 'version.json'))

  return hasClaudeDir && hasVersionJson
}

/**
 * Migrate an existing installation to the project system
 */
export async function migrateToProjectSystem(
  dirPath: string,
  kitName: string
): Promise<string | null> {
  logger.blank()
  logger.info('This kit installation needs to be linked to a project.')
  logger.log(pc.dim('Projects allow kits to share context and work together.'))

  return setupProject(dirPath, kitName)
}
