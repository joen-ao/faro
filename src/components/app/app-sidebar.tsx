"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppShellData, RecentHunt } from "@/features/app-shell/data";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-faro-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0B]";
const KEY = "faro.sidebar.collapsed";

/* Collapsed rail preference: localStorage behind try/catch (private windows, blocked storage). */
const listeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  memo = v;
  listeners.forEach((l) => l());
}
let memo: boolean | null = null;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => (memo ??= readCollapsed());
const getServerSnapshot = () => false;

/** Hidden on the login and on the full-screen live map (it has its own back button). */
export const isShellHidden = (path: string) => path === "/app/login" || /^\/app\/hunts\/[^/]+$/.test(path);

const HUNT_STATUS: Record<string, { label: string; dot: string }> = {
  pending: { label: "En cola", dot: "bg-faro-text-3" },
  running: { label: "Buscando", dot: "bg-faro-warn" },
  paused: { label: "En pausa", dot: "bg-faro-text-3" },
  completed: { label: "Terminada", dot: "bg-faro-accent" },
  failed: { label: "Con error", dot: "bg-faro-danger" },
};

interface Item {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge?: { text: string; accent?: boolean } | null;
}

function NavItem({ it, collapsed, onNavigate }: { it: Item; collapsed: boolean; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={it.href}
        onClick={onNavigate}
        aria-current={it.active ? "page" : undefined}
        title={collapsed ? it.label : undefined}
        className={cn(
          "relative flex h-12 items-center gap-3 rounded-[10px] px-2.5 text-[15px] transition-colors lg:h-10 lg:text-sm",
          FOCUS,
          it.active ? "bg-faro-surface-2 text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        {it.active && <span aria-hidden className="absolute -left-3.5 top-2.5 h-5 w-[3px] rounded-r-[3px] bg-faro-accent max-lg:top-3.5" />}
        <Icon name={it.icon} className={cn("shrink-0", it.active && "text-faro-accent")} />
        <span className={cn("min-w-0 truncate", collapsed && "lg:sr-only")}>{it.label}</span>
        {it.badge && (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-px text-xs tabular-nums",
              it.badge.accent ? "bg-faro-accent/[0.14] text-faro-accent" : "bg-faro-surface-2 text-faro-text-3",
              it.active && !it.badge.accent && "bg-faro-surface-3 text-white",
              collapsed && "lg:hidden",
            )}
          >
            {it.badge.text}
          </span>
        )}
      </Link>
    </li>
  );
}

