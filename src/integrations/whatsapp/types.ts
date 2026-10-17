import type { CsvResult } from "@/integrations/dapta/types";

export type WhatsappMode = "dapta_csv";

/** One company phone ready for a Dapta WhatsApp sequence. Never a personal mobile. */
export interface WhatsappRow {
  leadId: string;
  slug: string;
  company: string;
  /** E.164, company contact point. */
  phone: string;
  diagnosticUrl: string;
  optOutUrl: string;
  isDemo: boolean;
}

export interface WhatsappAdapter {
  readonly mode: WhatsappMode;
  readonly enabled: boolean;
  readonly isMock: boolean;
  exportCsv(rows: WhatsappRow[]): CsvResult;
}

export const WHATSAPP_CSV_HEADER = ["empresa", "telefono", "plantilla", "url_diagnostico", "enlace_baja", "slug"] as const;

/** Template with variables Dapta fills from the other columns. Identifies the sender and offers opt-out. */
export const WHATSAPP_TEMPLATE =
  "Hola, somos Faro (30X Hackathon). Preparamos un diagnóstico gratuito para {{empresa}}: {{url_diagnostico}} . Si no quieres más mensajes responde BAJA o entra a {{enlace_baja}}";

export const E164 = /^\+[1-9]\d{7,14}$/;
