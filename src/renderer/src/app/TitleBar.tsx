import { useState } from 'react'
import { Copy, Languages, Minus, Palette, Plus, Sparkles, Square, X } from 'lucide-react'
import type { DesktopPlatform } from '../../../shared/contracts'
import { useLocalization } from '../localization/useLocalization'

export function TitleBar({
	platform,
	initialMaximized,
	onOpenAppearance,
	onOpenLanguage,
	onCreateTask
}: {
	readonly platform: DesktopPlatform
	readonly initialMaximized: boolean
	readonly onOpenAppearance: () => void
	readonly onOpenLanguage: () => void
	readonly onCreateTask: () => void
}): React.JSX.Element {
	const { t } = useLocalization()
	const [maximized, setMaximized] = useState(initialMaximized)
	const showWindowControls = platform !== 'darwin'

	return (
		<header className="title-bar">
			<div className="brand">
				<span className="brand-mark" aria-hidden="true">
					<Sparkles />
				</span>
				<span className="brand-copy">
					<strong>{t('product.name')}</strong>
					<span>· {t('product.tagline')}</span>
				</span>
			</div>

			<div className="title-actions">
				<button
					type="button"
					className="icon-button"
					onClick={onOpenAppearance}
					aria-label={t('actions.openAppearance')}
				>
					<Palette aria-hidden="true" />
				</button>
				<button
					type="button"
					className="title-setting-button"
					onClick={onOpenLanguage}
					aria-label={t('actions.openLanguage')}
				>
					<Languages aria-hidden="true" />
					<span>{t('language.action')}</span>
				</button>
				<button
					type="button"
					className="create-button"
					onClick={onCreateTask}
					aria-label={t('actions.create')}
				>
					<Plus aria-hidden="true" />
					<span>{t('actions.create')}</span>
				</button>

				{showWindowControls ? (
					<div className="window-controls" aria-label={t('window.controls')}>
						<button
							type="button"
							className="window-button"
							onClick={() => void window.trackme.window.minimize()}
							aria-label={t('window.minimize')}
						>
							<Minus aria-hidden="true" />
						</button>
						<button
							type="button"
							className="window-button"
							onClick={() => {
								void window.trackme.window
									.toggleMaximize()
									.then((state) => setMaximized(state.maximized))
							}}
							aria-label={maximized ? t('window.restore') : t('window.maximize')}
						>
							{maximized ? (
								<Copy aria-hidden="true" />
							) : (
								<Square aria-hidden="true" />
							)}
						</button>
						<button
							type="button"
							className="window-button window-button-close"
							onClick={() => void window.trackme.window.close()}
							aria-label={t('window.close')}
						>
							<X aria-hidden="true" />
						</button>
					</div>
				) : null}
			</div>
		</header>
	)
}
