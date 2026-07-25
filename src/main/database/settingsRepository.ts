import {
	createDefaultApplicationSettings,
	type Appearance,
	type ApplicationSettings,
	type InterfaceLocale
} from '../../shared/contracts'
import type { SettingsRepositoryPort } from '../../shared/application/ports'
import { parseApplicationSettings } from '../../shared/ipcProtocol'
import type { TiempioDatabase } from './database'

const settingsKey = 'application'

function immutableSettings(settings: ApplicationSettings): ApplicationSettings {
	return Object.freeze({
		version: 1,
		appearance: Object.freeze({ ...settings.appearance }),
		language: Object.freeze({ ...settings.language })
	})
}

export class SqliteSettingsRepository implements SettingsRepositoryPort {
	readonly #database: TiempioDatabase

	constructor(database: TiempioDatabase) {
		this.#database = database
	}

	get(): ApplicationSettings {
		const row = this.#database.connection
			.prepare('SELECT value_json FROM application_settings WHERE key = ?')
			.get(settingsKey) as { readonly value_json?: unknown } | undefined
		if (typeof row?.value_json === 'string') {
			try {
				return immutableSettings(parseApplicationSettings(JSON.parse(row.value_json)))
			} catch {
				const fallback = createDefaultApplicationSettings()
				this.#save(fallback)
				return fallback
			}
		}
		const initial = createDefaultApplicationSettings()
		this.#save(initial)
		return initial
	}

	setAppearance(appearance: Appearance): ApplicationSettings {
		const current = this.get()
		const next = immutableSettings({
			...current,
			appearance
		})
		this.#save(next)
		return next
	}

	setInterfaceLocale(interfaceLocale: InterfaceLocale): ApplicationSettings {
		const current = this.get()
		const next = immutableSettings({
			...current,
			language: { interfaceLocale }
		})
		this.#save(next)
		return next
	}

	#save(settings: ApplicationSettings): void {
		this.#database.connection
			.prepare(
				`
				INSERT INTO application_settings(key, value_json, value_version, updated_at)
				VALUES (?, ?, ?, ?)
				ON CONFLICT(key) DO UPDATE SET
					value_json = excluded.value_json,
					value_version = excluded.value_version,
					updated_at = excluded.updated_at
			`
			)
			.run(settingsKey, JSON.stringify(settings), settings.version, new Date().toISOString())
	}
}
