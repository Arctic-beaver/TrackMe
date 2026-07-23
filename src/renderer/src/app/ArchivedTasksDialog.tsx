import { ArchiveRestore, X } from 'lucide-react'
import type { Task } from '../../../shared/contracts'
import { useLocalization } from '../localization/useLocalization'

export function ArchivedTasksDialog({
	tasks,
	busy,
	onRestore,
	onClose
}: {
	readonly tasks: readonly Task[]
	readonly busy: boolean
	readonly onRestore: (task: Task) => void
	readonly onClose: () => void
}): React.JSX.Element {
	const { t } = useLocalization()
	return (
		<dialog open className="task-dialog archived-dialog" onCancel={onClose}>
			<div className="dialog-panel">
				<header className="dialog-header">
					<div>
						<h2>{t('task.archived.title')}</h2>
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
					{tasks.length === 0 ? (
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
									disabled={busy}
									onClick={() => onRestore(task)}
								>
									<ArchiveRestore aria-hidden="true" />
									{t('actions.restore')}
								</button>
							</div>
						))
					)}
				</div>
			</div>
		</dialog>
	)
}
