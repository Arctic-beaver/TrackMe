import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FuseState, FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses'

export const expectedFuseConfiguration = Object.freeze({
	[FuseV1Options.RunAsNode]: false,
	[FuseV1Options.EnableCookieEncryption]: true,
	[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
	[FuseV1Options.EnableNodeCliInspectArguments]: false,
	[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
	[FuseV1Options.OnlyLoadAppFromAsar]: true,
	[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
	[FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
	[FuseV1Options.WasmTrapHandlers]: true
})

export const expectedFuseStates = Object.freeze(
	Object.fromEntries(
		Object.entries(expectedFuseConfiguration).map(([index, enabled]) => [
			index,
			enabled ? FuseState.ENABLE : FuseState.DISABLE
		])
	)
)

function fuseOptionIndexes() {
	return Object.values(FuseV1Options)
		.filter((value) => typeof value === 'number')
		.sort((left, right) => left - right)
}

export function validateFuseWire(wire) {
	const errors = []
	if (wire.version !== FuseVersion.V1) errors.push('unexpected fuse wire version')
	const knownIndexes = fuseOptionIndexes()
	const policyIndexes = Object.keys(expectedFuseStates)
		.map(Number)
		.sort((a, b) => a - b)
	if (
		knownIndexes.length !== policyIndexes.length ||
		knownIndexes.some((value, index) => value !== policyIndexes[index])
	) {
		errors.push('fuse policy does not cover every option known by @electron/fuses')
	}
	for (const [index, expected] of Object.entries(expectedFuseStates)) {
		if (wire[Number(index)] !== expected) {
			errors.push(`${FuseV1Options[Number(index)] ?? index} has an unexpected state`)
		}
	}
	return errors
}

export async function checkPackagedElectronFuses(executablePath) {
	const resolvedPath = resolve(executablePath)
	if (!existsSync(resolvedPath)) {
		throw new Error(`Packaged Electron executable is missing: ${resolvedPath}`)
	}
	const errors = validateFuseWire(await getCurrentFuseWire(resolvedPath))
	if (errors.length > 0) throw new Error(`Electron fuse policy failed:\n- ${errors.join('\n- ')}`)
	console.log('PASS packaged Electron fuse policy')
}

const isEntryPoint =
	process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isEntryPoint) {
	await checkPackagedElectronFuses(
		process.argv[2] ??
			(process.platform === 'darwin'
				? 'dist/mac/Tiempio.app'
				: process.platform === 'linux'
					? 'dist/linux-unpacked/tiempio'
					: 'dist/win-unpacked/Tiempio.exe')
	)
}
