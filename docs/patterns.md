# Patterns

## General principles

Prefer simple and readable code over clever code.

Do not optimize code without evidence that optimization is needed.

Do not create abstractions before they solve a real problem.

## Naming

Use English for:

- variables;
- functions;
- classes;
- files.

Names should describe their purpose.

Bad:

```javascript
const x = ...

```

Good:

```javascript
const playerSpeed = ...

```

## Functions

Prefer small functions with one clear responsibility.

Avoid functions that perform unrelated tasks.

## Game loop

Gameplay updates must use `requestAnimationFrame`.

Do not use `setInterval` as the primary game loop.

## State

Game state should have clear ownership.

Do not store the same state in multiple unrelated places.

## Services

External systems should be isolated behind service modules.

For example:

```text
game code
    ↓
YandexService
    ↓
Yandex SDK

```

The game should not directly call Yandex SDK methods throughout the project.

## Error handling

External service failures must not crash the game.

Handle expected failures gracefully.

## Comments

Do not comment obvious code.

Comments should explain:

- why something is unusual;
- why a workaround exists;
- important technical constraints.

## Dependencies

Before adding a dependency:

1. explain why it is needed;
2. check whether vanilla JavaScript is sufficient;
3. prefer fewer dependencies.

## Beginner-friendly code

Prefer code that is easy to explain to a beginner.

Do not use advanced language features simply to make the code shorter.