import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultAppearance, themeFamilies } from './contracts'
import { assertThemeRegistryComplete, themeDefinition, themeRegistry } from './themeRegistry'

describe('theme registry', () => {
	it('covers every approved family exactly once', () => {
		assert.doesNotThrow(assertThemeRegistryComplete)
		assert.deepEqual(
			themeRegistry.map((definition) => definition.id),
			themeFamilies
		)
	})

	it('keeps Graphite Navy as the default', () => {
		assert.equal(defaultAppearance.family, 'graphite-navy')
		assert.equal(themeDefinition(defaultAppearance.family).id, 'graphite-navy')
	})
})
