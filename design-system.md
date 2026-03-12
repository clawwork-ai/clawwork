# ClawWork Design System

> Version 1.1 — Phase 3.5 + Premium Depth Pass
> Brand identity: `#0FFD0D` (accent green), dark-first developer tool aesthetic.

## Color System

### Neutral (Gray Scale)
Used for backgrounds, text, borders. Dark mode uses 800-950 for backgrounds, light mode uses 50-200.

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-50` | `#FAFAFA` | Light: primary bg |
| `neutral-100` | `#F3F4F6` | Light: secondary bg |
| `neutral-200` | `#E5E7EB` | Light: hover bg |
| `neutral-300` | `#D1D5DB` | Light: borders, scrollbar |
| `neutral-400` | `#9CA3AF` | Secondary text (dark) |
| `neutral-500` | `#6B7280` | Muted text (dark), secondary text (light) |
| `neutral-600` | `#4B5563` | — |
| `neutral-700` | `#374151` | — |
| `neutral-800` | `#2A2A2A` | Dark: tertiary bg |
| `neutral-900` | `#242424` | Dark: secondary bg |
| `neutral-950` | `#1C1C1C` | Dark: primary bg |

### Accent (Brand Green)
`#0FFD0D` is the hero color — used sparingly for CTAs, active states, and emphasis.

| Token | Hex | Usage |
|-------|-----|-------|
| `accent-500` | `#0FFD0D` | Primary accent (dark) |
| `accent-700` | `#0B8A0A` | Primary accent (light) |
| `accent-dim` | `rgba(15,253,13,0.15)` | Subtle backgrounds, badges |

### Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `danger-400` | `#F87171` | Error text |
| `danger-500` | `#EF4444` | Error bg/border |
| `warning-500` | `#F59E0B` | Warning states |
| `info-500` | `#3B82F6` | Info states |

## Typography

| Property | Value |
|----------|-------|
| Sans font | Inter Variable |
| Mono font | JetBrains Mono Variable |
| Base size | 14px (bumped from 13px in Premium Depth Pass) |
| Scale | xs:11 sm:12 base:13 md:14 lg:16 xl:18 2xl:20 3xl:24 |
| Weight | normal:400 medium:500 semibold:600 bold:700 |

## Spacing

4px base unit: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 4px | Badges, small chips |
| `md` | 6px | Buttons, inputs |
| `lg` | 8px | Cards, panels |
| `xl` | 12px | Dialogs, large cards |
| `2xl` | 16px | Feature sections |
| `full` | 9999px | Avatars, pills |

## Shadows (Dark Mode Optimized)

| Token | Value |
|-------|-------|
| `sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `md` | `0 2px 8px rgba(0,0,0,0.4)` |
| `lg` | `0 4px 16px rgba(0,0,0,0.5)` |
| `xl` | `0 8px 32px rgba(0,0,0,0.6)` |

## Motion & Transitions

### Duration
| Token | Value | Usage |
|-------|-------|-------|
| `fast` | 100ms | Hover states, color changes |
| `normal` | 150ms | Button press, toggle |
| `moderate` | 200ms | Panel slide, card expand |
| `slow` | 300ms | Page transitions, modal entry |

### Easing
| Token | Value | Usage |
|-------|-------|-------|
| `default` | `cubic-bezier(0.2, 0, 0, 1)` | General purpose |
| `enter` | `cubic-bezier(0, 0, 0.2, 1)` | Elements appearing |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements disappearing |
| `spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful bounce |

### Framer Motion Presets
- `fadeIn`: opacity 0→1, 150ms
- `slideUp`: y:8→0 + fade, 200ms
- `slideIn`: x:-8→0 + fade, 200ms
- `scale`: hover 1.02, tap 0.97
- `listItem`: y:4→0 + fade, 150ms (stagger children)

Respect `prefers-reduced-motion: reduce` — disable transform animations, keep opacity only.

## Component State Spec

Every interactive element must implement:

