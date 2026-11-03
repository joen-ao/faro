import { MetaPixel } from "@/components/tracking/meta-pixel";

export default function DiagnosticLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MetaPixel />
    </>
  );
}
