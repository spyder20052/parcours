import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./tracker.css";

export const metadata: Metadata = {
  title: "Parcours",
  description: "Suivre ses candidatures : échéances, pièces, échanges et documents, dans un espace privé.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "light dark" };

// Applique le thème avant le premier affichage pour éviter un flash clair en mode sombre.
const THEME = `(function(){var t="auto";try{t=localStorage.getItem("parcours-theme")||"auto"}catch(e){}var d=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
