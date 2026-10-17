import { describe, expect, it, vi } from "vitest";
import { createRealWebsiteFetch, createMockWebsiteFetch, getWebsiteFetch, parseRobots, isPathAllowed, userAgent } from "@/integrations/website-fetch";
import { extractPage, mergeExtractions, removeTeamBlocks, truncateBytes, findContactLinks } from "@/integrations/website-fetch/extract";
import { parseEnv } from "@/lib/env";

const PUBLIC = async () => ["93.184.216.34"];

const HOME = `<!doctype html><html><head><title>Clínica Dental Norte</title><meta name="description" content="Ortodoncia e implantes en Bogotá">
<style>.x{color:red}</style><script>var a="info@script.com"</script></head><body>
<nav><a href="/contacto">Contacto</a> <a href="https://www.instagram.com/clinica">IG</a> <a href="https://wix.com">wix</a></nav>
<h1>Clínica Dental Norte</h1><p>Agenda tu cita en línea. Ortodoncia, implantes y blanqueamiento.</p>
<p>Escríbenos a info [at] clinicanorte [dot] com o citas@clinicanorte.com</p>
<p>Camila: camila.perez@clinicanorte.com · drgomez@clinicanorte.com</p>
<a href="mailto:citas@clinicanorte.com?subject=Hola">Citas</a>
<a href="tel:+57 601 555 0123">Llamar</a> <p>Cel 310 555 0199</p>
<a href="https://wa.me/573105550199?text=hola">WhatsApp</a>
<div class="equipo-medico"><div class="doc">Dr. Andrés Gómez Rojas, ortodoncista</div><p>Trabaja con pacientes desde 1999</p></div>
<p>Atiende el Dr. Carlos Ruiz los lunes.</p>
<footer>&copy; 2019 - 2023 Clínica Dental Norte</footer></body></html>`;

const CONTACT = `<html><body><h2>Contáctanos</h2>
<form action="/enviar" method="post"><input type="text" name="nombre"><input type="email" name="correo"><textarea name="mensaje"></textarea><button>Enviar</button></form>
</body></html>`;

type Route = { status?: number; body?: string; headers?: Record<string, string>; delayForever?: boolean };

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (r.delayForever) {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...r.headers } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const make = (routes: Record<string, Route>, extra: Record<string, unknown> = {}) => {
  const f = fakeFetch(routes);
  const adapter = createRealWebsiteFetch({ fetchImpl: f.fn, resolve: PUBLIC, minIntervalMs: 0, appUrl: "https://faro.test", ...extra });
  return { adapter, ...f };
};

describe("robots.txt", () => {
  it("picks the Faro group over *, longest match wins, Allow wins ties", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: Faro\nDisallow: /privado\nAllow: /privado/publico\nCrawl-delay: 2\n");
    expect(isPathAllowed(rules, "/")).toBe(true);
    expect(isPathAllowed(rules, "/privado/x")).toBe(false);
    expect(isPathAllowed(rules, "/privado/publico/a")).toBe(true);
    expect(rules.crawlDelay).toBe(2);
  });
  it("falls back to * and supports wildcards and $", () => {
    const rules = parseRobots("# c\nUser-agent: *\nDisallow: /*.pdf$\nDisallow: /admin\nDisallow:\n");
    expect(isPathAllowed(rules, "/a/b.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/a/b.pdfx")).toBe(true);
    expect(isPathAllowed(rules, "/admin/x")).toBe(false);
    expect(isPathAllowed(rules, "/contacto")).toBe(true);
  });
  it("empty robots allows everything", () => {
    expect(isPathAllowed(parseRobots(""), "/anything")).toBe(true);
  });
});

