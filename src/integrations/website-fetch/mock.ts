import { extractPage, mergeExtractions } from "./extract";
import type { SiteFetchResult, WebsiteFetchAdapter } from "./types";

/** Synthetic page for demo companies (fictional). Output is always `isMock: true`. */
export function mockHtml(host: string): string {
  const domain = host.replace(/^www\./, "");
  return `<html><head><title>Clínica Demo</title><meta name="description" content="Clínica dental demo en Bogotá con ortodoncia e implantes."></head>
<body><h1>Sonrisas Demo</h1><p>Odontología general, ortodoncia e implantes en Bogotá.</p>
<a href="mailto:info@${domain}">info@${domain}</a> <a href="tel:+576015550101">601 555 0101</a>
<a href="https://wa.me/573105550102">WhatsApp</a><a href="https://www.instagram.com/demo">IG</a>
<form action="/contacto"><input type="email" name="correo"><textarea name="mensaje"></textarea></form>
<footer>© 2021 Sonrisas Demo</footer></body></html>`;
}

export function createMockWebsiteFetch(): WebsiteFetchAdapter {
  return {
    allows: async () => true,
    async fetchSite(url: string): Promise<SiteFetchResult> {
      let host = "demo.example.com";
      try {
        host = new URL(/^[a-z]+:/i.test(url) ? url : `https://${url}`).hostname;
      } catch {
        /* keep default */
      }
      const pageUrl = `https://${host}/`;
      return {
        url,
        pages: [{ url: pageUrl, status: 200, truncated: false }],
        skipped: [],
        extraction: mergeExtractions([extractPage(mockHtml(host), pageUrl)]),
        requests: 0,
        latencyMs: 0,
        isMock: true,
      };
    },
  };
}
