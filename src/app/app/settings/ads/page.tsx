import { redirect } from "next/navigation";

/** F35 · Pauta moved to /app/ads; old links and emails keep working. */
export default function LegacyAdsSettings() {
  redirect("/app/ads");
}
