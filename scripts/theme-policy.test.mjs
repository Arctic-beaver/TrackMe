import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { auditProductionThemes, auditScrollbarSystem, contrastRatio } from './theme-policy.mjs'

const productionCss = await readFile(
	new URL('../src/renderer/src/styles/main.css', import.meta.url),
	'utf8'
)
const scrollbarCss = await readFile(
	new URL('../src/renderer/src/styles/scrollbars.css', import.meta.url),
	'utf8'
)

describe('production theme policy', () => {
	it('defines four complete light and dark theme families', () => {
		assert.equal(auditProductionThemes(productionCss).schemes.size, 8)
	})

	it('passes contrast, accent distribution, tray/card separation and Liquid Glass checks', () => {
		assert.deepEqual(auditProductionThemes(productionCss).failures, [])
		const concentratedAccentCss = productionCss.replace(
			".filter-chip[data-active='true']",
			".filter-chip[data-active='removed']"
		)
		assert.ok(
			auditProductionThemes(concentratedAccentCss).failures.includes(
				'active filters must carry the theme accent'
			)
		)
	})

	it('rejects a card that merges into its tray', () => {
		const invalidCss = productionCss.replaceAll(
			'--task-card: #1b2b43;',
			'--task-card: #0d1727;'
		)
		assert.ok(
			auditProductionThemes(invalidCss).failures.some((failure) =>
				failure.includes('visually distinct')
			)
		)
	})

	it('uses WCAG relative luminance', () => {
		assert.equal(contrastRatio('#000000', '#ffffff'), 21)
		assert.ok(contrastRatio('#777777', '#ffffff') < 4.5)
	})

	it('keeps one global themed scrollbar entry point', () => {
		assert.deepEqual(auditScrollbarSystem(productionCss, scrollbarCss).failures, [])
	})

	it('rejects scrollbar rules outside the centralized stylesheet', () => {
		const extraStyles = [{ path: 'components.css', css: '.panel { scrollbar-width: auto; }' }]
		assert.ok(
			auditScrollbarSystem(productionCss, scrollbarCss, extraStyles).failures.includes(
				'components.css: scrollbar implementation must remain in scrollbars.css'
			)
		)
	})
})
