import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { latestSchemaVersion } from './migrations'
import { openTiempioDatabase } from './database'

async function withTemporaryDirectory(run: (path: string) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), 'tiempio-database-test-'))
	try {
		await run(directory)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

describe('Tiempio database', () => {
	it('creates the complete foundation schema and reopens it idempotently', async () => {
		await withTemporaryDirectory(async (directory) => {
			const path = join(directory, 'tiempio.sqlite3')
			const first = await openTiempioDatabase(path)
			assert.equal(first.schemaVersion, latestSchemaVersion)
			const tables = first.connection
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
				)
				.all()
				.map((row) => String((row as { name: unknown }).name))
			assert.ok(tables.includes('tasks'))
			assert.ok(tables.includes('application_settings'))
			assert.ok(tables.includes('recurrence_occurrences'))
			first.close()

			const second = await openTiempioDatabase(path)
			assert.equal(second.schemaVersion, latestSchemaVersion)
			assert.equal(
				Number(
					(
						second.connection
							.prepare('SELECT COUNT(*) AS count FROM schema_migrations')
							.get() as { count: unknown }
					).count
				),
				latestSchemaVersion
			)
			second.close()
		})
	})

	it('creates a verified SQLite backup', async () => {
		await withTemporaryDirectory(async (directory) => {
			const sourcePath = join(directory, 'tiempio.sqlite3')
			const backupPath = join(directory, 'backup', 'Tiempio.tiempio')
			const database = await openTiempioDatabase(sourcePath)
			await database.backupTo(backupPath)
			database.close()

			assert.ok((await readFile(backupPath)).length > 0)
			const restored = new DatabaseSync(backupPath, { readOnly: true })
			const result = restored.prepare('PRAGMA quick_check').get() as {
				readonly quick_check: unknown
			}
			assert.equal(result.quick_check, 'ok')
			restored.close()
		})
	})

	it('rejects changed migration history', async () => {
		await withTemporaryDirectory(async (directory) => {
			const path = join(directory, 'tiempio.sqlite3')
			const database = await openTiempioDatabase(path)
			database.connection
				.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1')
				.run('changed')
			database.close()

			await assert.rejects(openTiempioDatabase(path), /does not match its checksum/u)
		})
	})
})
