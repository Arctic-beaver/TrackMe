import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { resolveDevelopmentAppIconPath } from './appIcon'

describe('application icon path', () => {
	it('uses the repository icon for an unpackaged Electron runtime', () => {
		assert.equal(
			resolveDevelopmentAppIconPath('/workspace/tiempio', false),
			join('/workspace/tiempio', 'build', 'icon.png')
		)
	})

	it('lets the packaged executable provide its embedded icon', () => {
		assert.equal(resolveDevelopmentAppIconPath('/resources/app.asar', true), undefined)
	})
})
