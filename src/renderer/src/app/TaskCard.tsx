import { ArrowLeft, ArrowRight, CalendarDays, Clock3, FolderKanban } from 'lucide-react'
import type { Project, ResolvedInterfaceLocale, Task, TaskStatus } from '../../../shared/contracts'
import type { LocalizationKey, Translate } from '../../../shared/localization'
import { formatLocalDate } from '../../../shared/localization'
import { classifyTaskUrgency, differenceInLocalDays } from '../../../shared/taskDomain'

const statusOrder: readonly TaskStatus[] = ['todo', 'planned', 'in_progress', 'done']

function urgencyLabel(
	task: Task,
	localDate: string,
	locale: ResolvedInterfaceLocale,
	t: Translate
): string {
	const urgency = classifyTaskUrgency(task, localDate)
	const date = formatLocalDate(locale, task.dueDate)
	const difference = differenceInLocalDays(localDate, task.dueDate)
	const key: LocalizationKey = `task.urgency.${urgency === 'due_today' ? 'dueToday' : urgency === 'at_risk' ? 'atRisk' : urgency}`
	return t(key, { count: Math.abs(difference), date })
}

export function TaskCard({
	task,
	project,
	localDate,
	locale,
	t,
	onEdit,
	onChangeStatus,
	onDragStart
}: {
	readonly task: Task
	readonly project: Project | null
	readonly localDate: string
	readonly locale: ResolvedInterfaceLocale
	readonly t: Translate
	readonly onEdit: (task: Task) => void
	readonly onChangeStatus: (task: Task, status: TaskStatus) => void
	readonly onDragStart: (task: Task) => void
}): React.JSX.Element {
	const statusIndex = statusOrder.indexOf(task.status)
	const previousStatus = statusOrder[statusIndex - 1]
	const nextStatus = statusOrder[statusIndex + 1]
	const urgency = classifyTaskUrgency(task, localDate)
	const carried =
		task.status === 'planned' && task.plannedForDate !== null && task.plannedForDate < localDate

	return (
		<article
			className="task-card"
			data-urgency={urgency}
			draggable
			onDragStart={(event) => {
				event.dataTransfer.effectAllowed = 'move'
				event.dataTransfer.setData('text/plain', task.id)
				onDragStart(task)
			}}
		>
			<button
				type="button"
				className="task-card-main"
				onClick={() => onEdit(task)}
				aria-label={t('actions.editTask', { title: task.title })}
			>
				<span className="task-card-title">{task.title}</span>
				<span className="task-urgency">
					<CalendarDays aria-hidden="true" />
					{urgencyLabel(task, localDate, locale, t)}
				</span>
				{carried ? (
					<span className="task-carried">
						<Clock3 aria-hidden="true" />
						{t('task.carried', {
							date: formatLocalDate(locale, task.plannedForDate ?? localDate)
						})}
					</span>
				) : null}
				<span className="task-card-meta">
					<span>{t('task.estimate', { count: task.estimateDays })}</span>
					{project === null ? null : (
						<span>
							<FolderKanban aria-hidden="true" />
							{project.name}
						</span>
					)}
				</span>
				{task.tags.length === 0 ? null : (
					<span className="task-tags">
						{task.tags.map((tag) => (
							<span key={tag.id}>{tag.name}</span>
						))}
					</span>
				)}
			</button>
			<div className="task-card-actions">
				<button
					type="button"
					disabled={previousStatus === undefined}
					onClick={() => {
						if (previousStatus !== undefined) onChangeStatus(task, previousStatus)
					}}
					aria-label={t('actions.previousStatus', { title: task.title })}
				>
					<ArrowLeft aria-hidden="true" />
				</button>
				<button
					type="button"
					disabled={nextStatus === undefined}
					onClick={() => {
						if (nextStatus !== undefined) onChangeStatus(task, nextStatus)
					}}
					aria-label={t('actions.nextStatus', { title: task.title })}
				>
					<ArrowRight aria-hidden="true" />
				</button>
			</div>
		</article>
	)
}
