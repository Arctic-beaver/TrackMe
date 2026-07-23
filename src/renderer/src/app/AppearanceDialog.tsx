import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import {
	colorSchemes,
	interfaceLocales,
	type ColorScheme,
	type InterfaceLocale
} from '../../../shared/contracts'
import { themeRegistry } from '../../../shared/themeRegistry'
import type { LocalizationKey } from '../../../shared/localization'
import { useLocalization } from '../localization/useLocalization'
import { useApplicationSettings } from './applicationSettingsContext'

const schemeKeys: Readonly<Record<ColorScheme, LocalizationKey>> = {
	system: 'appearance.scheme.system',
	light: 'appearance.scheme.light',
	dark: 'appearance.scheme.dark'
}

const localeKeys: Readonly<Record<InterfaceLocale, LocalizationKey>> = {
	system: 'appearance.locale.system',
	ru: 'appearance.locale.russian',
	en: 'appearance.locale.english',
	es: 'appearance.locale.spanish'
}

export function AppearanceDialog({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
	const dialog = useRef<HTMLDialogElement>(null)
	const { t } = useLocalization()
	const { settings, saveError, clearSaveError, setAppearance, setInterfaceLocale } =
		useApplicationSettings()

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialog}
			className="appearance-dialog"
			aria-labelledby="appearance-title"
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			onClick={(event) => {
				if (event.currentTarget === event.target) onClose()
			}}
		>
			<div className="appearance-panel">
				<header className="appearance-header">
					<div>
						<h2 id="appearance-title">{t('appearance.title')}</h2>
						<p>{t('appearance.description')}</p>
					</div>
					<button
						type="button"
						className="icon-button"
						onClick={onClose}
						aria-label={t('actions.close')}
					>
						<X aria-hidden="true" />
					</button>
				</header>

				<section className="appearance-section">
					<h3>{t('appearance.themeFamily')}</h3>
					<div className="theme-options">
						{themeRegistry.map((definition) => (
							<button
								type="button"
								className="theme-option"
								key={definition.id}
								aria-pressed={settings.appearance.family === definition.id}
								onClick={() =>
									setAppearance({
										...settings.appearance,
										family: definition.id
									})
								}
							>
								<span className={`theme-preview theme-preview-${definition.id}`} />
								<span>
									<strong>{t(definition.nameKey)}</strong>
									<small>{t(definition.descriptionKey)}</small>
								</span>
							</button>
						))}
					</div>
				</section>

				<section className="appearance-section">
					<h3>{t('appearance.colorMode')}</h3>
					<div className="segmented-control">
						{colorSchemes.map((scheme) => (
							<button
								type="button"
								key={scheme}
								aria-pressed={settings.appearance.scheme === scheme}
								onClick={() =>
									setAppearance({
										...settings.appearance,
										scheme
									})
								}
							>
								{t(schemeKeys[scheme])}
							</button>
						))}
					</div>
				</section>

				<section className="appearance-section">
					<h3>{t('appearance.interfaceLanguage')}</h3>
					<div className="segmented-control locale-control">
						{interfaceLocales.map((locale) => (
							<button
								type="button"
								key={locale}
								aria-pressed={settings.language.interfaceLocale === locale}
								onClick={() => setInterfaceLocale(locale)}
							>
								{t(localeKeys[locale])}
							</button>
						))}
					</div>
				</section>

				{saveError ? (
					<button type="button" className="settings-error" onClick={clearSaveError}>
						{t('errors.settings')}
					</button>
				) : null}
			</div>
		</dialog>
	)
}
