import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import {
  needsProjectMigration,
  readAiorgFile,
  writeAiorgFile,
  createProject,
  addKitToProject,
  readProjectContext,
  getProjectDir,
  listProjects,
} from '../lib/project.js'

describe('Project System', () => {
  const testDir = '/tmp/aiorg-test-project'
  const testProjectName = `test-project-${Date.now()}`

  beforeEach(async () => {
    // Clean up test directories
    await fs.remove(testDir)
    await fs.remove(getProjectDir(testProjectName))
  })

  afterEach(async () => {
    // Clean up
    await fs.remove(testDir)
    await fs.remove(getProjectDir(testProjectName))
  })

  describe('needsProjectMigration', () => {
    it('returns false for empty directory', async () => {
      await fs.ensureDir(testDir)
      expect(await needsProjectMigration(testDir)).toBe(false)
    })

    it('returns true for old kit installation without .aiorg', async () => {
      // Create old-style kit installation
      await fs.ensureDir(path.join(testDir, '.claude'))
      await fs.writeJson(path.join(testDir, '.claude', 'version.json'), {
        version: '1.0.0',
        packageName: 'test-kit',
      })

      expect(await needsProjectMigration(testDir)).toBe(true)
    })

    it('returns false when .aiorg exists', async () => {
      // Create kit installation with .aiorg
      await fs.ensureDir(path.join(testDir, '.claude'))
      await fs.writeJson(path.join(testDir, '.claude', 'version.json'), {
        version: '1.0.0',
        packageName: 'test-kit',
      })
      await fs.writeJson(path.join(testDir, '.aiorg'), {
        project: 'test-project',
      })

      expect(await needsProjectMigration(testDir)).toBe(false)
    })
  })

  describe('createProject', () => {
    it('creates context.json with correct structure', async () => {
      await createProject(testProjectName, 'Test Business', 'test-kit')

      const context = await readProjectContext(testProjectName)
      expect(context).not.toBeNull()
      expect(context?.business.name).toBe('Test Business')
      expect(context?.business.stage).toBe('building')
      expect(context?.installedKits).toContain('test-kit')
      expect(context?.pmf?.status).toBe('not-started')
    })

    it('creates learnings.json', async () => {
      await createProject(testProjectName, 'Test Business', 'test-kit')

      const learningsPath = path.join(getProjectDir(testProjectName), 'learnings.json')
      expect(await fs.pathExists(learningsPath)).toBe(true)

      const learnings = await fs.readJson(learningsPath)
      expect(learnings.whatWorks).toEqual([])
      expect(learnings.whatDoesntWork).toEqual([])
    })
  })

  describe('writeAiorgFile / readAiorgFile', () => {
    it('writes and reads .aiorg file correctly', async () => {
      await fs.ensureDir(testDir)
      await writeAiorgFile(testDir, testProjectName)

      const aiorgFile = await readAiorgFile(testDir)
      expect(aiorgFile).not.toBeNull()
      expect(aiorgFile?.project).toBe(testProjectName)
    })

    it('returns null for non-existent .aiorg', async () => {
      await fs.ensureDir(testDir)
      expect(await readAiorgFile(testDir)).toBeNull()
    })
  })

  describe('addKitToProject', () => {
    it('adds kit to installedKits', async () => {
      await createProject(testProjectName, 'Test Business', 'kit-1')
      await addKitToProject(testProjectName, 'kit-2')

      const context = await readProjectContext(testProjectName)
      expect(context?.installedKits).toContain('kit-1')
      expect(context?.installedKits).toContain('kit-2')
    })

    it('does not duplicate kits', async () => {
      await createProject(testProjectName, 'Test Business', 'kit-1')
      await addKitToProject(testProjectName, 'kit-1')
      await addKitToProject(testProjectName, 'kit-1')

      const context = await readProjectContext(testProjectName)
      const count = context?.installedKits?.filter(k => k === 'kit-1').length
      expect(count).toBe(1)
    })
  })

  describe('listProjects', () => {
    it('lists created projects', async () => {
      await createProject(testProjectName, 'Test Business', 'test-kit')

      const projects = await listProjects()
      expect(projects).toContain(testProjectName)
    })
  })
})
