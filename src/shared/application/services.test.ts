import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDefaultApplicationSettings, type TaskBoardSnapshot } from '../contracts'
import type { SettingsRepositoryPort, TaskRepositoryPort } from './ports'
import { SettingsApplicationService, TaskApplicationService } from './services'

describe('application services', () => {
	it('accepts an asynchronous settings adapter', async () => {
		const settings = createDefaultApplicationSettings()
		const repository: SettingsRepositoryPort = {
			get: () => Promise.resolve(settings),
			setAppearance: (appearance) => Promise.resolve({ ...settings, appearance }),
			setInterfaceLocale: (interfaceLocale) =>
				Promise.resolve({
					...settings,
					language: { interfaceLocale }
				})
		}
		const service = new SettingsApplicationService(repository)

		assert.deepEqual(await service.get(), settings)
		assert.equal((await service.setInterfaceLocale('es')).language.interfaceLocale, 'es')
	})

	it('keeps task use cases independent from the SQLite adapter', async () => {
		const snapshot: TaskBoardSnapshot = {
			tasks: [],
			archivedTaskCount: 0,
			projects: [],
			tags: []
		}
		const notUsed = (): never => {
			throw new Error('Unexpected repository operation.')
		}
		const repository: TaskRepositoryPort = {
			getBoard: () => Promise.resolve(snapshot),
			listArchived: notUsed,
			get: notUsed,
			create: notUsed,
			update: notUsed,
			changeStatus: notUsed,
			archive: notUsed,
			restore: notUsed,
			createProject: notUsed,
			updateProject: notUsed
		}
		const service = new TaskApplicationService(repository)

		assert.deepEqual(await service.getBoard(), snapshot)
	})
})
