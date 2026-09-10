# Architecture

## Stack

- HTML5
- CSS3
- JavaScript
- Canvas API
- Vite
- Yandex Games SDK
- localStorage

## Runtime

The game runs entirely in the browser.

There is no custom backend and no database.

## Rendering

Canvas is responsible for rendering the gameplay.

HTML/CSS is responsible for menus and non-gameplay UI where appropriate.

## Project structure

```text
src/
├── game/
├── input/
├── rendering/
├── services/
├── ui/
└── localization/

```

### game/

Core gameplay logic.

### input/

Keyboard, desktop mouse (left/right half of the canvas), and touch input.

### rendering/

Canvas rendering and visual effects.

### services/

External services and browser persistence.

Examples:

- Yandex Games SDK
- localStorage

### ui/

Menus and interface.

### localization/

Translated UI strings.

## External integrations

### Yandex Games SDK

Used for:

- advertising;
- authorization;
- leaderboards;
- gameplay events;
- loading events;
- localization/environment information.

Yandex-specific logic must remain inside the service layer.

The core game must not directly depend on Yandex SDK.

## Local development

Use Vite development server.

```bash
npm install
npm run dev

```

## Production

```bash
npm run build

```

Production files are generated into:

```text
dist/

```

