# Tiempio — план реализации Этапа 3: Week и Month

**Статус:** готов к реализации  
**Ветка:** `codex/phase-3-week-month`, обновлённая после preparatory gate  
**Основа:** `main` после объединения `codex/phase-0-tiempio-data-boundary`  
**Итоговый отчёт:** `PHASE-3-WEEK-MONTH.md`  
**Продуктовый scope:** [ROADMAP.md](./ROADMAP.md), раздел 5  
**Приёмка:** [PHASE-0-ACCEPTANCE-SCENARIOS.md](./PHASE-0-ACCEPTANCE-SCENARIOS.md),
разделы 6, 10.1 и 13.7–13.9

## 1. Цель этапа

Добавить два read-oriented календарных представления над существующей сущностью
`Task`:

- Week с неделей понедельник–воскресенье;
- Month с полной сеткой недель и внешними днями соседних месяцев;
- непрерывные включительные полосы от `preferredStartDate` до `dueDate`;
- одну и ту же карточку редактирования из Today, Week и Month;
- общий набор фильтров без потери периода, прокрутки и фокуса;
- локализованные даты и доступное управление клавиатурой.

Календарь не создаёт копий задач и не меняет их даты сам. Единственным источником
данных остаётся SQLite-строка `tasks`, а календарная полоса является чистой
проекцией задачи на запрошенный диапазон.

## 2. Текущий baseline и выявленные разрывы

Этап 2 уже предоставляет:

- безопасную границу main/preload/renderer;
- `TaskApplication`, `TaskRepositoryPort`, SQLite adapter, типизированный IPC и
  общий `TaskEditor`;
- `preferred_start_date`, `due_date`, `scheduled_time` и календарные индексы
  базового уровня в SQLite;
- общие project/tag filters в `App`;
- локальную календарную арифметику без UTC-полуночи;
- `ru`, `en` и `es`, четыре темы и responsive shell;
- архивирование, optimistic concurrency и обновление общего snapshot.

До начала реализации Week/Month необходимо закрыть следующие разрывы:

1. `scheduled_time` существует в миграции и модели данных, но отсутствует в
   `Task`, `TaskDraft`, repository mapping, IPC и форме.
2. `getBoard()` загружает все активные задачи и не является диапазонным
   calendar query.
3. В домене нет вычисления ISO-недели, сетки месяца, пересечения диапазонов и
   раскладки полос.
4. Week и Month пока являются placeholder-компонентами.
5. Период, позиция календаря и focus target не представлены отдельным
   сохраняемым view state.
6. Нет calendar-specific loading, empty, error и accessibility states.

Схема Этапа 1 уже содержит `scheduled_time`, поэтому добавлять колонку повторно
не нужно. Любое изменение индексов выполняется отдельной append-only миграцией;
checksum миграции `foundation` не меняется.

## 3. Архитектурные решения

### 3.1. Граница данных

Добавить узкий read API в `TaskApplication`, `TaskRepositoryPort` и
`TiempioApi`:

```ts
interface CalendarTaskQuery {
	readonly rangeStart: string
	readonly rangeEnd: string
	readonly projectId: string | null
	readonly tagId: string | null
}

interface CalendarTaskSnapshot {
	readonly rangeStart: string
	readonly rangeEnd: string
	readonly tasks: readonly Task[]
}
```

`tasks.listCalendar(query)` возвращает только неархивные задачи, чей
включительный диапазон пересекает видимый диапазон:

```text
preferred_start_date <= rangeEnd AND due_date >= rangeStart
```

Фильтры применяются в repository:

- `projectId` — точное совпадение;
- `tagId` — `EXISTS` по `task_tags`, чтобы одна задача не дублировалась;
- все значения передаются как bound parameters;
- допустимы только заранее определённые SQL-варианты, без пользовательских
  SQL-фрагментов.

Week запрашивает ровно семь дней. Month запрашивает полную видимую сетку от
понедельника первой строки до воскресенья последней строки, включая внешние дни.
Метаданные проектов и тегов продолжают поступать из текущего board snapshot.

### 3.2. Индекс и миграция

Добавить миграцию версии 2 с partial index для активного календаря, например:

```sql
CREATE INDEX tasks_active_calendar
	ON tasks(preferred_start_date, due_date, id)
	WHERE archived_at IS NULL;
```

Перед фиксацией конкретного порядка колонок сравнить `EXPLAIN QUERY PLAN` для
выборок по прошлому, текущему и будущему диапазону на наборе не менее 10 000
задач. Если индекс с первым `due_date` даёт более устойчивый план для реальных
данных, выбрать его и зафиксировать решение repository-тестом и в итоговом
отчёте.

