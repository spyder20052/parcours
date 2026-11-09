import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = () => process.env.S3_BUCKET ?? "parcours-documents";
let client: S3Client | null = null;

function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      // Pas de somme de contrôle ajoutée aux URL signées : le navigateur ne la calcule pas, et R2 la refuse.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    });
  }
  return client;
}

export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const MAX_BYTES = 15 * 1024 * 1024;
export const URL_TTL = 300;

export async function uploadUrl(key: string, mime: string, size: number) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime, ContentLength: size }), { expiresIn: URL_TTL });
}

export async function downloadUrl(key: string, filename: string, mime: string) {
  const safe = filename.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120) || "document";
  return getSignedUrl(s3(), new GetObjectCommand({
    Bucket: bucket(), Key: key, ResponseContentType: mime,
    ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(safe)}`,
  }), { expiresIn: URL_TTL });
}

export async function headObject(key: string) {
  const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return { size: r.ContentLength ?? 0, type: r.ContentType ?? "" };
}

/** Lit les premiers octets pour vérifier la nature réelle du fichier. */
export async function readHead(key: string, n = 16): Promise<Uint8Array> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${n - 1}` }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

/** Contenu complet d'un objet (pièce jointe d'un courriel, 15 Mo au plus). */
export async function readObject(key: string): Promise<Uint8Array> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

export async function putObject(key: string, body: Uint8Array, mime: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: mime }));
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function sniff(head: Uint8Array): string | null {
  const s = (i: number, b: number[]) => b.every((x, j) => head[i + j] === x);
  if (s(0, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (s(0, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (s(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}
