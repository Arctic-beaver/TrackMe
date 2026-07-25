import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { openTiempioDatabase } from './database'
import { SqliteSettingsRepository } from './settingsRepository'

describe('settings repository', () => {
	it('persists appearance and language in the main SQLite database', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'tiempio-settings-test-'))
		try {
			const path = join(directory, 'tiempio.sqlite3')
			const firstDatabase = await openTiempioDatabase(path)
			const first = new SqliteSettingsRepository(firstDatabase)
			first.setAppearance({ family: 'fog-indigo', scheme: 'dark' })
			first.setInterfaceLocale('es')
			firstDatabase.close()

			const secondDatabase = await openTiempioDatabase(path)
			const restored = new SqliteSettingsRepository(secondDatabase).get()
			assert.deepEqual(restored.appearance, {
				family: 'fog-indigo',
				scheme: 'dark'
			})
			assert.equal(restored.language.interfaceLocale, 'es')
			secondDatabase.close()
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})

	it('repairs an invalid stored preference with defaults', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			database.connection
				.prepare(
					'INSERT INTO application_settings(key, value_json, value_version, updated_at) VALUES (?, ?, ?, ?)'
				)
				.run('application', '{"version": 99}', 99, new Date().toISOString())
			const settings = new SqliteSettingsRepository(database).get()
			assert.equal(settings.appearance.family, 'graphite-navy')
			assert.equal(settings.language.interfaceLocale, 'system')
		} finally {
			database.close()
		}
	})
})