### 3.3. Время задачи

Протянуть существующее поле через все слои:

- `Task.scheduledTime: string | null`;
- `TaskDraft.scheduledTime: string | null`;
- runtime-валидация формата `HH:mm`;
- чтение и запись `scheduled_time` в repository;
- опциональный input `type="time"` в общем `TaskEditor`;
- запись `dates_changed`, если время изменено;
- отображение локализованного времени в Week и Month.

Пустое значение хранится как `null`. Часовой пояс и конвертация в UTC не
добавляются.

### 3.4. Чистый календарный домен

Создать `src/shared/calendarDomain.ts`, не зависящий от React, Electron, SQL и
системного часового пояса. Модуль должен предоставить:

- `isoWeekday(localDate)` с понедельником `1`, воскресеньем `7`;
- `startOfIsoWeek`, `endOfIsoWeek`;
- `startOfMonth`, `endOfMonth`;
- `moveWeek`, `moveMonth`;
- `monthGridRange` с 4–6 полными строками понедельник–воскресенье;
- перечисление дней диапазона;
- включительное пересечение и обрезку диапазонов;
- чистую раскладку полос для Week и Month.

Внутренняя арифметика использует `LocalDate` и ordinal helpers из
`taskDomain.ts`. Обычный `Date` разрешён только на границе `Intl`-форматирования,
а не для вычисления первого дня недели или длины полосы.

### 3.5. Единый алгоритм календарных полос

Вход алгоритма:

- видимый диапазон, разбитый на ISO-недели;
- задачи с `preferredStartDate`, `dueDate` и стабильным `id`.

Выход:

```ts
interface CalendarBandSegment {
	readonly taskId: string
	readonly weekStart: string
	readonly startColumn: number
	readonly spanColumns: number
	readonly lane: number
	readonly continuesBefore: boolean
	readonly continuesAfter: boolean
	readonly labelVisible: boolean
}
```

Алгоритм выполняет следующие шаги:

1. отбрасывает диапазоны без пересечения с viewport;
2. обрезает задачу по границам видимого диапазона;
3. разбивает её только по границам недельной строки;
4. сохраняет `taskId` и continuation flags у всех частей;
5. сортирует сегменты детерминированно: продолжения, день начала, более длинный
   span, дедлайн, `taskId`;
6. размещает сегменты greedy-алгоритмом в первой свободной lane;
7. при переходе на следующую строку сначала пытается сохранить lane предыдущего
   сегмента той же задачи;
8. показывает название один раз на непрерывном сегменте Week и один раз на
   каждой визуально разорванной строкой Month части;
9. возвращает одинаковый результат независимо от порядка входных задач.

Две полосы в одной lane не могут занимать общий день. Обе части полосы через
воскресенье/понедельник имеют одинаковый visual identity, continuation shape и
открывают один `taskId`.

## 4. Renderer и состояние представления

### 4.1. Декомпозиция

Добавить компоненты:

```text
src/renderer/src/app/calendar/
  CalendarToolbar.tsx
  CalendarGrid.tsx
  CalendarBand.tsx
  WeekView.tsx
  MonthView.tsx
  useCalendarTasks.ts
  calendarViewState.ts
src/renderer/src/styles/
  calendar.css
```

`App.tsx` остаётся владельцем:

- активного раздела;
- общих project/tag filters;
- выбранных week/month anchors;
- открытой общей карточки;
- refresh/invalidation после сохранения или архивации.

Чистая раскладка и навигация по датам не реализуются внутри React-компонентов.

### 4.2. Периоды

Week state хранит `weekStart`, уже нормализованный на понедельник. Toolbar:

- предыдущая неделя: `-7` дней;
- текущая неделя: понедельник недели `localDate`;
- следующая неделя: `+7` дней.

Month state хранит первое число месяца. Toolbar:

- предыдущий месяц;
- текущий месяц;
- следующий месяц.

Month показывает все дни полных недель, пересекающих месяц. Внешние дни имеют
приглушённое оформление, но остаются частью корректной полосы и доступны
скринридеру.

### 4.3. Загрузка и обновление

`useCalendarTasks`:

- строит query из периода и общих фильтров;
- защищается sequence token от устаревших ответов;
- имеет отдельные `loading`, `ready`, `empty`, `filteredEmpty`, `error`;
- повторяет запрос после Retry;
- повторно загружает текущий диапазон после create/update/archive/restore;
- не очищает старый успешный результат до прихода нового при обычной навигации,
  но помечает его как обновляющийся;
