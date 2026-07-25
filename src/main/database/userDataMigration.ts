import { access, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const previousProductDirectory = Buffer.from('VHJhY2tNZQ==', 'base64').toString('utf8')
const previousDatabaseFile = Buffer.from('dHJhY2ttZS5zcWxpdGUz', 'base64').toString('utf8')
export const tiempioDatabaseFile = 'tiempio.sqlite3'

async function exists(path: string): Promise<boolean> {
	return access(path).then(
		() => true,
		() => false
	)
}

async function firstExisting(paths: readonly string[]): Promise<string | null> {
	for (const path of paths) {
		if (await exists(path)) return path
	}
	return null
}

function verifyDatabase(path: string): void {
	const database = new DatabaseSync(path, {
		open: true,
		readOnly: true,
		enableForeignKeyConstraints: true,
		enableDoubleQuotedStringLiterals: false,
		allowExtension: false,
		timeout: 1_000
	})
	try {
		const result = database.prepare('PRAGMA quick_check').get() as
			{ readonly quick_check?: unknown } | undefined
		if (result?.quick_check !== 'ok') throw new Error('Migrated SQLite quick_check failed.')
	} finally {
		database.close()
	}
}

export interface UserDataMigrationOptions {
	readonly appDataPath: string
	readonly userDataPath: string
	readonly migratePreviousInstallation?: boolean
}

export async function prepareTiempioDatabasePath(
	options: UserDataMigrationOptions
): Promise<string> {
	const destinationPath = join(options.userDataPath, tiempioDatabaseFile)
	if ((await exists(destinationPath)) || options.migratePreviousInstallation === false) {
		return destinationPath
	}

	const sourcePath = await firstExisting(
		[previousProductDirectory, previousProductDirectory.toLowerCase()].map((directory) =>
			join(options.appDataPath, directory, previousDatabaseFile)
		)
	)
	if (sourcePath === null) return destinationPath

	await mkdir(options.userDataPath, { recursive: true })
	const temporaryPath = `${destinationPath}.migrating`
	await rm(temporaryPath, { force: true })
	const source = new DatabaseSync(sourcePath, {
		open: true,
		readOnly: false,
		enableForeignKeyConstraints: true,
		enableDoubleQuotedStringLiterals: false,
		allowExtension: false,
		timeout: 2_000
	})
	try {
		await backup(source, temporaryPath)
		verifyDatabase(temporaryPath)
		await rename(temporaryPath, destinationPath)
	} catch (error) {
		await rm(temporaryPath, { force: true })
		throw error
	} finally {
		source.close()
	}
	return destinationPath
}
