import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { latestSchemaVersion, migrations, type Migration } from './migrations'

interface MigrationRow {
	readonly version: number
	readonly name: string
	readonly checksum: string
}

function isMigrationRow(value: unknown): value is MigrationRow {
	if (typeof value !== 'object' || value === null) return false
	const row = value as Record<string, unknown>
	return (
		Number.isSafeInteger(row.version) &&
		typeof row.name === 'string' &&
		typeof row.checksum === 'string'
	)
}

function configureDatabase(database: DatabaseSync): void {
	database.exec('PRAGMA journal_mode = WAL')
	database.exec('PRAGMA synchronous = FULL')
	database.exec('PRAGMA foreign_keys = ON')
	database.exec('PRAGMA trusted_schema = OFF')
}

function ensureMigrationTable(database: DatabaseSync): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			checksum TEXT NOT NULL,
			applied_at TEXT NOT NULL
		) STRICT
	`)
}

function appliedMigrations(database: DatabaseSync): readonly MigrationRow[] {
	const rows = database
		.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
		.all()
	return rows.map((row) => {
		if (!isMigrationRow(row)) throw new Error('Migration metadata is invalid.')
		return {
			version: row.version,
			name: row.name,
			checksum: row.checksum
		}
	})
}

function validateMigrationHistory(rows: readonly MigrationRow[]): void {
	for (const row of rows) {
		const expected = migrations.find((candidate) => candidate.version === row.version)
		if (expected === undefined) {
			throw new Error(`Database schema version ${String(row.version)} is not supported.`)
		}
		if (expected.name !== row.name || expected.checksum !== row.checksum) {
			throw new Error(`Migration ${String(row.version)} does not match its checksum.`)
		}
	}
}

function applyMigration(database: DatabaseSync, nextMigration: Migration): void {
	database.exec('BEGIN IMMEDIATE')
	try {
		database.exec(nextMigration.sql)
		database
			.prepare(
				'INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
			)
			.run(
				nextMigration.version,
				nextMigration.name,
				nextMigration.checksum,
				new Date().toISOString()
			)
		database.exec('COMMIT')
	} catch (error) {
		database.exec('ROLLBACK')
		throw error
	}
}

function quickCheck(database: DatabaseSync): void {
	const result = database.prepare('PRAGMA quick_check').get() as
		{ readonly quick_check?: unknown } | undefined
	if (result?.quick_check !== 'ok') throw new Error('SQLite quick_check failed.')
}

export class TrackMeDatabase {
	readonly connection: DatabaseSync
	readonly schemaVersion: number
	#closed = false

	constructor(connection: DatabaseSync, schemaVersion: number) {
		this.connection = connection
		this.schemaVersion = schemaVersion
	}

	transaction<Result>(operation: () => Result): Result {
		this.connection.exec('BEGIN IMMEDIATE')
		try {
			const result = operation()
			this.connection.exec('COMMIT')
			return result
		} catch (error) {
			this.connection.exec('ROLLBACK')
			throw error
		}
	}

	async backupTo(destinationPath: string): Promise<void> {
		await mkdir(dirname(destinationPath), { recursive: true })
		await backup(this.connection, destinationPath)
		const verification = new DatabaseSync(destinationPath, {
			open: true,
			readOnly: true,
			enableForeignKeyConstraints: true,
			enableDoubleQuotedStringLiterals: false,
			allowExtension: false,
			timeout: 1_000
		})
		try {
			quickCheck(verification)
		} finally {
			verification.close()
		}
	}

	close(): void {
		if (this.#closed) return
		this.#closed = true
		this.connection.close()
	}
}

export async function openTrackMeDatabase(path: string): Promise<TrackMeDatabase> {
	await mkdir(dirname(path), { recursive: true })
	const database = new DatabaseSync(path, {
		open: true,
		readOnly: false,
		enableForeignKeyConstraints: true,
		enableDoubleQuotedStringLiterals: false,
		allowExtension: false,
		timeout: 2_000
	})
	try {
		configureDatabase(database)
		ensureMigrationTable(database)
		const applied = appliedMigrations(database)
		validateMigrationHistory(applied)
		const appliedVersions = new Set(applied.map((row) => row.version))
		const pending = migrations.filter((candidate) => !appliedVersions.has(candidate.version))
		if (pending.length > 0 && applied.length > 0 && path !== ':memory:') {
			await backup(database, `${path}.pre-migration`)
		}
		for (const nextMigration of pending) applyMigration(database, nextMigration)
		quickCheck(database)
		return new TrackMeDatabase(database, latestSchemaVersion)
	} catch (error) {
		database.close()
		throw error
	}
}
