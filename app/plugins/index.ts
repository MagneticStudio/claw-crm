import type { Express } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Contact } from "@shared/schema";

/**
 * Plugin interface for Claw CRM.
 *
 * Each plugin can:
 * - Define Drizzle schema tables (auto-migrated via db:push)
 * - Register Express API routes
 * - Register MCP tools
 * - Register rule condition types
 * - Enrich contacts with additional data
 */
export interface ItemType {
  /** Type name, e.g. "task", "meeting", "deadline" */
  name: string;
  /** Display icon (emoji), e.g. "📅" */
  icon: string;
  /** Slash commands that create this type, e.g. ["/mtg", "/meeting"] */
  slashCommands: string[];
  /** Whether the item shows a checkbox and can be completed */
  completable: boolean;
  /** Whether the item has a time field */
  hasTime: boolean;
  /** Whether the item has a location field */
  hasLocation: boolean;
}

export interface CrmPlugin {
  /** Unique plugin name */
  name: string;

  /** Register Express routes. Called during server startup. */
  registerRoutes?: (app: Express, ctx: PluginContext) => void;

  /** Register MCP tools. Called when creating an MCP server instance. */
  registerTools?: (server: McpServer, ctx: PluginContext) => void;

  /** Enrich a contact with plugin-specific data. Returns extra fields to merge. */
  enrichContact?: (contactId: number, ctx: PluginContext) => Promise<Record<string, unknown>>;

  /** Register rule condition evaluators. */
  ruleConditions?: Record<string, RuleConditionEvaluator>;

  /** Register new item types (tasks, meetings, etc.) */
  itemTypes?: ItemType[];

  /** Guide text appended to get_crm_guide output. */
  guideText?: string;
}

export interface PluginContext {
  /** Database instance (Drizzle) */
  db: any;
  /** SSE broadcast */
  broadcast: (data: Record<string, unknown>) => void;
  /** Activity logger */
  logActivity: (event: string, detail: string, opts?: { contactId?: number; source?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  /** Auth middleware */
  requireAuth: any;
}

export type RuleConditionEvaluator = (
  params: Record<string, any>,
  contact: Contact,
  pluginData: Record<string, unknown>
) => boolean;

// Plugin registry
const plugins: CrmPlugin[] = [];

export function registerPlugin(plugin: CrmPlugin): void {
  plugins.push(plugin);
  console.log(`Plugin registered: ${plugin.name}`);
}

export function getPlugins(): CrmPlugin[] {
  return plugins;
}

export function getItemTypes(): ItemType[] {
  const builtIn: ItemType[] = [
    { name: "task", icon: "□", slashCommands: ["/fu", "/f", "/follow", "/followup", "/todo", "/task"], completable: true, hasTime: false, hasLocation: false },
  ];
  for (const plugin of plugins) {
    if (plugin.itemTypes) builtIn.push(...plugin.itemTypes);
  }
  return builtIn;
}
