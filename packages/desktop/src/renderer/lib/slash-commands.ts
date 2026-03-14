/**
 * Slash command definitions for ClawWork input autocomplete.
 *
 * Source: mirrors OpenClaw's native command surface.
 * Reference: ~/git/openclaw/src/tui/commands.ts (getSlashCommands)
 *            ~/git/openclaw/src/auto-reply/commands-registry.ts (NativeCommandSpec)
 *
 * PLACEHOLDER: In a future version, this list should be fetched dynamically from
 * the Gateway via a `commands.list` RPC (not yet exposed in the Gateway API).
 * When that RPC is available, extend `gateway-client.ts` with `listCommands()`,
 * add an IPC handler `ws:commands-list`, and replace the static list below with
 * a store that hydrates on gateway connect.
 */

export interface SlashCommand {
  name: string;
  description: string;
  /** Optional argument hint shown in the menu, e.g. "<model>" or "on|off" */
  argHint?: string;
}

/**
 * Static list of OpenClaw native slash commands supported in ClawWork sessions.
 * Derived from ~/git/openclaw/src/tui/commands.ts and the gateway NativeCommandSpec list.
 *
 * PLACEHOLDER: replace/extend with dynamic gateway commands when available.
 */
export const STATIC_SLASH_COMMANDS: SlashCommand[] = [
  // ── Session / Agent control ─────────────────────────────────────────────────
  { name: 'new',      description: 'Reset the session',            argHint: undefined },
  { name: 'reset',    description: 'Reset the session',            argHint: undefined },
  { name: 'abort',    description: 'Abort the active run',         argHint: undefined },
  { name: 'agent',    description: 'Switch agent (or open picker)', argHint: '<id>' },
  { name: 'agents',   description: 'Open agent picker',            argHint: undefined },
  { name: 'session',  description: 'Switch session (or open picker)', argHint: '<key>' },
  { name: 'sessions', description: 'Open session picker',          argHint: undefined },

  // ── Model / Quality ─────────────────────────────────────────────────────────
  { name: 'model',    description: 'Set model (or open picker)',   argHint: '<provider/model>' },
  { name: 'models',   description: 'Open model picker',            argHint: undefined },
  { name: 'think',    description: 'Set thinking level',           argHint: 'off|low|medium|high' },
  { name: 'fast',     description: 'Set fast mode',                argHint: 'status|on|off' },
  { name: 'verbose',  description: 'Set verbose on/off',           argHint: 'on|off' },
  { name: 'reasoning',description: 'Set reasoning on/off',         argHint: 'on|off' },
  { name: 'usage',    description: 'Toggle per-response usage line', argHint: 'off|tokens|full' },

  // ── Access / Security ───────────────────────────────────────────────────────
  { name: 'elevated', description: 'Set elevated permission level', argHint: 'on|off|ask|full' },
  { name: 'elev',     description: 'Alias for /elevated',          argHint: 'on|off|ask|full' },
  { name: 'activation', description: 'Set group activation mode', argHint: 'mention|always' },

  // ── Info / Help ─────────────────────────────────────────────────────────────
  { name: 'help',     description: 'Show slash command help',      argHint: undefined },
  { name: 'status',   description: 'Show gateway status summary',  argHint: undefined },
  { name: 'settings', description: 'Open settings',                argHint: undefined },
];

/**
 * Filter slash commands by the text the user has typed after the `/`.
 * Returns all commands when query is empty (bare "/" input).
 */
export function filterSlashCommands(
  query: string,
  commands: SlashCommand[] = STATIC_SLASH_COMMANDS,
): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return commands;
  return commands.filter((cmd) => cmd.name.startsWith(q));
}

/**
 * Parse the textarea value to determine if slash-command autocomplete should show.
 *
 * Rules:
 * - The cursor must be on the *first* line.
 * - The line must start with `/`.
 * - There must be no whitespace-separated second token yet (i.e. we haven't
 *   entered the argument phase).
 *
 * Returns `{ active: true, query }` or `{ active: false }`.
 */
export function parseSlashQuery(value: string, selectionStart: number): { active: false } | { active: true; query: string } {
  // Only consider text up to cursor
  const before = value.slice(0, selectionStart);
  // Must be on the first line (no newlines before cursor)
  if (before.includes('\n')) return { active: false };
  if (!before.startsWith('/')) return { active: false };
  const afterSlash = before.slice(1);
  // If there's already a space in the command name, we're in arg territory
  if (afterSlash.includes(' ')) return { active: false };
  return { active: true, query: afterSlash };
}
