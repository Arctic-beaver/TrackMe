import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { interfaceLocales } from '../contracts'
import { catalogs, englishCatalog } from './catalogs'
import {
	createTranslator,
	formatCalendarDate,
	localizationParameters,
	resolveInterfaceLocale,
	translate
} from './index'

describe('localization', () => {
	it('keeps English, Russian and Spanish catalogs in exact key and parameter parity', () => {
		const expectedKeys = Object.keys(englishCatalog).sort()
		for (const catalog of Object.values(catalogs)) {
			assert.deepEqual(Object.keys(catalog).sort(), expectedKeys)
			for (const key of expectedKeys) {
				assert.deepEqual(
					[...localizationParameters(catalog[key as keyof typeof catalog])].sort(),
					[
						...localizationParameters(
							englishCatalog[key as keyof typeof englishCatalog]
						)
					].sort(),
					key
				)
			}
		}
	})

	it('resolves explicit and system locales with deterministic English fallback', () => {
		assert.deepEqual(interfaceLocales, ['system', 'en', 'ru', 'es'])
		assert.equal(resolveInterfaceLocale('es', 'en-US'), 'es')
		assert.equal(resolveInterfaceLocale('system', 'ru-RU'), 'ru')
		assert.equal(resolveInterfaceLocale('system', 'es-MX'), 'es')
		assert.equal(resolveInterfaceLocale('system', 'de-DE'), 'en')
	})

	it('uses locale-aware plural rules', () => {
		assert.equal(
			translate('en', 'board.hiddenCompleted', { count: 1 }),
			'1 older completed task'
		)
		assert.equal(
			translate('es', 'board.hiddenCompleted', { count: 2 }),
			'2 tareas completadas anteriores'
		)
		assert.equal(
			translate('ru', 'board.hiddenCompleted', { count: 5 }),
			'5 старых завершённых задач'
		)
	})

	it('uses task-focused Russian and Spanish interface copy', () => {
		assert.equal(translate('ru', 'task.status.todo'), 'К выполнению')
		assert.equal(translate('ru', 'task.placeholder.title'), 'Что нужно сделать?')
		assert.equal(translate('ru', 'task.editor.discardAction'), 'Не сохранять')
		assert.equal(translate('es', 'task.status.todo'), 'Por hacer')
		assert.equal(translate('es', 'task.placeholder.title'), '¿Qué hay que hacer?')
		assert.equal(translate('es', 'task.editor.continueEditing'), 'Seguir editando')
	})

	it('keeps language settings independent from theme settings', () => {
		assert.equal(translate('en', 'actions.openAppearance'), 'Themes')
		assert.equal(translate('ru', 'language.action'), 'Язык')
		assert.equal(translate('es', 'language.title'), 'Idioma de la interfaz')
	})

	it('formats the same local date in every supported language', () => {
		const date = new Date(2026, 6, 23, 12)
		assert.match(formatCalendarDate('en', date), /23 July/u)
		assert.match(formatCalendarDate('ru', date), /23 июля/u)
		assert.match(formatCalendarDate('es', date), /23 de julio/u)
	})

	it('rejects missing interpolation values', () => {
		const english = createTranslator('en')
		assert.throws(() => english('foundation.storage'), /Missing localization parameter/u)
	})
})
