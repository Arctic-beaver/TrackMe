import { createContext, useContext } from 'react'
import {
	createDefaultApplicationSettings,
	type Appearance,
	type ApplicationSettings,
	type InterfaceLocale,
	type ResolvedColorScheme
} from '../../../shared/contracts'

export interface ApplicationSettingsContextValue {
	readonly settings: ApplicationSettings
	readonly resolvedScheme: ResolvedColorScheme
	readonly saveError: boolean
	readonly setAppearance: (appearance: Appearance) => void
	readonly setInterfaceLocale: (locale: InterfaceLocale) => void
	readonly clearSaveError: () => void
}

export const ApplicationSettingsContext = createContext<ApplicationSettingsContextValue>({
	settings: createDefaultApplicationSettings(),
	resolvedScheme: 'dark',
	saveError: false,
	setAppearance: () => undefined,
	setInterfaceLocale: () => undefined,
	clearSaveError: () => undefined
})

export function useApplicationSettings(): ApplicationSettingsContextValue {
	return useContext(ApplicationSettingsContext)
}
