# Tiempio — подготовительный Этап 0: имя и граница данных

**Статус:** завершён  
**Дата:** 25 июля 2026  
**Ветка:** `codex/phase-0-tiempio-data-boundary`  
**Следующий этап:** Этап 3 — Week и Month  
**План продолжения:** [ROADMAP.md](./ROADMAP.md)

## Цель

До реализации календарных представлений убрать прямую зависимость IPC от
SQLite-классов, заменить рабочее имя продукта на Tiempio без потери уже
созданных локальных данных и закрепить Unicode-корректную обработку
пользовательского текста.

Этап не меняет пользовательский lifecycle задач и не добавляет новый продуктовый
scope.

## Граница приложения и хранения

Добавлены два уровня контрактов:

1. `SettingsRepositoryPort` и `TaskRepositoryPort` описывают необходимые
   операции хранения через общие DTO.
2. `SettingsApplication` и `TaskApplication` предоставляют IPC асинхронные use
   cases и скрывают конкретный storage adapter.

SQLite-реализации явно называются `SqliteSettingsRepository` и
`SqliteTaskRepository`. Они получают единственный `TiempioDatabase`, но IPC
больше не импортирует и не принимает эти классы.

Repository ports возвращают `Awaitable<T>`. Поэтому desktop может сохранить
синхронный `node:sqlite`, а будущий IndexedDB, OPFS или HTTP adapter сможет быть
асинхронным без изменения application API.

## Имя Tiempio

Новое имя применяется к:

- пользовательским строкам `en`, `ru`, `es`;
- package metadata и installer;
- executable и application ID;
- preload bridge `window.tiempio`;
- внутреннему custom protocol `tiempio://app`;
- CSP marker и build policies;
- SQLite-файлу `tiempio.sqlite3`;
- backup-расширению `.tiempio`;
- smoke profiles, тестам и документации.

Нейтральная иконка с checkmark не содержит старого имени и сохраняется.
Зарезервированные продуктовые домены: `tiempio.com` и `tiempio.app`.

## Сохранение существующих данных

Смена product name изменяет стандартный Electron `userData`, а смена имени БД
изменяет путь к SQLite-файлу. Чтобы пользователь не получил пустой профиль,
startup выполняет безопасную совместимость:

1. если `tiempio.sqlite3` уже существует, он никогда не перезаписывается;
2. если нового файла нет, проверяется предыдущий профиль;
3. предыдущая база открывается SQLite и копируется штатным backup API;
4. временный snapshot проходит `PRAGMA quick_check`;
5. проверенный snapshot атомарно переименовывается в `tiempio.sqlite3`;
6. исходный файл не удаляется и остаётся recovery-копией;
7. обычный механизм миграций открывает уже новый файл.

Compatibility-идентификатор предыдущего профиля хранится только в закодированном
виде внутри migration adapter. Он не показывается пользователю и не возвращает
старое имя в package, API или документацию.

## Unicode и emoji

Названия задач и проектов, описания и теги принимают обычный Unicode-текст,
включая emoji и составные ZWJ-последовательности. Для этого:

1. общая функция приводит пользовательский текст к NFC и удаляет внешние пробелы;
2. лимиты считаются через `Intl.Segmenter` по grapheme clusters, а не по UTF-16
   `.length`;
3. IPC повторяет те же grapheme-ограничения и дополнительно ограничивает сырой
   размер строки;
4. SQLite сохраняет строки в существующих `TEXT`-полях без изменения схемы;
5. тест закрывает полный round-trip задачи с emoji через файловую SQLite-базу;
6. системный font stack содержит color emoji fallback для Windows, macOS и Linux.

Отдельный emoji picker не входит в этот инфраструктурный этап. Пользователь уже
может вводить emoji системной клавиатурой; picker остаётся независимым
lazy-loaded UX-улучшением.

## Проверки

Фактически пройдены:

- repository policy для 106 текстовых файлов;
- новый Tiempio brand audit;
- Prettier и ESLint;
- i18n, theme и UI audits;
- 40 тестов приложения, включая application services, перенос пользовательской
  базы и Unicode/emoji round-trip;
- 22 policy-теста, включая два теста brand policy;
- отдельные Node и Web typecheck;
- production build main/preload/renderer;
- renderer bundle budget и Electron security policy;
- unpacked Windows package с `Tiempio.exe`;
- packaged content policy: 33 entries, `app.asar` 0,43 MiB;
- hardened Electron fuses;
- packaged smoke test с отдельным профилем Tiempio.

Все стадии production release gate прошли. Старое рабочее имя отсутствует в
исходниках, документации, новых путях и сгенерированных текстовых артефактах.