- не отправляет запрос для placeholder Projects.

Создание задачи из Week/Month использует общий `TaskEditor`. Новый объект не
получает скрытое календарное значение автоматически: дата и время меняются
только явно пользователем.

### 4.4. Возврат из карточки

Перед открытием задачи календарь сохраняет:

- `section`;
- period anchor;
- project/tag filters;
- `scrollLeft` и `scrollTop` viewport;
- `taskId`/segment key элемента, имевшего focus.

После закрытия или сохранения:

- остаётся тот же раздел и период;
- фильтры не меняются;
- прокрутка восстанавливается после layout;
- focus возвращается на ту же полосу;
- если задача после редактирования вышла из диапазона или была архивирована,
  focus переходит на заголовок календаря с понятным accessible name.

Смена `ru`/`en`/`es` не пересоздаёт view state и не закрывает редактор.

## 5. Визуальное поведение

### 5.1. Общая полоса

Полоса реализуется как тематизированная кнопка в CSS Grid:

- `grid-column` задаёт включительный диапазон;
- `grid-row` задаёт lane;
- левая/правая форма показывает продолжение за границей строки;
- статус виден компактным маркером и доступным текстом;
- проект показывается короткой меткой с названием, без новой модели цвета;
- `scheduledTime` находится рядом с названием;
- `done` остаётся читаемым, но визуально спокойнее активных статусов;
- просрочка не превращает календарь в красную поверхность.

Hover, focus и selected state используют глубину, границу и форму вместе с
цветом. Полоса читается во всех темах и без `backdrop-filter`.

### 5.2. Week

- одна строка из семи дней;
- мягкое выделение текущего дня;
- заголовок периода с локализованными началом и концом;
- полосы проходят через соседние дни без промежутков;
- день и полоса имеют достаточную hit area;
- drag-to-reschedule отсутствует.

### 5.3. Month

- 4–6 строк полных ISO-недель;
- локализованный заголовок месяца и года;
- внешние дни соседних месяцев обозначены визуально и текстово;
- части одной задачи на соседних строках имеют одинаковый `data-task-id`,
  continuation style и accessible label;
- Month остаётся обзором: редактирование начинается только после открытия общей
  карточки.

### 5.4. Medium и compact

Семантическая семидневная сетка сохраняется на всех ширинах:

- wide: все семь колонок без горизонтальной прокрутки;
- medium: сокращённые weekday labels, компактные метки и уменьшенные отступы;
- compact: календарный viewport получает минимальную читаемую ширину колонок и
  контролируемую горизонтальную прокрутку со sticky weekday header;
- при перемещении клавиатурного фокуса нужный день/полоса автоматически
  прокручивается в видимую область;
- полное название задачи доступно в accessible name и при открытии, даже если
  видимый текст сокращён;
- прокрутка не распространяется на всю оболочку приложения.

## 6. Клавиатура и accessibility

Calendar toolbar использует обычные кнопки с локализованными именами. Сетка
получает roving tabindex:

- `ArrowLeft`/`ArrowRight` — соседний день;
- `ArrowUp`/`ArrowDown` — тот же weekday предыдущей/следующей недели;
- `Home`/`End` — понедельник/воскресенье текущей строки;
- `PageUp`/`PageDown` — предыдущий/следующий период;
- `Enter`/`Space` на полосе — открыть общую карточку;
- `Escape` в карточке — безопасно вернуться без потери контекста.

Accessible name полосы включает:

- название;
- локализованные дату начала и дедлайн;
- время при наличии;
- статус;
- проект при наличии;
- признак продолжения, если видимая часть обрезана.

Текущий день объявляется не только цветом. Loading/error состояния используют
уместные `aria-live`/`role="alert"` без повторного объявления всей сетки при
каждом фокусном переходе.

## 7. Локализация

Одновременно добавить ключи `en`, `ru`, `es` для:

- заголовков периода;
- previous/current/next week и month;
- weekday labels и accessible full labels;
- loading, empty, filtered empty, error и retry;
- статуса обновления;
- внешнего дня;
- начала/окончания и продолжения полосы;
- полного accessible описания задачи;
- поля времени и его валидации.

Добавить общие форматтеры:

- `formatWeekRange`;
- `formatMonthHeading`;
- `formatWeekday`;
- `formatLocalTime`;
- формат полного диапазона для accessibility.

Порядок дней всегда вычисляется доменом с понедельника; `Intl` меняет только
подписи и формат. Смена языка не изменяет ISO-даты, выбранный период, фильтры или
положение.

