# Development

## Getting Started

```bash
pnpm install
pnpm --filter @clawwork/desktop dev
```

## Packaging (unsigned dmg)

```bash
pnpm --filter @clawwork/desktop run build:dmg
```

Output at `packages/desktop/dist/ClawWork-<version>-arm64.dmg`.

Unsigned — on first launch, right-click → Open.
