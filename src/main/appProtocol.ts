import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { protocol } from 'electron'
import { appProtocolScheme, resolveAppAssetPath } from './appAssetPath'

const contentTypes = new Map<string, string>([
	['.css', 'text/css; charset=utf-8'],
	['.html', 'text/html; charset=utf-8'],
	['.ico', 'image/x-icon'],
	['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'],
	['.js', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml; charset=utf-8'],
	['.webp', 'image/webp'],
	['.woff', 'font/woff'],
	['.woff2', 'font/woff2']
])

function contentType(path: string): string {
	return contentTypes.get(extname(path).toLocaleLowerCase('en-US')) ?? 'application/octet-stream'
}

export function registerAppScheme(): void {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: appProtocolScheme,
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true
			}
		}
	])
}

export function registerAppProtocol(rendererRoot: string): () => void {
	protocol.handle(appProtocolScheme, async (request) => {
		try {
			const path = resolveAppAssetPath(rendererRoot, request.url)
			return new Response(await readFile(path), {
				headers: {
					'Content-Type': contentType(path),
					'X-Content-Type-Options': 'nosniff'
				}
			})
		} catch {
			return new Response('Not found', {
				status: 404,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'X-Content-Type-Options': 'nosniff'
				}
			})
		}
	})
	return () => protocol.unhandle(appProtocolScheme)
}
