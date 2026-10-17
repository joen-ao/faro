import type { Metadata } from "next";
import { NewProfile } from "@/features/hunts/ui/new-profile";

export const metadata: Metadata = { title: "Nuevo perfil · Faro" };

export default function NewProfilePage() {
  return <NewProfile />;
}
