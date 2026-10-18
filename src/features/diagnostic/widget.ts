/**
 * Dapta text-agent widget (https://widget-v2.dapta.ai/agent.min.js), opened on load.
 *
 * What the script supports (read from agent.min.js on 2026-10-17): it parses the query string of its own
 * <script src>: `agentId`, `env`, `autoOpen`, `mode=embedded` + `container=<element id>`. In embedded mode it
 * renders the chat inline inside the container, already open (`dapta-embedded--open`). It also exposes
 * `window.toggleDaptaWidgetChat()`. We use embedded mode + autoOpen, and a watchdog that opens the chat with
 * the global toggle if it is still closed, or shows a fallback message if the widget never renders.
 */

export const DAPTA_CONTAINER_ID = "faro-dapta";
const SCRIPT_RE = /<script\b[^>]*\bsrc\s*=\s*["'](https:\/\/widget-v2\.dapta\.ai\/agent(?:\.min|_min)?\.js\?[^"']*)["'][^>]*>\s*<\/script>/i;

/** Returns the widget script URL with embedded mode + autoOpen, or null when the snippet is not the Dapta script. */
export function openOnLoadSrc(snippet: string): string | null {
  const m = SCRIPT_RE.exec(snippet);
  if (!m) return null;
  let url: URL;
  try {
    url = new URL(m[1]!.replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  if (!url.searchParams.get("agentId")) return null;
  url.searchParams.set("mode", "embedded");
  url.searchParams.set("container", DAPTA_CONTAINER_ID);
  url.searchParams.set("autoOpen", "true");
  return url.toString();
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Watchdog: open the chat if it rendered closed; show a message if nothing rendered after `timeoutMs`. */
function watchdog(timeoutMs: number): string {
  return `<script>(function(){var t0=Date.now(),tried=false;var iv=setInterval(function(){var c=document.getElementById("chatbot");
if(c){var open=c.classList.contains("dapta-embedded--open")||c.classList.contains("dapta-chatbot--open");
if(open){clearInterval(iv);document.documentElement.setAttribute("data-dapta","open");return;}
if(!tried&&Date.now()-t0>2500&&typeof window.toggleDaptaWidgetChat==="function"){tried=true;try{window.toggleDaptaWidgetChat();}catch(e){}}}
if(Date.now()-t0>${timeoutMs}){clearInterval(iv);if(!c){document.documentElement.setAttribute("data-dapta","failed");var f=document.getElementById("faro-fallback");if(f)f.hidden=false;}}},400);})();</script>`;
}

const FALLBACK = `<div id="faro-fallback" hidden style="display:flex;min-height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;font:15px/1.5 system-ui,sans-serif;color:rgba(255,255,255,.75)"><p style="margin:0;max-width:30ch">El chat no pudo cargar en este momento. Escríbanos por WhatsApp con el botón de arriba y le respondemos ahí.</p></div>`;

/**
 * srcdoc for the sandboxed iframe. The snippet only ever comes from env (DAPTA_WIDGET_SNIPPET), never from source data.
 * Unknown snippets are embedded as-is with the same watchdog.
 */
export function buildWidgetDoc(snippet: string, timeoutMs = 15000): string {
  const src = openOnLoadSrc(snippet);
  const body = src
    ? `<div id="${DAPTA_CONTAINER_ID}" style="height:100%"></div><script src="${escAttr(src)}"></script>`
    : snippet;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif}#faro-fallback[hidden]{display:none!important}</style></head><body>${FALLBACK}${body}${watchdog(timeoutMs)}</body></html>`;
}