describe("extraction", () => {
  const page = extractPage(HOME, "https://clinica.test/");
  const emails = page.contacts.filter((c) => c.type === "email").map((c) => c.value);

  it("keeps generic emails (mailto, text, [at] obfuscation) and discards personal ones", () => {
    expect(emails.sort()).toEqual(["citas@clinicanorte.com", "info@clinicanorte.com"]);
    expect(emails.join()).not.toMatch(/camila|gomez|script/);
    expect(page.discardedPersonalEmails).toBe(2);
  });
  it("extracts E.164 phones and WhatsApp as data", () => {
    const phones = page.contacts.filter((c) => c.type === "phone").map((c) => c.value);
    expect(phones).toEqual(expect.arrayContaining(["+576015550123", "+573105550199"]));
    expect(page.contacts.find((c) => c.type === "whatsapp")).toMatchObject({ value: "+573105550199", isGeneric: false });
  });
  it("detects signals: booking, social (not wix), copyright year", () => {
    expect(page.onlineBooking).toBe(true);
    expect(page.socialNetworks).toEqual(["instagram"]);
    expect(page.copyrightYear).toBe(2023);
  });
  it("websiteText has no team block or personal names/emails and fits 8 KB", () => {
    expect(page.text).toContain("Ortodoncia");
    expect(page.text).not.toMatch(/Andrés|Gómez|Carlos Ruiz|camila|drgomez|equipo-medico|Trabaja con pacientes/);
    expect(page.text).toContain("[profesional]");
    expect(Buffer.byteLength(mergeExtractions([page]).websiteText)).toBeLessThanOrEqual(8192);
  });
  it("detects a contact form with email + message and no form elsewhere", () => {
    const c = extractPage(CONTACT, "https://clinica.test/contacto");
    expect(c.hasContactForm).toBe(true);
    expect(c.contacts.find((x) => x.type === "web_form")).toMatchObject({ value: "https://clinica.test/contacto", evidenceUrl: "https://clinica.test/contacto", isGeneric: true });
    const login = extractPage('<form><input type="email"><input type="password"><textarea></textarea></form>', "https://x.test/");
    expect(login.hasContactForm).toBe(false);
    const search = extractPage('<form class="search"><input name="q"></form>', "https://x.test/");
    expect(search.contacts).toHaveLength(0);
  });
  it("merges: noAppointmentForm only when no booking and no forms; dedupes", () => {
    const plain = mergeExtractions([extractPage("<p>Hola info@a.com</p>", "https://a.test/"), extractPage("<p>info@a.com</p>", "https://a.test/c")]);
    expect(plain.contacts).toHaveLength(1);
    expect(plain.signals.noAppointmentForm).toBe(true);
    expect(mergeExtractions([page]).signals.noAppointmentForm).toBe(false);
  });
  it("utilities", () => {
    expect(truncateBytes("ñ".repeat(10), 5)).toBe("ññ");
    expect(removeTeamBlocks('<div class="our-team"><div>x</div></div>ok')).toContain("ok");
    expect(removeTeamBlocks('<div class="our-team"><div>x')).not.toMatch(/our-team/);
    const links = findContactLinks('<a href="/contact-us">x</a><a href="https://otro.com/contacto">y</a><a href="/a">Contáctenos</a>', new URL("https://clinica.test/"));
    expect(links).toEqual(["https://clinica.test/contact-us", "https://clinica.test/a"]);
  });
});

