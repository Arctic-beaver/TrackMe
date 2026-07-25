import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { useLocalization } from '../localization/useLocalization'

export function ConfirmDialog({
	onConfirm,
	onCancel
}: {
	readonly onConfirm: () => void
	readonly onCancel: () => void
}): React.JSX.Element {
	const dialog = useRef<HTMLDialogElement>(null)
	const safeAction = useRef<HTMLButtonElement>(null)
	const titleId = useId()
	const descriptionId = useId()
	const { t } = useLocalization()

	useEffect(() => {
		const previousFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		const activeDialog = dialog.current
		activeDialog?.showModal()
		safeAction.current?.focus()
		return () => {
			if (activeDialog?.open) activeDialog.close()
			if (previousFocus?.isConnected) previousFocus.focus()
		}
	}, [])

	return createPortal(
		<dialog
			ref={dialog}
			className="confirm-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			onCancel={(event) => {
				event.preventDefault()
				onCancel()
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				onCancel()
			}}
			onClick={(event) => {
				if (event.currentTarget === event.target) onCancel()
			}}
		>
			<div className="confirm-panel">
				<header className="confirm-header">
					<span className="confirm-icon" aria-hidden="true">
						<AlertTriangle />
					</span>
					<div>
						<h2 id={titleId}>{t('task.editor.discardTitle')}</h2>
						<p id={descriptionId}>{t('task.editor.discardDescription')}</p>
					</div>
					<button
						type="button"
						className="icon-button"
						onClick={onCancel}
						aria-label={t('actions.close')}
					>
						<X aria-hidden="true" />
					</button>
				</header>
				<footer className="confirm-actions">
					<button type="button" className="danger-button" onClick={onConfirm}>
						{t('task.editor.discardAction')}
					</button>
					<button
						ref={safeAction}
						type="button"
						className="primary-button"
						onClick={onCancel}
					>
						{t('task.editor.continueEditing')}
					</button>
				</footer>
			</div>
		</dialog>,
		document.body
	)
}