function Group({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      {/* #8A8A8F on #0A0A0B keeps AA for the small uppercase label (the design's #6F6F73 falls short). */}
      <p className={cn("mb-1.5 px-2.5 text-[11px] uppercase tracking-[0.16em] text-[#8A8A8F]", collapsed && "lg:sr-only")}>{label}</p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Recent({ h, collapsed, onNavigate }: { h: RecentHunt; collapsed: boolean; onNavigate: () => void }) {
  const st = HUNT_STATUS[h.status] ?? { label: h.status, dot: "bg-faro-text-3" };
  return (
    <li className={cn(collapsed && "lg:hidden")}>
      <Link
        href={`/app/hunts/${h.id}`}
        onClick={onNavigate}
        className={cn("flex min-h-12 items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-white/75 hover:bg-white/[0.04] hover:text-white lg:min-h-10", FOCUS)}
      >
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", st.dot)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{h.title}</span>
          <span className="block truncate text-xs text-faro-text-3">
            <span className="sr-only">{st.label} · </span>
            {[h.city, `${h.fit} del perfil`].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
    </li>
  );
}

function SendCard({ send, collapsed }: { send: AppShellData["send"]; collapsed: boolean }) {
  const title = send.enabled ? "Envío real activo" : "Envío simulado";
  const windowText = `Ventana ${send.open ? "abierta" : "cerrada"} · ${send.hours ?? "hoy no se envía"}`;
  return (
    <Link
      href="/app/settings/envio"
      title={collapsed ? `${title}. ${windowText}` : undefined}
      className={cn(
        "block rounded-xl border bg-[#141416] p-3.5",
        send.enabled ? "border-faro-accent/25" : "border-white/[0.12]",
        FOCUS,
        collapsed && "lg:grid lg:place-items-center lg:p-3",
      )}
      data-testid="send-status"
    >
      <span className={cn("flex items-center gap-2 text-[13px] font-bold", send.enabled ? "text-faro-accent" : "text-white")}>
        <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", send.open ? "bg-faro-accent shadow-[0_0_0_4px_rgba(203,232,80,0.18)]" : "bg-faro-text-3")} />
        <span className={cn(collapsed && "lg:sr-only")}>{title}</span>
      </span>
      <span className={cn("mt-1.5 block text-xs leading-snug text-faro-text-3", collapsed && "lg:sr-only")}>{windowText}</span>
    </Link>
  );
}

export function AppShell({ data, children }: { data: AppShellData; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The drawer belongs to the path it was opened on: navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const asideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpenAt(null);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !asideRef.current) return;
      const focusable = [...asideRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !asideRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !asideRef.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (isShellHidden(path)) return <>{children}</>;

  const onNavigate = () => setOpenAt(null);
  const isOutreach = /^\/app\/hunts\/[^/]+\/outreach/.test(path);
  const queued = data.queued;
  const prospect: Item[] = [
    { href: "/app/dashboard", label: "Tablero", icon: "board", active: path.startsWith("/app/dashboard") },
    {
      href: "/app/hunts",
      label: "Búsquedas",
      icon: "search",
      active: path === "/app/hunts",
      badge: data.huntCount !== null ? { text: String(data.huntCount) } : null,
    },
    {
      href: data.contactHref,
      label: "Contacto",
      icon: "mail",
      active: isOutreach,
      badge: queued ? { text: `${queued} en cola`, accent: true } : null,
    },
  ];
  const settings: Item[] = [
    { href: "/app/settings/envio", label: "Horario de envío", icon: "clock", active: path.startsWith("/app/settings/envio") },
    { href: "/app/settings/ads", label: "Pauta", icon: "megaphone", active: path.startsWith("/app/settings/ads") },
    { href: "/app/settings/oferta", label: "Tu oferta", icon: "check", active: path.startsWith("/app/settings/oferta") },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.08] bg-black/90 px-4 backdrop-blur lg:hidden">
        <button
          ref={toggleRef}
          type="button"
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpenAt(path)}
          className={cn("-ml-2.5 grid size-11 place-items-center rounded-[10px] text-white", FOCUS)}
        >
          <Icon name="menu" size={22} strokeWidth={2} />
        </button>
        <Link href="/app/dashboard" className={cn("flex items-center gap-2 rounded-sm font-display font-semibold text-white", FOCUS)}>
          <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
          Faro
        </Link>
        <Link
          href="/app/new"
          aria-label="Nueva búsqueda"
          className={cn("grid size-10 place-items-center rounded-[10px] bg-faro-accent text-faro-accent-ink hover:brightness-110", FOCUS)}
        >
          <Icon name="plus" size={20} strokeWidth={2.4} />
        </Link>
      </header>

      {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpenAt(null)} data-testid="app-sidebar-overlay" />}

      <aside
        id="app-sidebar"
        ref={asideRef}
        aria-label="Barra lateral"
        data-testid="app-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-[#0A0A0B] px-3.5 py-[18px] shadow-[30px_0_60px_rgba(0,0,0,0.6)] transition-[transform,visibility,width] duration-200 motion-reduce:transition-none",
          "lg:visible lg:max-w-none lg:translate-x-0 lg:border-white/[0.08] lg:py-5 lg:shadow-none",
          collapsed ? "lg:w-[72px]" : "lg:w-[264px]",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className={cn("flex items-center justify-between px-1.5 lg:px-2 lg:pt-1", collapsed && "lg:flex-col lg:gap-3 lg:px-0")}>
          <Link
            href="/app/dashboard"
            onClick={onNavigate}
            aria-label={collapsed ? "Faro, ir al tablero" : undefined}
            className={cn("flex items-center gap-2.5 rounded-sm font-display text-[19px] font-semibold tracking-[-0.02em] text-white", FOCUS)}
          >
            <span aria-hidden className="size-[11px] rounded-full bg-faro-accent shadow-[0_0_0_5px_rgba(203,232,80,0.14)]" />
            <span className={cn(collapsed && "lg:hidden")}>Faro</span>
          </Link>
          <button
            type="button"
            onClick={() => writeCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            className={cn("hidden size-8 place-items-center rounded-lg border border-white/10 text-faro-text-3 hover:text-white lg:grid", FOCUS)}
          >
            <Icon name="panel" size={16} strokeWidth={2} />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Cerrar menú"
            className={cn("grid size-10 place-items-center rounded-[10px] border border-white/[0.12] text-white lg:hidden", FOCUS)}
          >
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>

        <Link
          href="/app/new"
          onClick={onNavigate}
          aria-current={path.startsWith("/app/new") ? "page" : undefined}
          title={collapsed ? "Nueva búsqueda" : undefined}
          className={cn(
            "mt-[18px] flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-faro-accent text-sm font-bold text-faro-accent-ink hover:brightness-110 lg:h-11",
            FOCUS,
          )}
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
          <span className={cn(collapsed && "lg:sr-only")}>Nueva búsqueda</span>
        </Link>

        <nav aria-label="Panel" className="mt-[22px]">
          <Group label="Prospección" collapsed={collapsed}>
            {prospect.map((it) => (
              <NavItem key={it.label} it={it} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </Group>
          {data.recent.length > 0 && (
            <div className={cn(collapsed && "lg:hidden")}>
              <Group label="Recientes" collapsed={collapsed}>
                {data.recent.map((h) => (
                  <Recent key={h.id} h={h} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </Group>
            </div>
          )}
          <Group label="Configuración" collapsed={collapsed}>
            {settings.map((it) => (
              <NavItem key={it.label} it={it} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </Group>
        </nav>

        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          <SendCard send={data.send} collapsed={collapsed} />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              title={collapsed ? "Salir" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2.5 text-[13px] text-faro-text-3 hover:bg-white/[0.04] hover:text-white",
                FOCUS,
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              <Icon name="logout" size={18} className="shrink-0" />
              <span className={cn(collapsed && "lg:sr-only")}>Salir</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={cn("min-w-0 transition-[padding] duration-200 motion-reduce:transition-none", collapsed ? "lg:pl-[72px]" : "lg:pl-[264px]")}>{children}</div>
    </>
  );
}
