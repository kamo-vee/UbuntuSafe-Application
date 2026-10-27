import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
export const scanKindEnum = pgEnum("scan_kind", [
  "message",
  "voice",
  "email",
  "link",
  "job",
]);
export const scanStatusEnum = pgEnum("scan_status", [
  "safe",
  "warning",
  "danger",
]);
export const reportCategoryEnum = pgEnum("report_category", [
  "scam",
  "unsafe-job",
  "suspicious-link",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "received",
  "reviewing",
]);

const syncColumns = {
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deviceId: text("device_id"),
};

export const ubuntuUsers = pgTable("ubuntu_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  surname: text("surname").notNull().default(""),
  dateOfBirth: text("date_of_birth"),
  lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
  email: text("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  emailVerificationRequired: boolean("email_verification_required").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(0),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  language: text("language").notNull().default("English"),
  biometricsEnabled: text("biometrics_enabled").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  ...syncColumns,
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => ubuntuUsers.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

export const revokedAuthTokens = pgTable(
  "revoked_auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("revoked_auth_tokens_expiry_idx").on(table.expiresAt)],
);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  userId: uuid("user_id").primaryKey().references(() => ubuntuUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => ubuntuUsers.id)
      .notNull(),
    kind: scanKindEnum("kind").notNull(),
    content: text("content").notNull(),
    status: scanStatusEnum("status").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...syncColumns,
  },
  (table) => [
    index("scans_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => ubuntuUsers.id)
      .notNull(),
    category: reportCategoryEnum("category").notNull(),
    details: text("details").notNull(),
    status: reportStatusEnum("status").notNull().default("received"),
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...syncColumns,
  },
  (table) => [
    index("reports_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const communityFeedback = pgTable("community_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => ubuntuUsers.id).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  ...syncColumns,
});

export type Scan = typeof scans.$inferSelect;
export type CommunityReport = typeof communityReports.$inferSelect;
