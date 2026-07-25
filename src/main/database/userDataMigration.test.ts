import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, it } from 'node:test'
import { openTiempioDatabase } from './database'
import { SqliteSettingsRepository } from './settingsRepository'
import { SqliteTaskRepository } from './taskRepository'
import { prepareTiempioDatabasePath, tiempioDatabaseFile } from './userDataMigration'

const previousDirectory = Buffer.from('VHJhY2tNZQ==', 'base64').toString('utf8')
const previousDatabaseFile = Buffer.from('dHJhY2ttZS5zcWxpdGUz', 'base64').toString('utf8')

describe('user data migration', () => {
	it('copies a verified previous database into the Tiempio profile without deleting it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'tiempio-user-data-migration-'))
		const appDataPath = join(root, 'app-data')
		const userDataPath = join(appDataPath, 'Tiempio')
		const sourcePath = join(appDataPath, previousDirectory.toLowerCase(), previousDatabaseFile)
		try {
			await mkdir(dirname(sourcePath), { recursive: true })
			const source = await openTiempioDatabase(sourcePath)
			const settings = new SqliteSettingsRepository(source)
			settings.setInterfaceLocale('es')
			const tasks = new SqliteTaskRepository(source, {
				createId: () => 'preserved-task',
				now: () => '2026-07-25T10:00:00.000Z',
				currentLocalDate: () => '2026-07-25'
			})
			tasks.create({
				title: 'Preserved task',
				description: 'Migrated safely',
				status: 'todo',
				estimateDays: 1,
				dueDate: '2026-07-26',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: null,
				tagNames: ['Migration']
			})
			source.close()

			const destinationPath = await prepareTiempioDatabasePath({
				appDataPath,
				userDataPath
			})

			assert.equal(destinationPath, join(userDataPath, tiempioDatabaseFile))
			const migrated = await openTiempioDatabase(destinationPath)
			assert.equal(
				new SqliteSettingsRepository(migrated).get().language.interfaceLocale,
				'es'
			)
			assert.equal(
				new SqliteTaskRepository(migrated).getBoard().tasks[0]?.title,
				'Preserved task'
			)
			migrated.close()
			const original = await openTiempioDatabase(sourcePath)
			assert.equal(
				new SqliteTaskRepository(original).getBoard().tasks[0]?.description,
				'Migrated safely'
			)
			original.close()
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('never overwrites an existing Tiempio database', async () => {
		const root = await mkdtemp(join(tmpdir(), 'tiempio-user-data-existing-'))
		const appDataPath = join(root, 'app-data')
		const userDataPath = join(appDataPath, 'Tiempio')
		const destinationPath = join(userDataPath, tiempioDatabaseFile)
		try {
			await mkdir(userDataPath, { recursive: true })
			const current = new DatabaseSync(destinationPath)
			current.exec('CREATE TABLE current_data(value TEXT NOT NULL) STRICT')
			current.prepare('INSERT INTO current_data(value) VALUES (?)').run('current')
			current.close()

			assert.equal(
				await prepareTiempioDatabasePath({ appDataPath, userDataPath }),
				destinationPath
			)
			const reopened = new DatabaseSync(destinationPath, { readOnly: true })
			assert.equal(
				(
					reopened.prepare('SELECT value FROM current_data').get() as {
						readonly value: string
					}
				).value,
				'current'
			)
			reopened.close()
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})
