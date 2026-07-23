import type { InterfaceLocale, ResolvedInterfaceLocale } from '../contracts'
import {
	catalogs,
	englishCatalog,
	type LocalizedMessage,
	type LocalizationCatalog,
	type LocalizationKey,
	type PluralCategory
} from './catalogs'

export type { LocalizationCatalog, LocalizationKey }

export type TranslationValue = string | number
export type TranslationValues = Readonly<Record<string, TranslationValue>>
export type Translate = (key: LocalizationKey, values?: TranslationValues) => string

const intlLocales: Readonly<Record<ResolvedInterfaceLocale, string>> = Object.freeze({
	en: 'en-GB',
	ru: 'ru-RU',
	es: 'es-ES'
})

function pluralMessage(
	locale: ResolvedInterfaceLocale,
	message: LocalizedMessage,
	values: TranslationValues | undefined
): string {
	if (typeof message === 'string') return message
	const count = values?.count
	if (typeof count !== 'number' || !Number.isFinite(count)) {
		throw new Error('A finite count is required for a plural localization message.')
	}
	const category = new Intl.PluralRules(intlLocales[locale]).select(count) as PluralCategory
	return message[category] ?? message.other
}

function interpolate(template: string, values: TranslationValues | undefined): string {
	return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, name: string) => {
		const value = values?.[name]
		if (value === undefined) throw new Error(`Missing localization parameter: ${name}.`)
		return String(value)
	})
}

export function translate(
	locale: ResolvedInterfaceLocale,
	key: LocalizationKey,
	values?: TranslationValues
): string {
	const message = catalogs[locale][key] ?? englishCatalog[key]
	return interpolate(pluralMessage(locale, message, values), values)
}

export function createTranslator(locale: ResolvedInterfaceLocale): Translate {
	return (key, values) => translate(locale, key, values)
}

export function resolveInterfaceLocale(
	preference: InterfaceLocale,
	systemLocale: string
): ResolvedInterfaceLocale {
	if (preference !== 'system') return preference
	const normalized = systemLocale.trim().toLowerCase()
	if (normalized === 'ru' || normalized.startsWith('ru-') || normalized.startsWith('ru_')) {
		return 'ru'
	}
	if (normalized === 'es' || normalized.startsWith('es-') || normalized.startsWith('es_')) {
		return 'es'
	}
	return 'en'
}

export function formatCalendarDate(locale: ResolvedInterfaceLocale, date: Date): string {
	return new Intl.DateTimeFormat(intlLocales[locale], {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(date)
}

export function localizationParameters(message: LocalizedMessage): readonly string[] {
	const templates = typeof message === 'string' ? [message] : Object.values(message)
	return [
		...new Set(
			templates.flatMap((template) =>
				[...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1] ?? '')
			)
		)
	].filter((name) => name !== '')
}
