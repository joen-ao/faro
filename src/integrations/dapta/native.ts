/**
 * Dapta's native "post-conversation analysis" webhook does not use Faro's field names, and its exact shape is not
 * documented. This maps it, tolerantly, onto Faro's webhook payload: it looks for the conversation id and the
 * contact's phone/email anywhere in the body (max depth 4) and reads the analysis variables configured on the agent
 * ("calificado", "pidio_baja", "resumen").
 */

type Flat = Map<string, unknown>;

/** Flow Studio forwards object params typed as "Text" as JSON strings; open them so nested fields are searchable. */
function maybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!(s.startsWith("{") || s.startsWith("[")) || s.length > 200_000) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

function flatten(raw: unknown, out: Flat = new Map(), prefix = "", depth = 0): Flat {
  const value = maybeJson(raw);
  if (depth > 6 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.slice(0, 50).forEach((v, i) => flatten(v, out, `${prefix}[${i}]`, depth + 1));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const parsed = maybeJson(v);
      if (parsed !== null && typeof parsed === "object") flatten(parsed, out, path, depth + 1);
      else out.set(path, parsed);
    }
    return out;
  }
  out.set(prefix, value);
  return out;
}

const leafKey = (path: string) => path.replace(/\[\d+\]/g, "").split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "");

/** First value whose leaf key is in `keys` (normalised: lowercase, no separators), in body order. */
function pick(flat: Flat, keys: string[], accept: (v: unknown) => boolean = () => true): unknown {
  for (const want of keys) {
    for (const [path, v] of flat) if (leafKey(path) === want && accept(v)) return v;
  }
  return undefined;
}

const isPhone = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "").length >= 7 : false;
const isEmail = (v: unknown) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isId = (v: unknown) => (typeof v === "string" && v.trim().length > 0 && v.length <= 200) || typeof v === "number";

export function toBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "si", "sí", "yes", "1", "verdadero"].includes(s)) return true;
    if (["false", "no", "0", "falso"].includes(s)) return false;
  }
  return undefined;
}

export interface NativeMapping {
  conversation_id?: string;
  phone?: string;
  email?: string;
  qualified?: boolean;
  opt_out?: boolean;
  summary?: string;
}

export function normalizeDaptaNative(body: unknown): NativeMapping {
  const flat = flatten(body);
  let conv = pick(flat, ["conversationid", "sessionid", "chatid", "threadid", "conversation", "callid"], isId);
  if (conv === undefined) {
    // Nested form: { conversation: { id } }, { session: { id } }, ...
    for (const [path, v] of flat) {
      const parts = path.replace(/\[\d+\]/g, "").toLowerCase().split(".");
      if (parts.at(-1) === "id" && ["conversation", "session", "chat", "thread", "call"].includes(parts.at(-2) ?? "") && isId(v)) {
        conv = v;
        break;
      }
    }
  }
  const topId = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).id : undefined;
  // Only the contact's side: never "to"/"to_number", which is Faro's own WhatsApp line.
  const phone = pick(
    flat,
    ["phone", "phonenumber", "contactphone", "customerphone", "userphone", "fromnumber", "customernumber", "contactnumber", "whatsapp", "waid", "from", "number", "telefono"],
    isPhone,
  );
  const email = pick(flat, ["email", "contactemail", "useremail", "correo"], isEmail);
  const summary = pick(flat, ["resumen", "summary"], (v) => typeof v === "string" && v.trim().length > 0);
  return {
    conversation_id: conv !== undefined ? String(conv) : isId(topId) ? String(topId) : undefined,
    phone: phone !== undefined ? String(phone) : undefined,
    email: typeof email === "string" ? email.trim().toLowerCase() : undefined,
    qualified: toBool(pick(flat, ["calificado", "qualified"], (v) => toBool(v) !== undefined)),
    opt_out: toBool(pick(flat, ["pidiobaja", "optout"], (v) => toBool(v) !== undefined)),
    summary: typeof summary === "string" ? summary.trim().slice(0, 4000) : undefined,
  };
}

/** Key paths only (never values) so the payload shape can be debugged from logs without leaking contact data. */
export function payloadShape(body: unknown): string[] {
  return [...flatten(body).keys()].slice(0, 80);
}
