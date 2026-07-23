import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { appProtocolUrl, resolveAppAssetPath } from './appAssetPath'

describe('application asset path', () => {
	it('resolves an asset inside the renderer root', () => {
		assert.equal(
			resolveAppAssetPath('out/renderer', appProtocolUrl),
			resolve('out/renderer/index.html')
		)
	})

	it('rejects another origin and path traversal', () => {
		assert.throws(
			() => resolveAppAssetPath('out/renderer', 'https://app/index.html'),
			/asset origin/u
		)
		assert.throws(
			() => resolveAppAssetPath('out/renderer', 'trackme://app/%2e%2e/main/index.js'),
			/asset path/u
		)
	})
})
