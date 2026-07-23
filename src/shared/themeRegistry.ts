import type { LocalizationKey } from './localization'
import { defaultAppearance, themeFamilies, type ThemeFamily } from './contracts'

export interface ThemeFamilyDefinition {
	readonly id: ThemeFamily
	readonly nameKey: LocalizationKey
	readonly descriptionKey: LocalizationKey
}

export const themeRegistry: readonly ThemeFamilyDefinition[] = Object.freeze([
	{
		id: 'graphite-navy',
		nameKey: 'appearance.theme.graphiteNavy.name',
		descriptionKey: 'appearance.theme.graphiteNavy.description'
	},
	{
		id: 'linen-blue',
		nameKey: 'appearance.theme.linenBlue.name',
		descriptionKey: 'appearance.theme.linenBlue.description'
	},
	{
		id: 'pebble-steel',
		nameKey: 'appearance.theme.pebbleSteel.name',
		descriptionKey: 'appearance.theme.pebbleSteel.description'
	},
	{
		id: 'fog-indigo',
		nameKey: 'appearance.theme.fogIndigo.name',
		descriptionKey: 'appearance.theme.fogIndigo.description'
	}
])

export function themeDefinition(family: ThemeFamily): ThemeFamilyDefinition {
	const definition = themeRegistry.find((candidate) => candidate.id === family)
	if (definition === undefined) throw new Error(`Unknown theme family: ${family}`)
	return definition
}

export function assertThemeRegistryComplete(): void {
	const registered = new Set(themeRegistry.map((definition) => definition.id))
	if (themeRegistry.length !== themeFamilies.length || registered.size !== themeFamilies.length) {
		throw new Error('Theme registry must contain every family exactly once.')
	}
	for (const family of themeFamilies) {
		if (!registered.has(family)) throw new Error(`Theme registry is missing ${family}.`)
	}
	if (!registered.has(defaultAppearance.family)) {
		throw new Error('Default theme is missing from the theme registry.')
	}
}
