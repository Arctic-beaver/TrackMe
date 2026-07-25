import { isAbsolute, relative, resolve } from 'node:path'

export const appProtocolScheme = 'tiempio'
export const appProtocolHost = 'app'
export const appProtocolUrl = `${appProtocolScheme}://${appProtocolHost}/index.html`

function rawRequestPath(requestUrl: string): string {
	const authorityStart = requestUrl.indexOf('://')
	const pathStart = requestUrl.indexOf('/', authorityStart + 3)
	const rawPath = pathStart === -1 ? '/' : requestUrl.slice(pathStart).split(/[?#]/u, 1)[0]
	return decodeURIComponent(rawPath)
}

export function resolveAppAssetPath(rendererRoot: string, requestUrl: string): string {
	const decodedRawPath = rawRequestPath(requestUrl)
	if (
		decodedRawPath.includes('\0') ||
		decodedRawPath.split(/[/\\]/u).some((segment) => segment === '..')
	) {
		throw new Error('The application asset path is invalid.')
	}

	const url = new URL(requestUrl)
	if (url.protocol !== `${appProtocolScheme}:` || url.host !== appProtocolHost) {
		throw new Error('The application asset origin is invalid.')
	}

	const root = resolve(rendererRoot)
	const requestPath = decodeURIComponent(url.pathname).replace(/^[/\\]+/u, '')
	const candidate = resolve(root, requestPath)
	const pathFromRoot = relative(root, candidate)
	if (
		pathFromRoot === '' ||
		pathFromRoot === '..' ||
		pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
		isAbsolute(pathFromRoot)
	) {
		throw new Error('The application asset path is invalid.')
	}
	return candidate
}
