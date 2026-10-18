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

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-faro-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black";

/** Hidden on the login and on the full-screen live map (it has its own back button). */
export function AppNav() {
  const path = usePathname() ?? "";
  if (path === "/app/login" || /^\/app\/hunts\/[^/]+$/.test(path)) return null;
  return (
    <nav aria-label="Panel" className="border-b border-white/10 bg-black/90 sm:sticky sm:top-0 sm:z-40 sm:backdrop-blur" data-testid="app-nav">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-1 px-4 sm:px-6">
        <Link href="/app/dashboard" className={cn("flex shrink-0 items-center gap-2 rounded-sm py-3.5 font-display font-semibold text-white", FOCUS)}>
          <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
          Faro
        </Link>
        <form action="/api/auth/logout" method="post" className="order-2 ml-auto sm:order-3 sm:ml-0">
          <button type="submit" className={cn("min-h-11 rounded-sm px-1 text-[13px] text-faro-text-3 hover:text-white", FOCUS)}>
            Salir
          </button>
        </form>
        <ul className="order-3 -mx-2.5 flex w-full flex-wrap gap-1 text-sm sm:order-2 sm:mx-0 sm:w-auto sm:flex-1">
          {ITEMS.map((it) => {
            const active = path === it.href || (it.href === "/app/hunts" && path.startsWith("/app/hunts/"));
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center border-b-2 px-2.5 pt-0.5 transition-colors",
                    FOCUS,
                    active ? "border-faro-accent text-white" : "border-transparent text-faro-text-2 hover:text-white",
                  )}
                >
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
