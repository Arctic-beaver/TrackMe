import { join } from 'node:path'

export function resolveDevelopmentAppIconPath(
	appPath: string,
	isPackaged: boolean
): string | undefined {
	return isPackaged ? undefined : join(appPath, 'build', 'icon.png')
}
