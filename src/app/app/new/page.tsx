import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AccessDenied } from "@/features/hunts/ui/access-denied";
import { NewProfile } from "@/features/hunts/ui/new-profile";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo perfil · Faro", robots: { index: false } };

export default async function NewProfilePage() {
  const jar = await cookies();
  if (requireAppAccess(new Request("http://faro.local/app/new", { headers: { cookie: jar.toString() } }))) return <AccessDenied />;
  return <NewProfile />;
}