describe("real website fetch", () => {
  const base = { "https://clinica.test/robots.txt": { body: "User-agent: *\nDisallow: /privado\n" } };

  it("fetches home + contact page, sends the identified User-Agent, GET only", async () => {
    const { adapter, fn, calls } = make({ ...base, "https://clinica.test/": { body: HOME }, "https://clinica.test/contacto": { body: CONTACT } });
    const r = await adapter.fetchSite("clinica.test");
    expect(r.isMock).toBe(false);
    expect(r.pages.map((p) => p.url)).toEqual(["https://clinica.test/", "https://clinica.test/contacto"]);
    expect(r.extraction.contacts.map((c) => c.type)).toEqual(expect.arrayContaining(["email", "phone", "web_form", "whatsapp"]));
    expect(calls).toContain("https://clinica.test/robots.txt");
    for (const call of (fn as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toMatchObject({ method: "GET", redirect: "manual", headers: { "User-Agent": "Faro-30XHackathon/0.1 (+https://faro.test)" } });
    }
    expect(r.requests).toBe(4); // robots + home + /contacto + /contact (404)
  });

  it("respects robots.txt Disallow (page is never requested)", async () => {
    const { adapter, calls } = make({
      "https://clinica.test/robots.txt": { body: "User-agent: Faro\nDisallow: /contacto\n" },
      "https://clinica.test/": { body: HOME },
      "https://clinica.test/contacto": { body: CONTACT },
      "https://clinica.test/contact": { body: CONTACT },
    });
    const r = await adapter.fetchSite("https://clinica.test/");
    expect(calls).not.toContain("https://clinica.test/contacto");
    expect(r.skipped).toContainEqual({ url: "https://clinica.test/contacto", reason: "robots_disallow" });
    expect(r.pages.map((p) => p.url)).toContain("https://clinica.test/contact");
  });

  it("Disallow: / on the home page fetches nothing else", async () => {
    const { adapter, calls } = make({ "https://clinica.test/robots.txt": { body: "User-agent: *\nDisallow: /\n" }, "https://clinica.test/": { body: HOME } });
    const r = await adapter.fetchSite("https://clinica.test/");
    expect(calls).toEqual(["https://clinica.test/robots.txt"]);
    expect(r.error).toBe("robots_disallow");
    expect(r.pages).toHaveLength(0);
    expect(r.extraction.signals.noAppointmentForm).toBe(false);
  });

  it("robots 404 allows crawling; robots 500 or network failure blocks it", async () => {
    const ok = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { body: HOME } });
    expect((await ok.adapter.fetchSite("https://clinica.test/")).pages).toHaveLength(1);
    const bad = make({ "https://clinica.test/robots.txt": { status: 503 }, "https://clinica.test/": { body: HOME } });
    expect((await bad.adapter.fetchSite("https://clinica.test/")).error).toBe("robots_disallow");
    const down = createRealWebsiteFetch({ fetchImpl: (async () => { throw new Error("boom"); }) as unknown as typeof fetch, resolve: PUBLIC, minIntervalMs: 0 });
    expect((await down.fetchSite("https://clinica.test/")).error).toBe("robots_disallow");
  });

  it("caches robots.txt per domain", async () => {
    const { adapter, calls } = make({ ...base, "https://clinica.test/": { body: HOME } });
    await adapter.fetchSite("https://clinica.test/");
    await adapter.fetchSite("https://clinica.test/");
    expect(calls.filter((c) => c.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("allows() checks robots only", async () => {
    const { adapter } = make({ ...base });
    expect(await adapter.allows("https://clinica.test/")).toBe(true);
    expect(await adapter.allows("https://clinica.test/privado/x")).toBe(false);
    expect(await adapter.allows("http://127.0.0.1/")).toBe(false);
  });

  it("blocks SSRF targets before any request", async () => {
    for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost:3000/", "http://[::1]/", "ftp://clinica.test/", "http://10.0.0.5/"]) {
      const { adapter, fn } = make({});
      const r = await adapter.fetchSite(url);
      expect(r.error, url).toMatch(/^unsafe_url/);
      expect(fn, url).not.toHaveBeenCalled();
    }
  });

  it("blocks hostnames that resolve to private IPs (DNS)", async () => {
    const { adapter, fn } = make({}, { resolve: async () => ["10.1.2.3"] });
    expect((await adapter.fetchSite("https://rebind.test/")).error).toMatch(/unsafe_url/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("blocks a redirect to a private IP and to cloud metadata", async () => {
    for (const target of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/"]) {
      const { adapter, calls } = make({
        "https://clinica.test/robots.txt": { status: 404 },
        "https://clinica.test/": { status: 302, headers: { location: target } },
      });
      const r = await adapter.fetchSite("https://clinica.test/");
      expect(r.error).toMatch(/unsafe_url/);
      expect(calls).not.toContain(target);
    }
  });

  it("follows safe redirects (http -> https) and stops at the limit", async () => {
    const { adapter } = make({
      "http://clinica.test/robots.txt": { status: 404 },
      "http://clinica.test/": { status: 301, headers: { location: "https://clinica.test/" } },
      "https://clinica.test/robots.txt": { status: 404 },
      "https://clinica.test/": { body: HOME },
    });
    expect((await adapter.fetchSite("http://clinica.test/")).pages[0]!.url).toBe("https://clinica.test/");
    const loop = make({ "https://loop.test/robots.txt": { status: 404 }, "https://loop.test/": { status: 302, headers: { location: "https://loop.test/" } } });
    expect((await loop.adapter.fetchSite("https://loop.test/")).error).toBe("too_many_redirects");
  });

  it("truncates bodies over the maximum size", async () => {
    const big = "<html><body>" + "a".repeat(5000) + " info@clinica.test</body></html>";
    const { adapter } = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { body: big } }, { maxBytes: 1000 });
    const r = await adapter.fetchSite("https://clinica.test/");
    expect(r.pages[0]!.truncated).toBe(true);
    expect(r.extraction.contacts.filter((c) => c.type === "email")).toHaveLength(0);
  });

  it("times out slow servers", async () => {
    const { adapter } = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { delayForever: true } }, { timeoutMs: 30 });
    const r = await adapter.fetchSite("https://clinica.test/");
    expect(r.error).toBe("timeout");
  });

  it("skips non-HTML and error statuses", async () => {
    const pdf = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { body: "%PDF", headers: { "content-type": "application/pdf" } } });
    expect((await pdf.adapter.fetchSite("https://clinica.test/")).error).toBe("not_html");
    const gone = make({ "https://clinica.test/robots.txt": { status: 404 }, "https://clinica.test/": { status: 500 } });
    expect((await gone.adapter.fetchSite("https://clinica.test/")).error).toBe("http_500");
  });

  it("rate limits requests to the same domain", async () => {
    const sleep = vi.fn(async () => undefined);
    let t = 0;
    const { adapter } = make({ ...base, "https://clinica.test/": { body: "<p>x</p>" } }, { minIntervalMs: 1000, sleep, now: () => t });
    await adapter.fetchSite("https://clinica.test/");
    expect(sleep).toHaveBeenCalled();
    expect(sleep.mock.calls[0]![0]).toBe(1000);
    t = 5000;
  });

  it("decodes latin-1 pages", async () => {
    const latin = new Response(new Uint8Array(Buffer.from("<html><body>Odontología info@clinica.test</body></html>", "latin1")), { status: 200, headers: { "content-type": "text/html; charset=iso-8859-1" } });
    const f = vi.fn(async (u: string | URL | Request) => (String(u).endsWith("robots.txt") ? new Response("", { status: 404 }) : latin)) as unknown as typeof fetch;
    const r = await createRealWebsiteFetch({ fetchImpl: f, resolve: PUBLIC, minIntervalMs: 0 }).fetchSite("https://clinica.test/");
    expect(r.extraction.websiteText).toContain("Odontología");
  });
});

describe("mock and factory", () => {
  it("mock is flagged and deterministic", async () => {
    const r = await createMockWebsiteFetch().fetchSite("https://www.demo-clinica.example.com");
    expect(r.isMock).toBe(true);
    expect(r.extraction.contacts.map((c) => c.value)).toContain("info@demo-clinica.example.com");
    expect(await createMockWebsiteFetch().allows("x")).toBe(true);
  });
  it("factory honours WEBSITE_FETCH_MODE=mock and builds the identified UA", async () => {
    const env = parseEnv({});
    expect((await getWebsiteFetch(env, {}, "mock").fetchSite("x.test")).isMock).toBe(true);
    expect(getWebsiteFetch(env, {}, undefined)).toBeDefined();
    expect(userAgent()).toBe("Faro-30XHackathon/0.1 (+http://localhost:3000)");
  });
});
