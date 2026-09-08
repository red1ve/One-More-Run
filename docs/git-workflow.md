# Git Workflow

## Purpose

Git is used to track project changes and keep the project recoverable.

## Basic rules

- Make small, logical commits.
- Do not commit broken or obviously unfinished changes when avoidable.
- Do not commit generated folders such as `node_modules/` or `dist/`.
- Do not commit secrets, API keys, passwords, or private credentials.
- Check the project before committing.

## Commit style

Use short, clear commit messages.

Examples:

- `feat: add player movement`
- `feat: add score system`
- `fix: prevent player from leaving track`
- `fix: pause game when window loses focus`
- `refactor: simplify game state`

## Development workflow

1. Make one logical change.
2. Test the change.
3. Check the browser console for errors.
4. Review the changed files.
5. Commit the change.

## AI development

AI may create and modify code, but every significant change must be explained to the developer.

Do not create large unrelated changes in one commit.

Before committing, briefly explain:

- what changed;
- why it changed;
- how it was tested.

