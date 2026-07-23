import { join } from 'node:path'
import { flipFuses, FuseVersion } from '@electron/fuses'
import { expectedFuseConfiguration } from './electron-fuse-policy.mjs'

export function packagedElectronPath(context) {
	const platform = context.electronPlatformName
	if (platform === 'darwin' || platform === 'mas') {
		return join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
	}
	if (platform === 'win32') {
		return join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
	}
	if (platform === 'linux') {
		return join(context.appOutDir, context.packager.executableName)
	}
	throw new Error(`Unsupported Electron packaging platform: ${platform}`)
}

export default async function applyElectronFuses(context) {
	const isMac =
		context.electronPlatformName === 'darwin' || context.electronPlatformName === 'mas'
	await flipFuses(packagedElectronPath(context), {
		version: FuseVersion.V1,
		strictlyRequireAllFuses: true,
		resetAdHocDarwinSignature: isMac,
		...expectedFuseConfiguration
	})
}
