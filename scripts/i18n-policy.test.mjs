import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditLocalizationSource } from './i18n-policy.mjs'

describe('localization source policy', () => {
	it('accepts translated content', () => {
		const source = `
			function View({ t }) {
				return <button aria-label={t('actions.create')}>{t('actions.create')}</button>
			}
		`
		assert.deepEqual(auditLocalizationSource(source), [])
	})

	it('rejects visible and accessible raw copy', () => {
		const source = `
			function View() {
				return <button aria-label="Open settings">Settings</button>
			}
		`
		const violations = auditLocalizationSource(source)
		assert.equal(violations.length, 2)
		assert.match(violations.join('\n'), /Open settings/u)
		assert.match(violations.join('\n'), /Settings/u)
	})
})
