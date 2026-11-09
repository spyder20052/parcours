// Règles d'envoi et de rattachement des courriels (src/lib/mail.ts), sans réseau ni base.
import { describe, expect, it } from "vitest";
import { attachmentName, matchThread, normSubject, parseRecipients, type MatchThread } from "@/lib/mail";

describe("destinataires", () => {
  it("sépare destinataires et copie", () => {
    expect(parseRecipients("dischler@unistra.fr ; copie dri-bourses@unistra.fr")).toEqual({ to: ["dischler@unistra.fr"], cc: ["dri-bourses@unistra.fr"] });
    expect(parseRecipients("A@X.fr, b@y.fr")).toEqual({ to: ["a@x.fr", "b@y.fr"], cc: [] });
  });
  it("ignore le texte sans adresse et les doublons", () => {
    expect(parseRecipients("M. Ghislain GANDJONON")).toEqual({ to: [], cc: [] });
    expect(parseRecipients("a@x.fr ; copie a@x.fr")).toEqual({ to: ["a@x.fr"], cc: [] });
  });
  it("prend la première copie comme destinataire s'il n'y en a pas d'autre", () => {
    expect(parseRecipients("copie b@y.fr, c@z.fr")).toEqual({ to: ["b@y.fr"], cc: ["c@z.fr"] });
  });
});

describe("rattachement d'une réponse", () => {
  const th = (o: Partial<MatchThread>): MatchThread => ({ id: "t", recipient: "", subject: "", sentAt: "2026-11-04", mailConversationId: null, ...o });
  const threads = [
    th({ id: "stras", recipient: "dischler@unistra.fr ; copie dri-bourses@unistra.fr", subject: "Bourse Eiffel 2027 : question sur le M2 du parcours Image et 3D", mailConversationId: "conv-s" }),
    th({ id: "rouen", recipient: "candidature.eiffel@univ-rouen.fr", subject: "Bourse Eiffel 2027 : éligibilité du parcours SIME", sentAt: "2026-11-03" }),
    th({ id: "brouillon", recipient: "x@lyon2.fr", subject: "Bourse Eiffel 2027", sentAt: null }),
  ];
  const mail = (o: Partial<{ conversationId: string; from: string; subject: string; receivedOn: string }>) => ({ conversationId: "", from: "", subject: "", receivedOn: "2026-11-05", ...o });

  it("par la conversation Outlook", () => expect(matchThread(threads, mail({ conversationId: "conv-s", from: "inconnu@ailleurs.org" }))).toBe("stras"));
  it("par l'expéditeur, destinataire de l'échange", () => expect(matchThread(threads, mail({ from: "Candidature.Eiffel@univ-rouen.fr", subject: "Bonjour" }))).toBe("rouen"));
  it("par le domaine et l'objet repris (ticket)", () => {
    expect(matchThread(threads, mail({ from: "rt@rt-dri.unistra.fr", subject: "[rt-dri.unistra.fr #146567] Bourse Eiffel 2027 : question sur le M2 du parcours Image et 3D" }))).toBe("stras");
  });
  it("ignore un courriel sans rapport", () => expect(matchThread(threads, mail({ from: "promo@boutique.com", subject: "Soldes" }))).toBeNull());
  it("ignore un échange pas encore envoyé", () => expect(matchThread(threads, mail({ from: "x@lyon2.fr" }))).toBeNull());
  it("ignore un courriel reçu avant l'envoi", () => expect(matchThread(threads, mail({ from: "candidature.eiffel@univ-rouen.fr", receivedOn: "2026-11-01" }))).toBeNull());
  it("un objet trop court ne suffit pas", () => {
    expect(matchThread([th({ id: "a", recipient: "a@univ.fr", subject: "Question" })], mail({ from: "b@univ.fr", subject: "Re: Question" }))).toBeNull();
  });
});

describe("objet et nom de fichier", () => {
  it("retire les préfixes et le ticket", () => expect(normSubject("RE : TR: [rt-dri.unistra.fr #146567] Bourse  Eiffel")).toBe("bourse eiffel"));
  it("nomme les pièces jointes sans caractère dangereux", () => {
    expect(attachmentName("Projet / Toulouse", "application/pdf")).toBe("Projet _ Toulouse.pdf");
    expect(attachmentName("CV.pdf", "application/pdf")).toBe("CV.pdf");
  });
});
