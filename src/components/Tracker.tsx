"use client";
import { useEffect } from "react";
import type { WorkspaceData } from "@/lib/model";
import { mount } from "@/tracker/engine";

/** Coque statique : le moteur (src/tracker) remplit ces zones et gère les interactions. */
export default function Tracker({ data }: { data: WorkspaceData }) {
  useEffect(() => mount(data), [data]);
  return (
    <>
      <div className="app">
        <nav className="rail" id="rail" aria-label="Navigation" />
        <main className="main">
          <section className="alarm" id="alarm" aria-label="Échéance urgente" hidden />
          <header className="top" id="top" />
          <div className="stage" id="stage" />
        </main>
      </div>
      <dialog id="drawer" className="drawer" aria-label="Détail de la candidature" />
      <dialog id="preview" className="preview" aria-label="Aperçu du document" />
      <dialog id="dlg" className="dialog-c" />
      <dialog id="assistant" className="drawer assistant" aria-label="Assistant" />
      <dialog id="pal" className="palette" aria-label="Recherche">
        <input id="pal-in" placeholder="Chercher une université, un document, un échange" aria-label="Chercher" />
        <div id="pal-r" className="pal-r" role="listbox" />
      </dialog>
      <div id="toast" className="toast" role="status" aria-live="polite" />
      <canvas id="confetti" aria-hidden="true" />
    </>
  );
}
