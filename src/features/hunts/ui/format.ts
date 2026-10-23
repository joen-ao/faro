import { cityLabel } from "@/features/icp/presets";
import type { PointStatus } from "../types";

export const SOURCE_LABEL: Record<string, string> = {
  osm: "OpenStreetMap",
  rues: "RUES",
  reps: "REPS",
  secop: "SECOP II",
  rnt: "RNT",
  solidaria: "Supersolidaria",
  google_places: "Google Places",
  website: "Sitio web",
  meta_ads: "Pauta",
  sample: "Muestra",
};

export const SOURCE_SHORT: Record<string, string> = { osm: "OSM", rues: "RUES", reps: "REPS", secop: "SECOP", rnt: "RNT", solidaria: "Solidaria", google_places: "Places", website: "Web", meta_ads: "Pauta", sample: "Muestra" };

export const STATUS_LABEL: Record<PointStatus, string> = {
  found: "Encontrada",
  fit: "Del perfil",
  contacted: "Contactada",
  qualified: "Calificada",
};

/** Dot colours shared by map legend, list and filters (SPEC §10 view 3). */
export const STATUS_COLOR: Record<PointStatus, string> = {
  found: "#8a8a8f",
  fit: "#cbe850",
  contacted: "#ffffff",
  qualified: "#cbe850",
};

/** Stored criteria keep their ASCII ids (scoring matches on them); the UI shows them with Spanish accents. */
const ACCENT_FIXES: Array<[RegExp, string]> = [
  [/\bgenerico\b/gi, "genérico"],
  [/\bjuridica\b/gi, "jurídica"],
  [/\bSenales\b/g, "Señales"],
  [/\blinea\b/g, "línea"],
];
export function accentCopy(text: string): string {
  return ACCENT_FIXES.reduce((acc, [re, to]) => acc.replace(re, (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to)), text);
}

const nf = new Intl.NumberFormat("es-CO");
export const fmtInt = (n: number) => nf.format(Math.round(n));

export function fmtUsd(n: number): string {
  if (n === 0) return "US$ 0,00";
  if (Math.abs(n) < 0.01) return `US$ ${n.toFixed(4).replace(".", ",")}`;
  return `US$ ${n.toFixed(2).replace(".", ",")}`;
}

export function fmtClock(iso: string | number | Date): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function fmtDate(iso: string | number | Date): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export const REASON_LABEL: Record<string, string> = {
  nit: "Mismo NIT",
  "name+distance": "Nombre y cercanía",
  "name+domain": "Nombre y sitio web",
  "name+phone": "Nombre y teléfono",
};

export const EVENT_LABEL: Record<string, string> = {
  sent: "Mensaje enviado",
  delivered: "Entregado",
  click: "Abrió el enlace",
  reply: "Respondió",
  widget_open: "Abrió el asistente",
  widget_chat: "Conversó con el asistente",
  form_submit: "Envió el formulario",
  qualified: "Calificada",
  disqualified: "Descalificada",
  opt_out: "Pidió la baja",
};

export const COST_LABEL: Record<string, string> = {
  data: "Datos",
  ai: "Inteligencia artificial",
  scraping: "Extracción web",
  email: "Correo",
  whatsapp: "WhatsApp",
  dapta: "Dapta",
  ads: "Pauta",
  human: "Tiempo humano",
};

/** Presets store ASCII city names; show them with their accents. */
export const prettyCity = (c: string): string => cityLabel(c);
