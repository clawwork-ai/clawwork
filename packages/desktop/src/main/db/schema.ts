import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  sessionKey: text('session_key').notNull(),
  sessionId: text('session_id').notNull().default(''),
  title: text('title').notNull().default(''),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  tags: text('tags').notNull().default('[]'),
  artifactDir: text('artifact_dir').notNull().default(''),
  gatewayId: text('gateway_id').notNull().default(''),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: text('timestamp').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  messageId: text('message_id').notNull().references(() => messages.id),
  type: text('type').notNull().default('file'),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  localPath: text('local_path').notNull(),
  mimeType: text('mime_type').notNull().default(''),
  size: integer('size').notNull().default(0),
  gitSha: text('git_sha').notNull().default(''),
  createdAt: text('created_at').notNull(),
});
