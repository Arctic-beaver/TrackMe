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

	it('passes contrast, tray/card separation and Liquid Glass checks', () => {
		assert.deepEqual(auditProductionThemes(productionCss).failures, [])
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
		const invalidCss = `${productionCss}\n.panel { scrollbar-width: auto; }`
		assert.ok(
			auditScrollbarSystem(invalidCss, scrollbarCss).failures.includes(
				'scrollbar implementation must remain in scrollbars.css'
			)
		)
	})
})
