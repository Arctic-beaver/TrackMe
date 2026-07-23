import { useCallback, useEffect, useMemo } from 'react'
import type { InterfaceLocale } from '../../../shared/contracts'
import { createTranslator, resolveInterfaceLocale } from '../../../shared/localization'
import { useApplicationSettings } from '../app/applicationSettingsContext'
import { LocalizationContext } from './localizationContext'

function systemLocale(): string {
	return navigator.languages[0] ?? navigator.language ?? 'en'
}

export function LocalizationProvider({
	children
}: {
	readonly children: React.ReactNode
}): React.JSX.Element {
	const { settings, setInterfaceLocale } = useApplicationSettings()
	const preference = settings.language.interfaceLocale
	const locale = resolveInterfaceLocale(preference, systemLocale())
	const t = useMemo(() => createTranslator(locale), [locale])

	useEffect(() => {
		document.documentElement.lang = locale
		document.documentElement.dir = 'ltr'
	}, [locale])

	const setPreference = useCallback(
		(nextPreference: InterfaceLocale) => setInterfaceLocale(nextPreference),
		[setInterfaceLocale]
	)
	const value = useMemo(
		() => ({ preference, locale, setPreference, t }),
		[locale, preference, setPreference, t]
	)

	return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}
