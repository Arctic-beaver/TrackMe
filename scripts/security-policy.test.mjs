import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateSecuritySources } from './security-policy.mjs'

const secureMain = `
contextIsolation: true
sandbox: true
nodeIntegration: false
webSecurity: true
allowRunningInsecureContent: false
action: 'deny'
'will-navigate'
'will-attach-webview'
setPermissionRequestHandler
appProtocolUrl
`
const securePreload = `
contextBridge.exposeInMainWorld('tiempio', tiempioApi)
invokeValidated
parseIpcResponse
parseStartupState
parseApplicationSettings
parseAppearance
parseInterfaceLocale
`
const secureHtml = `
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" />
`

describe('Electron source security policy', () => {
	it('accepts the complete baseline', () => {
		assert.deepEqual(validateSecuritySources(secureMain, securePreload, secureHtml), [])
	})

	it('rejects an unsafe renderer and a second bridge', () => {
		const errors = validateSecuritySources(
			secureMain.replace('sandbox: true', 'sandbox: false'),
			`${securePreload}\ncontextBridge.exposeInMainWorld('electron', {})`,
			secureHtml
		)
		assert.ok(errors.some((error) => error.includes('sandbox')))
		assert.ok(errors.some((error) => error.includes('narrow Tiempio')))
	})

	it('rejects development CSP allowances in production', () => {
		const errors = validateSecuritySources(
			secureMain,
			securePreload,
			secureHtml
				.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
				.replace("connect-src 'self'", "connect-src 'self' ws:")
		)
		assert.ok(errors.some((error) => error.includes('inline styles')))
		assert.ok(errors.some((error) => error.includes('WebSocket')))
	})
})
