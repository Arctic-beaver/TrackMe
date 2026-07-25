import { useEffect, useRef, type RefObject } from 'react'

export function useModalDialog(
	initialFocus?: RefObject<HTMLElement | null>
): RefObject<HTMLDialogElement | null> {
	const dialog = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const activeDialog = dialog.current
		const previousFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		if (activeDialog !== null && !activeDialog.open) activeDialog.showModal()
		initialFocus?.current?.focus()
		return () => {
			if (activeDialog?.open) activeDialog.close()
			if (previousFocus?.isConnected) previousFocus.focus()
		}
	}, [initialFocus])

	return dialog
}
