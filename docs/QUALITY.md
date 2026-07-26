# Tiempio — качество репозитория

**Статус:** обязательно с первого инкремента Этапа 1  
**Источник:** проверенные quality-настройки Yinkie с устранёнными конфликтами

## 1. Единый текстовый формат

Для всех текстовых файлов репозитория обязательны:

- UTF-8 без BOM;
- окончания строк LF;
- завершающий LF;
- отсутствие случайных trailing spaces;
- единое форматирование через Prettier.

Исключение для Markdown: два пробела в конце строки могут быть значимым hard
break, поэтому `.editorconfig` не удаляет trailing spaces в `*.md` и `*.mdx`.
Остальное форматирование Markdown остаётся под контролем Prettier.

Уровни защиты:

1. `.gitattributes` нормализует все текстовые файлы в LF на уровне Git.
2. `.editorconfig` задаёт UTF-8, LF, final newline и отступы в редакторе.
3. `.prettierrc.yaml` является источником истины для поддерживаемых форматов.
4. `scripts/repository-policy.mjs` проверяет LF, UTF-8 без BOM, final newline и
   trailing whitespace во всех tracked и ещё не добавленных, но не игнорируемых
   текстовых файлах. Для Markdown разрешён только осознанный hard break из двух
   пробелов.
5. `scripts/brand-policy.mjs` блокирует повторное появление прежнего рабочего
   имени в путях и содержимом новых или tracked текстовых файлов.

## 2. Форматирование

Tiempio сохраняет фактический стиль исходников Yinkie:

- одинарные кавычки;
- без точек с запятой;
- `printWidth: 100`;
- без trailing commas;
- tabs шириной 4 для JS, TS, JSX, TSX, CSS, HTML и JSON;
- LF независимо от ОС;
- два пробела для YAML и Markdown.

В Yinkie Prettier использует tabs шириной 4, но корневой `.editorconfig`
указывает spaces шириной 2. Tiempio не переносит этот конфликт: его
`.editorconfig` согласован с фактическим выводом Prettier по расширениям.

## 3. Обязательные конфиги первого инкремента

До первого production-компонента должны существовать и быть подключены:

- `.gitattributes`;
- `.editorconfig`;
- `.prettierrc.yaml` и `.prettierignore`;
- `eslint.config.mjs`;
- базовый `tsconfig.json`, отдельные node/web/test-конфиги;
- `scripts/repository-policy.mjs`;
- `scripts/i18n-policy.mjs`;
- `simple-git-hooks`;
- scripts в `package.json`, перечисленные ниже.

После генерации каркаса все текстовые файлы нормализуются один раз через
`git add --renormalize .`, затем проверяются до первого commit.

## 4. Package scripts

Первый `package.json` обязан предоставить:

```json
{
	"scripts": {
		"deps:install-check": "node scripts/dependency-gate.mjs install",
		"deps:audit": "node scripts/dependency-gate.mjs audit",
		"repo:audit": "node scripts/repository-policy.mjs",
		"brand:audit": "node scripts/brand-policy.mjs",
		"format": "prettier --write .",
		"format:check": "prettier --check .",
		"lint": "eslint --cache .",
		"lint:fix": "eslint --cache --fix .",
		"i18n:audit": "node scripts/i18n-policy.mjs src/renderer/src",
		"theme:audit": "node scripts/theme-policy.mjs src/renderer/src/styles/main.css",
		"ui:audit": "node scripts/ui-policy.mjs src/renderer/src",
		"test": "tsc -p tsconfig.test.json && node --test --experimental-test-isolation=none \".test-out/**/*.test.js\" && npm run test:scripts",
		"typecheck": "npm run typecheck:node && npm run typecheck:web",
		"precommit": "npm run repo:audit && npm run brand:audit && npm run format:check && npm run deps:install-check && npm run deps:audit && npm run lint && npm run i18n:audit && npm run theme:audit && npm run ui:audit && npm test && npm run typecheck",
		"quality": "npm run precommit"
	}
}
```

`precommit` расширяется по мере появления theme, security, packaging и
bundle-budget policies, но существующие проверки из него не удаляются.

### 4.1. Целостность и аудит зависимостей

`deps:install-check` создаёт временный каталог, копирует только `package.json` и
`package-lock.json`, выполняет в нём `npm ci --ignore-scripts` и удаляет каталог.
Так commit gate доказывает воспроизводимость чистой установки, не изменяя
рабочий `node_modules` или lockfile.

`deps:audit` разделяет две границы:

- production tree обязан иметь `0 high` и `0 critical`;
- полный tooling tree может содержать только явно рассмотренные advisory;
- любой новый high/critical advisory блокирует commit.

Текущий npm-отчёт показывает 20 high-severity узлов из-за одного
development-only advisory `GHSA-mh99-v99m-4gvg` в `brace-expansion`. Он
достижим через lint/packaging glob patterns, не входит в packaged Tiempio и
зафиксирован в gate по npm source `1124334`. `npm audit fix --force` не
применяется без отдельного анализа, потому что может заменить прямые инструменты
на несовместимые major-версии или откаты.

## 5. ESLint и TypeScript

ESLint повторяет основу Yinkie:

- `@electron-toolkit/eslint-config-ts`;
- `@electron-toolkit/eslint-config-prettier`;
- React recommended и JSX runtime;
- `eslint-plugin-react-hooks`;
- `eslint-plugin-react-refresh`;
- игнорирование только generated/build-каталогов.

TypeScript разделяет main/preload и renderer, включает `strict` для тестового
контракта и выполняет оба typecheck независимо. Renderer не получает Node types.

## 6. Git hook и CI

`simple-git-hooks` запускает `npm run precommit` перед каждым commit.

CI на чистом checkout выполняет:

```text
npm ci
npm run quality
```

Проверка обязана выполняться на Windows. Дополнительный Linux runner полезен как
раннее доказательство, что LF и scripts не зависят от локальной конфигурации Git.

Нельзя обходить gate ручным форматированием только затронутых файлов или
локальной настройкой `core.autocrlf`.

## 7. Definition of done

Изменение готово к commit, когда:

- `npm run deps:install-check` подтверждает чистый `npm ci`;
- production audit содержит `0 high` и `0 critical`, а tooling audit не содержит
  новых high/critical advisory;
- `npm run repo:audit` проходит;
- `npm run brand:audit` проходит;
- `npm run format:check` проходит без автоправок;
- ESLint не выдаёт ошибок;
- тесты и оба typecheck проходят;
- i18n-каталоги полны;
- в change set нет случайного массового переформатирования;
- commit содержит один атомарный результат.