| State | Visual |
|-------|--------|
| **Default** | Base colors, no shadow |
| **Hover** | `bg-hover` shift, subtle scale (1.02), cursor pointer |
| **Active/Pressed** | Scale down (0.97), slightly darker bg |
| **Focused** | `ring-2 ring-accent/50`, visible outline |
| **Disabled** | `opacity-50`, `cursor-not-allowed`, no hover/press |
| **Loading** | Skeleton shimmer or spinner, disabled interaction |

## Implementation

- **CSS Variables** defined in `theme.css` (`:root` dark, `[data-theme="light"]`)
- **TS tokens** in `styles/design-tokens.ts` — reference values
- **Tailwind classes** map to CSS Variables via `var(--xxx)`
- **shadcn/ui** components in `components/ui/` — use `cn()` from `lib/utils.ts`
- **Framer Motion** — use presets from `design-tokens.ts` `motion` object

## Premium Depth Tokens (Phase 3.5 Visual Polish)

Added to `theme.css` to give surfaces depth, elevation, and interactive polish.

### CSS Variables

| Token | Dark Value | Light Value | Usage |
|-------|-----------|-------------|-------|
| `--accent-hover` | `#0DE00B` | `#0A7A09` | Accent hover state |
| `--accent-soft` | `rgba(15,253,13,0.10)` | `rgba(11,138,10,0.08)` | Soft button bg, subtle accent surfaces |
| `--accent-soft-hover` | `rgba(15,253,13,0.18)` | `rgba(11,138,10,0.14)` | Soft button hover state |
| `--bg-elevated` | `#2F2F2F` | `#FFFFFF` | Elevated surfaces (cards, active tabs, dropdowns) |
| `--ring-accent` | `rgba(15,253,13,0.40)` | `rgba(11,138,10,0.30)` | Focus ring color |
| `--glow-accent` | `rgba(15,253,13,0.06)` | `rgba(11,138,10,0.04)` | Radial glow backgrounds |
| `--shadow-elevated` | `0 2px 12px rgba(0,0,0,0.4)` | `0 2px 12px rgba(0,0,0,0.08)` | Elevated surface shadow |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,0.3)` | `0 1px 4px rgba(0,0,0,0.06)` | Card shadow |
| `--border-subtle` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | Subtle borders |
| `--danger` | `#F87171` | `#DC2626` | Danger text/icon color |
| `--danger-bg` | `rgba(248,113,113,0.10)` | `rgba(220,38,38,0.08)` | Danger hover bg |

### CSS Utility Classes

Defined in `@layer base` in `theme.css`:

| Class | Effect |
|-------|--------|
| `.surface-elevated` | `--bg-elevated` bg + `--shadow-elevated` shadow + `--border-subtle` border |
| `.glow-accent` | Radial gradient glow using `--glow-accent` |
| `.ring-accent-focus` | On focus: 2px ring using `--ring-accent` + no default outline |

### Button `soft` Variant

Added to `button.tsx` cva variants. Uses `--accent-soft` background with accent text color — less aggressive than the full-fill `default` variant. Ideal for secondary CTAs like "New Task" and chat send button.

All button variants also received:
- `active:scale-[0.98]` press feedback
- Focus ring using `--ring-accent`

### Component-Specific Depth

| Component | Depth Treatment |
|-----------|----------------|
| ChatInput | `--bg-elevated` bg, `--shadow-elevated`, `.ring-accent-focus` on focus |
| TaskItem (active) | 3px left accent bar (`--accent`), `whileHover={{ x: 2 }}` |
| ToolCallCard | Left status bar (running=pulse, done=accent, error=red), `--shadow-card` |
| Tabs (active) | `--bg-elevated` bg, `--shadow-card` |
| DropdownMenu | `--bg-elevated` content bg, `--shadow-elevated`, danger items use `--danger`/`--danger-bg` |
| WelcomeScreen | Radial glow behind logo |
| Setup page | Radial glow + elevated card container |
