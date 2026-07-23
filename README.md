# TrackMe

TrackMe is a calm local-first desktop planner built with Electron, React and
TypeScript.

Stage 2 is complete: the secure Electron shell now includes a transactional task
lifecycle, projects and tags, a persistent four-status Today board, urgency
sorting, filters, archive recovery, three-language localization and responsive
keyboard-accessible workflows.

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
