import { useEffect, useRef } from 'react'
import { Languages, X } from 'lucide-react'
import { interfaceLocales, type InterfaceLocale } from '../../../shared/contracts'
import type { LocalizationKey } from '../../../shared/localization'
import { useLocalization } from '../localization/useLocalization'
import { useApplicationSettings } from './applicationSettingsContext'

const localeKeys: Readonly<Record<InterfaceLocale, LocalizationKey>> = {
	system: 'language.locale.system',
	ru: 'language.locale.russian',
	en: 'language.locale.english',
	es: 'language.locale.spanish'
}

const localeDescriptionKeys: Readonly<Record<InterfaceLocale, LocalizationKey>> = {
	system: 'language.locale.systemDescription',
	ru: 'language.locale.russianDescription',
	en: 'language.locale.englishDescription',
	es: 'language.locale.spanishDescription'
}

export function LanguageDialog({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
	const dialog = useRef<HTMLDialogElement>(null)
	const { t } = useLocalization()
	const { settings, saveError, clearSaveError, setInterfaceLocale } = useApplicationSettings()

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialog}
			className="settings-dialog language-dialog"
			aria-labelledby="language-title"
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			onClick={(event) => {
				if (event.currentTarget === event.target) onClose()
			}}
		>
			<div className="settings-panel">
				<header className="settings-header">
					<div>
						<span className="settings-heading-icon" aria-hidden="true">
							<Languages />
						</span>
						<h2 id="language-title">{t('language.title')}</h2>
						<p>{t('language.description')}</p>
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

				<div className="language-options">
					{interfaceLocales.map((locale) => (
						<button
							type="button"
							className="language-option"
							key={locale}
							aria-pressed={settings.language.interfaceLocale === locale}
							onClick={() => setInterfaceLocale(locale)}
						>
							<strong>{t(localeKeys[locale])}</strong>
							<small>{t(localeDescriptionKeys[locale])}</small>
						</button>
					))}
				</div>

				{saveError ? (
					<button type="button" className="settings-error" onClick={clearSaveError}>
						{t('errors.settings')}
					</button>
				) : null}
			</div>
		</dialog>
	)
}
