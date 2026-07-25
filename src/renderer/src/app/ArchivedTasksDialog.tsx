import { useCallback, useEffect, useId, useState } from 'react'
import { ArchiveRestore, X } from 'lucide-react'
import type { Task } from '../../../shared/contracts'
import { useLocalization } from '../localization/useLocalization'
import { useModalDialog } from './useModalDialog'

const pageSize = 30

export function ArchivedTasksDialog({
	totalCount,
	onRestored,
	onClose
}: {
	readonly totalCount: number
	readonly onRestored: (task: Task) => void
	readonly onClose: () => void
}): React.JSX.Element {
	const { t } = useLocalization()
	const dialog = useModalDialog()
	const titleId = useId()
	const [tasks, setTasks] = useState<readonly Task[]>([])
	const [total, setTotal] = useState(totalCount)
	const [loading, setLoading] = useState(true)
	const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
	const [loadError, setLoadError] = useState(false)

	const loadPage = useCallback(async (offset: number): Promise<void> => {
		setLoading(true)
		setLoadError(false)
		try {
			const page = await window.trackme.tasks.listArchived({
				offset,
				limit: pageSize
			})
			setTasks((current) => (offset === 0 ? page.tasks : [...current, ...page.tasks]))
			setTotal(page.total)
		} catch {
			setLoadError(true)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		const timer = window.setTimeout(() => void loadPage(0), 0)
		return () => window.clearTimeout(timer)
	}, [loadPage])

	const restore = async (task: Task): Promise<void> => {
		setBusyTaskId(task.id)
		setLoadError(false)
		try {
			const restored = await window.trackme.tasks.restore({
				id: task.id,
				expectedRevision: task.revision
			})
			setTasks((current) => current.filter((candidate) => candidate.id !== task.id))
			setTotal((current) => Math.max(0, current - 1))
			onRestored(restored)
		} catch {
			setLoadError(true)
		} finally {
			setBusyTaskId(null)
		}
	}

	return (
		<dialog
			ref={dialog}
			className="task-dialog archived-dialog"
			aria-labelledby={titleId}
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				onClose()
			}}
			onClick={(event) => {
				if (event.currentTarget === event.target) onClose()
			}}
		>
			<div className="dialog-panel">
				<header className="dialog-header">
					<div>
						<h2 id={titleId}>{t('task.archived.title')}</h2>
						<p>{t('board.archivedDescription')}</p>
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
				<div className="archived-list">
					{tasks.length === 0 && !loading && !loadError ? (
						<div className="board-state">{t('task.archived.empty')}</div>
					) : (
						tasks.map((task) => (
							<div className="archived-task" key={task.id}>
								<div>
									<strong>{task.title}</strong>
									<span>{task.description}</span>
								</div>
								<button
									type="button"
									disabled={busyTaskId !== null}
									onClick={() => void restore(task)}
								>
									<ArchiveRestore aria-hidden="true" />
									{t('actions.restore')}
								</button>
							</div>
						))
					)}
					{loadError ? (
						<div className="board-state board-error" role="alert">
							<span>{t('board.loadError')}</span>
							<button type="button" onClick={() => void loadPage(tasks.length)}>
								{t('actions.retry')}
							</button>
						</div>
					) : null}
					{loading ? <div className="board-state">{t('board.loading')}</div> : null}
					{!loading && !loadError && tasks.length < total ? (
						<button
							type="button"
							className="archived-load-more"
							onClick={() => void loadPage(tasks.length)}
						>
							{t('actions.loadMore')}
						</button>
					) : null}
				</div>
			</div>
		</dialog>
	)
}
