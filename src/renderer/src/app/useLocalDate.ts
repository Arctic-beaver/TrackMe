import { useEffect, useState } from 'react'
import { todayLocalDate } from '../../../shared/taskDomain'

export function millisecondsUntilNextLocalDay(now: Date): number {
	const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
	return Math.max(1, nextDay.getTime() - now.getTime())
}

export function useLocalDate(): string {
	const [localDate, setLocalDate] = useState(() => todayLocalDate())

	useEffect(() => {
		let timer = 0
		const refresh = (): void => {
			setLocalDate(todayLocalDate())
			window.clearTimeout(timer)
			timer = window.setTimeout(refresh, millisecondsUntilNextLocalDay(new Date()) + 50)
		}
		const refreshWhenVisible = (): void => {
			if (document.visibilityState === 'visible') refresh()
		}
		refresh()
		window.addEventListener('focus', refresh)
		document.addEventListener('visibilitychange', refreshWhenVisible)
		return () => {
			window.clearTimeout(timer)
			window.removeEventListener('focus', refresh)
			document.removeEventListener('visibilitychange', refreshWhenVisible)
		}
	}, [])

	return localDate
}
