# Project Guidelines

## Code Style
- Use TypeScript for all code under `mobile/`.
- Keep modules focused by domain (`db`, `services`, `importers`, `types`).
- Prefer explicit named exports over default exports in non-screen modules.
- Use internal alias imports with `@/` for files in `mobile/src/`.

## Architecture
- UI screens and navigation live in `mobile/app/`.
- Persistence uses local SQLite (`expo-sqlite`) in `mobile/src/db/`.
- Domain logic belongs in `mobile/src/services/`.
- CSV parsing and normalization belong in `mobile/src/importers/`.
- Shared domain contracts are defined in `mobile/src/types/finance.ts`.

## Build and Test
- Install dependencies from `mobile/`: `npm install`.
- Run type checks from `mobile/`: `npm run typecheck`.
- There is currently no test or lint script; do not invent commands that are not defined.

## Conventions
- Keep business logic out of screen components when possible; route through repository/services.
- Treat Nubank CSV headers and formats as canonical input for importer behavior.
- Preserve Portuguese user-facing copy consistency in app screens.
- Keep generated content ASCII unless the file already requires non-ASCII characters.

## Environment Notes
- This workspace may run on Windows + WSL; run Node/Expo/npm commands from an interactive WSL terminal session.
- Use the WSL environment where Node is `v20.19.4` for all JavaScript and Expo commands.
- Avoid invoking WSL through one-shot wrappers from PowerShell for Node workflows; keep commands in the same interactive WSL shell.
- Financial CSV files in `nubank_exports/` may contain sensitive personal and banking data; avoid exposing raw values in logs, examples, or commits.
