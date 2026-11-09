// Description Drizzle des tables créées par db/migrations. Le SQL reste la source de vérité.
import { pgTable, text, boolean, timestamp, uuid, integer, jsonb, date, bigint, bigserial } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Authentification (noms attendus par Better Auth)
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: text("role").notNull().default("user"),
  disabledAt: ts("disabled_at"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const invitation = pgTable("invitation", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  invitedBy: text("invited_by"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Données de chaque utilisateur (RLS)
export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  template: text("template"),
  config: jsonb("config").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const application = pgTable("application", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  university: text("university").notNull(),
  program: text("program").notNull(),
  longTitle: text("long_title").notNull().default(""),
  tier: text("tier").notNull().default("prio"),
  variant: text("variant").notNull().default(""),
  stage: text("stage").notNull().default("prepare"),
  conditions: text("conditions").notNull().default(""),
  channel: text("channel").notNull().default(""),
  procedureUrl: text("procedure_url").notNull().default(""),
  programUrl: text("program_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  formText: text("form_text").notNull().default(""),
  position: integer("position").notNull().default(0),
});

export const step = pgTable("step", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  applicationId: uuid("application_id").notNull(),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("depot"),
  dueDate: date("due_date"),
  isTarget: boolean("is_target").notNull().default(false),
  note: text("note").notNull().default(""),
  how: jsonb("how"),
  doneAt: ts("done_at"),
  position: integer("position").notNull().default(0),
});

export const task = pgTable("task", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  applicationId: uuid("application_id"),
  track: text("track"),
  label: text("label").notNull(),
  dueDate: date("due_date"),
  how: jsonb("how"),
  doneAt: ts("done_at"),
  position: integer("position").notNull().default(0),
});

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  applicationId: uuid("application_id"),
  folder: text("folder").notNull().default("divers"),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  tag: text("tag").notNull().default(""),
  objectKey: text("object_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256"),
  sensitive: boolean("sensitive").notNull().default(false),
  warning: text("warning").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const piece = pgTable("piece", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("attendue"),
  who: text("who").notNull().default(""),
  note: text("note").notNull().default(""),
  link: text("link").notNull().default(""),
  how: jsonb("how"),
  documentId: uuid("document_id"),
  position: integer("position").notNull().default(0),
});

export const thread = pgTable("thread", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  applicationId: uuid("application_id"),
  title: text("title").notNull(),
  recipient: text("recipient").notNull().default(""),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  kind: text("kind").notNull().default("premier_contact"),
  sentAt: date("sent_at"),
  position: integer("position").notNull().default(0),
  attachmentIds: uuid("attachment_ids").array().notNull().default([]),
  mailConversationId: text("mail_conversation_id"),
});

export const threadMessage = pgTable("thread_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  threadId: uuid("thread_id").notNull(),
  direction: text("direction").notNull().default("in"),
  rawText: text("raw_text").notNull(),
  receivedOn: date("received_on").notNull(),
  externalId: text("external_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const aiSetting = pgTable("ai_setting", {
  ownerId: text("owner_id").primaryKey(),
  encryptedKey: text("encrypted_key"),
  model: text("model").notNull().default("claude-opus-5-5"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- Outlook (voir db/migrations/0004_outlook.sql)
export const mailConnection = pgTable("mail_connection", {
  ownerId: text("owner_id").primaryKey(),
  provider: text("provider").notNull().default("microsoft"),
  accountEmail: text("account_email").notNull(),
  encryptedTokens: text("encrypted_tokens").notNull(),
  accessExpiresAt: ts("access_expires_at").notNull(),
  lastSyncAt: ts("last_sync_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Sans RLS ni donnée personnelle : relie un abonnement Graph à son propriétaire. Rôle propriétaire uniquement. */
export const mailSubscription = pgTable("mail_subscription", {
  subscriptionId: text("subscription_id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  clientStateHash: text("client_state_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export const aiChange = pgTable("ai_change", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  prompt: text("prompt").notNull(),
  summary: text("summary").notNull().default(""),
  operations: jsonb("operations").notNull(),
  inverse: jsonb("inverse"),
  appliedAt: ts("applied_at"),
  revertedAt: ts("reverted_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: text("owner_id"),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});
