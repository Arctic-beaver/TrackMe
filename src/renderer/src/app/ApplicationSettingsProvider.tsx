import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
	Appearance,
	ApplicationSettings,
	InterfaceLocale,
	ResolvedColorScheme
} from '../../../shared/contracts'
import { ApplicationSettingsContext } from './applicationSettingsContext'

function resolveColorScheme(
	settings: ApplicationSettings,
	systemDark: boolean
): ResolvedColorScheme {
	return settings.appearance.scheme === 'system'
		? systemDark
			? 'dark'
			: 'light'
		: settings.appearance.scheme
}

export function ApplicationSettingsProvider({
	initialSettings,
	children
}: {
	readonly initialSettings: ApplicationSettings
	readonly children: React.ReactNode
}): React.JSX.Element {
	const media = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
	const [settings, setSettings] = useState(initialSettings)
	const [systemDark, setSystemDark] = useState(media.matches)
	const [saveError, setSaveError] = useState(false)
	const resolvedScheme = resolveColorScheme(settings, systemDark)

	useEffect(() => {
		const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
		media.addEventListener('change', onChange)
		return () => media.removeEventListener('change', onChange)
	}, [media])

	useEffect(() => {
		document.documentElement.dataset.theme = settings.appearance.family
		document.documentElement.dataset.colorScheme = settings.appearance.scheme
		document.documentElement.dataset.resolvedScheme = resolvedScheme
		document.documentElement.style.colorScheme = resolvedScheme
	}, [resolvedScheme, settings.appearance.family, settings.appearance.scheme])

	const commit = useCallback((operation: Promise<ApplicationSettings>): void => {
		void operation
			.then((nextSettings) => {
				setSettings(nextSettings)
				setSaveError(false)
			})
			.catch(() => setSaveError(true))
	}, [])

	const setAppearance = useCallback(
		(appearance: Appearance): void => {
			setSettings((current) => ({ ...current, appearance }))
			commit(window.trackme.settings.setAppearance(appearance))
		},
		[commit]
	)

	const setInterfaceLocale = useCallback(
		(interfaceLocale: InterfaceLocale): void => {
			setSettings((current) => ({
				...current,
				language: { interfaceLocale }
			}))
			commit(window.trackme.settings.setInterfaceLocale(interfaceLocale))
		},
		[commit]
	)

	const value = useMemo(
		() => ({
			settings,
			resolvedScheme,
			saveError,
			setAppearance,
			setInterfaceLocale,
			clearSaveError: () => setSaveError(false)
		}),
		[resolvedScheme, saveError, setAppearance, setInterfaceLocale, settings]
	)

	return (
		<ApplicationSettingsContext.Provider value={value}>
			{children}
		</ApplicationSettingsContext.Provider>
	)
}
