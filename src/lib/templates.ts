// Modèles disponibles au premier lancement. Pour en ajouter un : déposer un JSON dans templates/ et l'importer ici.
import eiffel from "../../templates/eiffel-2027-master.json";
import vide from "../../templates/vide.json";
import { TemplateSchema, type Template } from "./template";

export const TEMPLATES: Record<string, Template> = Object.fromEntries([eiffel, vide].map((t) => { const p = TemplateSchema.parse(t); return [p.id, p]; }));
export const TEMPLATE_LIST = Object.values(TEMPLATES).map((t) => ({ id: t.id, name: t.name, description: t.description }));
