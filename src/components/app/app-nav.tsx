"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/dashboard", label: "Tablero" },
  { href: "/app/hunts", label: "Búsquedas" },
  { href: "/app/new", label: "Nueva búsqueda" },
  { href: "/app/settings/envio", label: "Horario de envío" },
  { href: "/app/settings/ads", label: "Pauta" },
];

/** Hidden on the login and on the full-screen live map (it has its own back button). */
export function AppNav() {
  const path = usePathname() ?? "";
  if (path === "/app/login" || /^\/app\/hunts\/[^/]+$/.test(path)) return null;
  return (
    <nav aria-label="Panel" className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur" data-testid="app-nav">
      <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 sm:px-8">
        <Link href="/app/dashboard" className="flex shrink-0 items-center gap-2 py-3 font-display text-sm font-semibold text-white">
          <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" /> Faro
        </Link>
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {ITEMS.map((it) => {
            const active = path === it.href || (it.href === "/app/hunts" && path.startsWith("/app/hunts/"));
            return (
              <li key={it.href} className="shrink-0">
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-12 items-center border-b-2 px-2.5 text-sm transition-colors",
                    active ? "border-faro-accent text-white" : "border-transparent text-faro-text-2 hover:text-white",
                  )}
                >
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <form action="/api/auth/logout" method="post" className="shrink-0">
          <button type="submit" className="text-xs text-faro-text-3 hover:text-white">
            Salir
          </button>
        </form>
      </div>
    </nav>
  );
}
