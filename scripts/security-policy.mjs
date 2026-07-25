import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function validateSecuritySources(mainSource, preloadSource, rendererHtml) {
	const exposedBridgeNames = [
		...preloadSource.matchAll(/contextBridge\.exposeInMainWorld\(\s*['"`]([^'"`]+)['"`]/gu)
	].map((match) => match[1])
	const exposesOnlyTiempio =
		exposedBridgeNames.length === 1 && exposedBridgeNames[0] === 'tiempio'
	const contentSecurityPolicy =
		rendererHtml.match(
			/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content="([^"]+)"/iu
		)?.[1] ?? ''

	const requirements = [
		['context isolation', mainSource.includes('contextIsolation: true')],
		['renderer sandbox', mainSource.includes('sandbox: true')],
		['Node disabled in renderer', mainSource.includes('nodeIntegration: false')],
		['web security', mainSource.includes('webSecurity: true')],
		['insecure content disabled', mainSource.includes('allowRunningInsecureContent: false')],
		['external window denial', mainSource.includes("action: 'deny'")],
		['navigation denial', mainSource.includes("'will-navigate'")],
		['webview denial', mainSource.includes("'will-attach-webview'")],
		['permission denial', mainSource.includes('setPermissionRequestHandler')],
		[
			'packaged custom protocol',
			mainSource.includes('appProtocolUrl') && !mainSource.includes('.loadFile(')
		],
		['one narrow Tiempio context bridge', exposesOnlyTiempio],
		[
			'runtime-validated IPC',
			preloadSource.includes('invokeValidated') &&
				preloadSource.includes('parseIpcResponse') &&
				preloadSource.includes('parseStartupState')
		],
		[
			'validated settings capabilities',
			preloadSource.includes('parseApplicationSettings') &&
				preloadSource.includes('parseAppearance') &&
				preloadSource.includes('parseInterfaceLocale')
		],
		['content security policy', contentSecurityPolicy.length > 0],
		['production CSP without inline scripts', !contentSecurityPolicy.includes("'unsafe-eval'")],
		[
			'production CSP without inline styles',
			!contentSecurityPolicy.includes("'unsafe-inline'")
		],
		['production CSP without broad WebSocket access', !contentSecurityPolicy.includes('ws:')],
		['production CSP object denial', contentSecurityPolicy.includes("object-src 'none'")],
		['production CSP base URI denial', contentSecurityPolicy.includes("base-uri 'none'")],
		[
			'production CSP frame ancestor denial',
			contentSecurityPolicy.includes("frame-ancestors 'none'")
		],
		['production CSP form denial', contentSecurityPolicy.includes("form-action 'none'")]
	]

	return requirements
		.filter(([, passed]) => !passed)
		.map(([name]) => `missing security requirement: ${name}`)
}

async function run() {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const [mainSource, preloadSource, rendererHtml] = await Promise.all([
		readFile(resolve(root, 'src/main/index.ts'), 'utf8'),
		readFile(resolve(root, 'src/preload/index.ts'), 'utf8'),
		readFile(resolve(root, 'out/renderer/index.html'), 'utf8')
	])
	const errors = validateSecuritySources(mainSource, preloadSource, rendererHtml)
	if (errors.length > 0) {
		throw new Error(`Electron security policy failed:\n- ${errors.join('\n- ')}`)
	}
	console.log('PASS Electron isolation, navigation, permission, bridge and CSP policy')
}

const isEntryPoint =
	process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isEntryPoint) await run()
