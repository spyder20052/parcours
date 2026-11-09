// Crée le bucket privé et sa règle CORS (envoi direct depuis le navigateur par URL signée).
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const Bucket = process.env.S3_BUCKET ?? "parcours-documents";
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
});
const origin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

try { await s3.send(new HeadBucketCommand({ Bucket })); console.log(`Bucket ${Bucket} présent.`); }
catch { await s3.send(new CreateBucketCommand({ Bucket })); console.log(`Bucket ${Bucket} créé.`); }
await s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [origin], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["content-type", "range"], ExposeHeaders: ["content-length", "content-range", "accept-ranges"], MaxAgeSeconds: 3600 }] } }));
console.log(`CORS limité à ${origin}.`);
