import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const k = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY doit faire 32 octets en base64");
  return k;
}

/** AES-256-GCM. Format : v1.iv.tag.données, en base64url. `aad` lie le secret à son propriétaire. */
export function encrypt(plain: string, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(box: string, aad: string) {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1") throw new Error("format inconnu");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
