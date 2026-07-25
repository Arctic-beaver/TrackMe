import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findLegacyBrandViolations } from './brand-policy.mjs'

describe('Tiempio brand policy', () => {
	it('accepts the current product name', () => {
		assert.deepEqual(
			findLegacyBrandViolations([{ path: 'README.md', content: '# Tiempio\n' }]),
			[]
		)
	})

	it('rejects the previous product name in paths and content', () => {
		const previousBrand = ['Track', 'Me'].join('')
		const violations = findLegacyBrandViolations([
			{ path: `docs/${previousBrand}.md`, content: `# ${previousBrand}\n` }
		])
		assert.equal(violations.length, 2)
	})
})
