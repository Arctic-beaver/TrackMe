import { createHash } from 'node:crypto'

export interface Migration {
	readonly version: number
	readonly name: string
	readonly checksum: string
	readonly sql: string
}

function migration(version: number, name: string, sql: string): Migration {
	return Object.freeze({
		version,
		name,
		sql,
		checksum: createHash('sha256').update(sql).digest('hex')
	})
}

export const migrations: readonly Migration[] = Object.freeze([
	migration(
		1,
		'foundation',
		`
CREATE TABLE projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	normalized_name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	archived_at TEXT,
	revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX projects_active_name
	ON projects(normalized_name)
	WHERE archived_at IS NULL;

CREATE TABLE tags (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	normalized_name TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
) STRICT;

CREATE TABLE tasks (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL CHECK (length(trim(title)) > 0),
	description TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL CHECK (status IN ('todo', 'planned', 'in_progress', 'done')),
	estimate_days INTEGER NOT NULL DEFAULT 1 CHECK (estimate_days >= 1),
	due_date TEXT NOT NULL,
	preferred_start_date TEXT NOT NULL,
	start_mode TEXT NOT NULL CHECK (start_mode IN ('auto', 'manual')),
	planned_for_date TEXT,
	scheduled_time TEXT,
	project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE SET NULL,
	archived_at TEXT,
	completed_at TEXT,
	revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (
		(status = 'done' AND completed_at IS NOT NULL) OR
		(status <> 'done' AND completed_at IS NULL)
	),
	CHECK (
		(status = 'planned' AND planned_for_date IS NOT NULL) OR
		(status <> 'planned' AND planned_for_date IS NULL)
	)
) STRICT;

CREATE INDEX tasks_board
	ON tasks(status, archived_at, due_date);
CREATE INDEX tasks_project
	ON tasks(project_id, archived_at);
CREATE INDEX tasks_completed
	ON tasks(completed_at DESC);

CREATE TABLE task_tags (
	task_id TEXT NOT NULL REFERENCES tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
	tag_id TEXT NOT NULL REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE,
	PRIMARY KEY (task_id, tag_id)
) STRICT;

CREATE INDEX task_tags_by_tag ON task_tags(tag_id, task_id);

CREATE TABLE recurrence_series (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL CHECK (length(trim(title)) > 0),
	description TEXT NOT NULL DEFAULT '',
	project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE SET NULL,
	starts_on TEXT NOT NULL,
	ends_on TEXT,
	archived_at TEXT,
	revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (ends_on IS NULL OR ends_on >= starts_on)
) STRICT;

CREATE INDEX recurrence_series_project
	ON recurrence_series(project_id, archived_at);

CREATE TABLE recurrence_slots (
	id TEXT PRIMARY KEY,
	series_id TEXT NOT NULL REFERENCES recurrence_series(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
	local_time TEXT,
	revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;

CREATE UNIQUE INDEX recurrence_slots_identity
	ON recurrence_slots(series_id, weekday, COALESCE(local_time, ''));
CREATE INDEX recurrence_slots_by_series
	ON recurrence_slots(series_id, weekday);

CREATE TABLE series_tags (
	series_id TEXT NOT NULL REFERENCES recurrence_series(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	tag_id TEXT NOT NULL REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE,
	PRIMARY KEY (series_id, tag_id)
) STRICT;

CREATE TABLE recurrence_occurrences (
	id TEXT PRIMARY KEY,
	slot_id TEXT NOT NULL REFERENCES recurrence_slots(id)
		ON UPDATE CASCADE ON DELETE CASCADE,
	occurrence_date TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'done', 'skipped')),
	moved_to_date TEXT,
	time_override TEXT,
	title_override TEXT,
	completed_at TEXT,
	revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (slot_id, occurrence_date),
	CHECK (
		(status = 'done' AND completed_at IS NOT NULL) OR
		(status <> 'done' AND completed_at IS NULL)
	)
) STRICT;

CREATE TABLE task_activity (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL REFERENCES tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
	event_type TEXT NOT NULL,
	payload_json TEXT NOT NULL,
	occurred_at TEXT NOT NULL,
	local_date TEXT NOT NULL
) STRICT;

CREATE INDEX task_activity_by_task
	ON task_activity(task_id, occurred_at);

CREATE TABLE application_settings (
	key TEXT PRIMARY KEY,
	value_json TEXT NOT NULL,
	value_version INTEGER NOT NULL CHECK (value_version >= 1),
	updated_at TEXT NOT NULL
) STRICT;
`
	)
])

export const latestSchemaVersion = migrations.at(-1)?.version ?? 0
