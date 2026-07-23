# Contributing to TrackMe

Read the contracts in `docs/architecture`, `docs/design/UI-DIRECTION.md` and
`docs/QUALITY.md` before changing production code.

Every change must:

1. have one explicit outcome;
2. preserve the main/preload/renderer boundary;
3. include tests for domain or storage behavior;
4. keep `ru`, `en` and `es` catalogs in parity;
5. run `npm run format` and `npm run quality`.

Do not combine product work with unrelated mass formatting.