## 8. Изменения по слоям

### Shared

- `contracts.ts`: calendar query/snapshot, `scheduledTime`, новый API method;
- `taskDomain.ts`: переиспользуемые ordinal helpers и LocalTime validation;
- `calendarDomain.ts`: периоды, диапазоны и layout;
- `ipcProtocol.ts`: runtime parsing calendar query/snapshot и времени;
- `localization/index.ts`: calendar/date/time formatters;
- `localization/catalogs.ts`: полный набор ключей в трёх языках.

### Main и preload

- `migrations.ts`: append-only calendar index;
- `taskRepository.ts`: scheduled time mapping и реализация bounded calendar
  query в SQLite adapter;
- `ipc.ts`: новый validated handler;
- `preload/index.ts`: один узкий `tasks.listCalendar()` method.

### Renderer

- `App.tsx`: заменить Week/Month placeholders реальными views и сохранить общий
  filter/editor context;
- `TaskEditor.tsx`: опциональное время;
- новые calendar components и `calendar.css`;
- `installBrowserPreviewApi.ts`: поддержать новый контракт и реалистичные
  многодневные sample tasks.

### Документация

- после реализации создать `PHASE-3-WEEK-MONTH.md`;
- обновить README до завершённого Этапа 3;
- при необходимости уточнить только фактические архитектурные решения, не
  расширяя продуктовый scope.

## 9. Тестовый план

### 9.1. Домен

- понедельник определяется одинаково для `ru`, `en`, `es`;
- неделя на границе месяца и года;
- февраль обычного и високосного года;
- месяцы, начинающиеся в каждый weekday;
- сетка из 4, 5 и 6 недель;
- переход December ↔ January;
- одна задача 23–25 июля даёт один Week segment длиной 3;
- полоса Sunday ↔ Monday разбивается на две связанные части;
- задача, начавшаяся до viewport или заканчивающаяся после него, корректно
  обрезается;
- однодневная задача занимает одну колонку;
- overlapping tasks не пересекаются в одной lane;
- continuation пытается сохранить lane;
- результат не зависит от входного порядка;
- `HH:mm` принимает `00:00` и `23:59`, отклоняет невозможные значения.

### 9.2. Repository и IPC

- диапазон использует включительные границы;
- задача целиком охватывающая viewport возвращается;
- задачи до/после диапазона не возвращаются;
- архивная задача отсутствует;
- project и tag filters работают отдельно и вместе;
- несколько тегов не дублируют задачу;
- некорректный или слишком широкий диапазон отклоняется;
- scheduled time проходит create/update/reopen round trip;
- старая база получает миграцию 2 один раз, checksum migration 1 неизменен;
- `EXPLAIN QUERY PLAN` и замер на 10 000 задач подтверждают bounded query.

Ограничить максимальный query range, например 62 днями: этого достаточно для
любой полной месячной сетки и не позволяет renderer запросить неограниченную
историю.

### 9.3. Renderer и ручная приёмка

- Week previous/current/next;
- Month previous/current/next и правильные внешние дни;
- общие фильтры Today → Week → Month и явный сброс;
- открытие обеих частей split band ведёт в одну карточку;
- save, cancel, conflict reload и archive из календаря;
- возврат периода, scroll и focus;
- смена языка с открытой карточкой;
- клавиатурный проход toolbar → days → bands → editor → back;
- wide 1440 px, medium 1000 px, compact 600 px;
- четыре темы × light/dark, fallback без blur, reduced motion;
- длинные русские и испанские названия;
- loading, empty, filtered empty, storage busy и generic recovery;
- архивная задача отсутствует после обновления текущего диапазона.

## 10. Последовательность реализации

Каждый пункт должен завершаться атомарным коммитом и проходящими релевантными
тестами.

1. **Calendar primitives**
    - выделить безопасную LocalDate/LocalTime арифметику;
    - добавить period/grid helpers;
    - покрыть границы месяцев, лет и високосный год.
2. **Контракты времени и календарного query**
    - расширить `Task`/`TaskDraft`;
    - добавить query/snapshot parsers;
    - обновить protocol tests и browser preview types.
3. **Storage read path**
    - добавить миграцию индекса;
    - реализовать scheduled time round trip;
    - реализовать bounded filtered query;
    - проверить migration, archive и performance contracts.
4. **Calendar layout engine**
    - clipping, week splitting, lanes и continuation flags;
    - детерминированные unit tests по приёмочным сценариям.
5. **Общий calendar shell**
    - toolbar, data hook, loading/error/empty states;
    - period/filter state в `App`;
    - refresh после изменений.
