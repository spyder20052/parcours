import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { systemDb } from "./db";
import * as schema from "./schema";
import { sendMail, magicLinkMail } from "./mail";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
  : {};

/** Un compte ne peut être créé que pour l'administrateur ou une invitation valide. */
async function isInvited(email: string) {
  const e = email.trim().toLowerCase();
  if (e === (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()) return true;
  const rows = await systemDb.select({ id: schema.invitation.id }).from(schema.invitation).where(and(
    sql`lower(${schema.invitation.email}) = ${e}`, isNull(schema.invitation.usedAt), isNull(schema.invitation.revokedAt), gt(schema.invitation.expiresAt, new Date()),
  )).limit(1);
  return rows.length > 0;
}

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [appUrl],
  database: drizzleAdapter(systemDb, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit },
  }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
      disabledAt: { type: "date", required: false, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24, freshAge: 60 * 15 },
  socialProviders: google,
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: { "/sign-in/magic-link": { window: 600, max: 4 }, "/magic-link/verify": { window: 600, max: 10 }, "/sign-in/social": { window: 60, max: 10 } },
  },
  advanced: {
    useSecureCookies: appUrl.startsWith("https://"),
    cookiePrefix: "parcours",
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        // Pas d'e-mail pour une adresse non invitée, sans le révéler à l'appelant.
        const known = (await systemDb.select({ id: schema.user.id }).from(schema.user).where(sql`lower(${schema.user.email}) = ${email.trim().toLowerCase()}`).limit(1)).length > 0;
        if (!known && !(await isInvited(email))) return;
        await sendMail(magicLinkMail(email, url));
      },
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await isInvited(user.email))) return false;
          const admin = user.email.trim().toLowerCase() === (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
          return { data: { ...user, role: admin ? "admin" : "user" } };
        },
        after: async (user) => {
          await systemDb.update(schema.invitation).set({ usedAt: new Date() })
            .where(and(sql`lower(${schema.invitation.email}) = ${user.email.trim().toLowerCase()}`, isNull(schema.invitation.usedAt)));
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const u = await systemDb.select({ disabledAt: schema.user.disabledAt }).from(schema.user).where(eq(schema.user.id, session.userId)).limit(1);
          if (!u.length || u[0].disabledAt) return false;
        },
      },
    },
  },
});
