# TrackMe

TrackMe is a calm local-first desktop planner built with Electron, React and
TypeScript.

Stage 1 is complete: the secure Electron shell, SQLite schema, three-language
localization, four theme families and responsive Today foundation are working.
Task lifecycle functionality starts in Stage 2.

The implementation sequence and required Git branches are defined in
[docs/project-plan/ROADMAP.md](docs/project-plan/ROADMAP.md).

## Development

```text
npm install
npm run dev
```

## Quality

```text
npm run format
npm run quality
```

The complete production gate is:

```text
npm run release:check
```

The `Yinkie/` directory is local reference material and is never part of the
TrackMe repository or build.