6. **Week vertical slice**
    - недельная сетка, band rendering, today marker;
    - открытие общей карточки и восстановление контекста.
7. **Month vertical slice**
    - полная сетка и внешние дни;
    - split bands через границы недель;
    - корректная навигация между месяцами.
8. **Time, i18n и accessibility**
    - поле времени в редакторе;
    - три каталога и Intl formatters;
    - roving focus, accessible labels и keyboard commands.
9. **Responsive и visual hardening**
    - wide/medium/compact;
    - все темы, no-blur fallback, reduced motion;
    - длинные строки и плотные данные.
10. **Приёмка и отчёт**
    - интерактивные сценарии 6, 10.1, 13.7–13.9;
    - `npm run release:check`;
    - итоговый `PHASE-3-WEEK-MONTH.md` с фактическими проверками.

## 11. Матрица приёмки

| Требование                      | Реализация                                  | Доказательство                       |
| ------------------------------- | ------------------------------------------- | ------------------------------------ |
| Неделя с понедельника           | `startOfIsoWeek`                            | domain tests во всех locale          |
| Previous/current/next Week      | `CalendarToolbar` + week state              | keyboard/manual scenario             |
| Month и внешние дни             | `monthGridRange`                            | 4/5/6-row tests                      |
| Непрерывная полоса              | layout segment + CSS Grid                   | acceptance 6.1                       |
| Граница воскресенье/понедельник | split + continuation flags                  | acceptance 6.2                       |
| Конкретное время                | `scheduledTime` end-to-end                  | acceptance 6.3 + persistence test    |
| Общая карточка и возврат        | shared `TaskEditor` + saved view state      | acceptance 6.4                       |
| Архивные задачи скрыты          | repository predicate + refresh              | acceptance 10.1                      |
| Общие filters                   | App-owned filters + filtered query          | acceptance 5.1–5.3                   |
| Локализованные даты             | shared Intl formatters                      | acceptance 13.7–13.9                 |
| Keyboard и screen reader        | roving focus + band labels                  | keyboard/manual audit                |
| Medium/compact                  | bounded scrollable calendar viewport        | 1000/600 px screenshots/manual audit |
| Производительность              | bounded query + index + bounded pure layout | 10 000-task measurement              |
| Security boundary               | validated IPC + narrow preload method       | protocol/security gate               |

## 12. Риски и меры

### Плотный Month

Большое число пересекающихся задач увеличивает число lanes. На Этапе 3 не
вводится скрывающее задачи правило без продуктового контракта. Calendar row
растёт по рассчитанному числу lanes, а рабочая область прокручивается. На
реалистичном наборе отдельно проверяется читаемость и отсутствие layout thrash.

### Потеря контекста при async refresh

Query sequence token блокирует устаревшие ответы. Scroll и focus
восстанавливаются по стабильным task/segment keys после commit DOM.

### Сдвиг даты часовым поясом

Core-вычисления не используют UTC midnight. Преобразование в `Date` разрешено
только локальному formatting adapter с явными year/month/day.

### Разрастание `App.tsx`

Calendar fetching, layout и keyboard model выносятся в отдельные модули.
`App.tsx` координирует только cross-view state и overlays.

### Миграционный drift

`foundation` не редактируется. Новый индекс добавляется версией 2 и проверяется
на пустой, старой и уже актуальной базе.

## 13. Не входит в этап

- drag-to-reschedule и resize полос;
- изменение дат прямо в сетке;
- повторяющиеся серии и occurrences;
- внешние календари;
- загрузка недели относительно свободного времени;
- goals, milestones, owners и project dashboard;
- отдельная мобильная компоновка;
- материализация календарных копий задач.

## 14. Definition of done

Этап готов к объединению с `main`, когда:

1. реализованы Week и Month без расширения scope;
2. все строки и accessibility labels присутствуют в `en`, `ru`, `es`;
3. миграция append-only и repository query ограничен диапазоном;
4. доменный layout полностью покрыт unit tests;
5. сценарии 6, 10.1 и 13.7–13.9 пройдены;
6. фильтры, период, scroll и focus сохраняются при открытии карточки;
7. интерфейс проверен на 1440, 1000 и 600 px, во всех темах и без blur;
8. keyboard workflow позволяет выполнить весь основной сценарий без мыши;
9. `npm run release:check` проходит;
10. создан итоговый отчёт `PHASE-3-WEEK-MONTH.md`;
11. `Yinkie` отсутствует в Git, сборке и `app.asar`.
