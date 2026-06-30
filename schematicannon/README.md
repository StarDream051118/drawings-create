# Schematicannon

Library for rendering [Create Mod](https://github.com/Creators-of-Create/Create) schematics on top of the [Deepslate](https://github.com/misode/deepslate) vanilla Minecraft renderer.

## Features

- **Create rendering**: View Create structures (NBT) in the browser with support for kinetic components.
- **Asset import**: CLI tool to download necessary assets from Modrinth and MCMeta.
- **Flywheel implementation**: Handles kinetic visuals.

## Installation

```bash
pnpm add schematicannon
```

## Setup

### 1. Generate Assets

Schematicannon requires assets (models, textures, blockstates) from Minecraft and the Create mod. Use the CLI to download and extract them:

```bash
pnpx schematicannon generate-assets -d ./assets
```
or after installation:

```bash
pnpm generate-assets
```

### 2. Implementation

```typescript
import { createStructureViewer } from 'schematicannon';

const viewer = createStructureViewer({
  canvas: document.getElementById('viewport') as HTMLCanvasElement,
  createAssetsBase: '/assets/create/6.0.9/',
  vanillaAssetsBase: '/assets/minecraft/1.21.1/'
});

// Subscribe to events (loading progress, errors, etc.)
viewer.observer.subscribe(event => {
  if (event.type === 'loading-progress') {
    console.log(event.message);
  }
  if (event.type === 'fatal-error') {
    console.error(event.message, event.error);
  }
});

// Load an NBT file
const response = await fetch('/path-to-your/schematic.nbt');
const buffer = await response.arrayBuffer();
await viewer.loadStructure(buffer);
```

## CLI Reference

`npx schematicannon generate-assets [options]`

- `-d, --directory <path>`: Output directory (default: `./assets`)
- `--clear`: Clear output directory before starting.

## License

MIT
