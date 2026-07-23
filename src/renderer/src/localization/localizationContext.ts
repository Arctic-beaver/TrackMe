import { createContext } from 'react'
import type { InterfaceLocale, ResolvedInterfaceLocale } from '../../../shared/contracts'
import { createTranslator, type Translate } from '../../../shared/localization'

export interface LocalizationContextValue {
	readonly preference: InterfaceLocale
	readonly locale: ResolvedInterfaceLocale
	readonly setPreference: (locale: InterfaceLocale) => void
	readonly t: Translate
}

export const LocalizationContext = createContext<LocalizationContextValue>(
	Object.freeze({
		preference: 'system',
		locale: 'en',
		setPreference: () => undefined,
		t: createTranslator('en')
	})
)
