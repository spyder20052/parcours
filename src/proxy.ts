import { NextResponse, type NextRequest } from "next/server";

/** Origine des URL signées du stockage (R2 en production, SeaweedFS en local). */
function storageOrigin() {
  const ep = process.env.S3_ENDPOINT;
  if (!ep) return "";
  const u = new URL(ep);
  if (process.env.S3_FORCE_PATH_STYLE === "true") return u.origin;
  return `${u.protocol}//${process.env.S3_BUCKET ?? "parcours-documents"}.${u.host}`;
}

/**
 * En-têtes de sécurité de chaque page : CSP avec nonce (aucun script en ligne sans nonce),
 * interdiction d'être affiché dans un cadre, HSTS, et politique de référent stricte.
 * Les styles en ligne restent permis : le moteur de suivi positionne ses nœuds par attributs style,
 * et toute valeur qu'il insère passe par esc().
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const s3 = storageOrigin();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${s3}`,
    "font-src 'self'",
    `connect-src 'self' ${s3}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ").replace(/\s{2,}/g, " ");

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!dev) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|fonts/|pdf.worker.min.mjs).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
