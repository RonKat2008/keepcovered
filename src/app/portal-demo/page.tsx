import type { Metadata } from "next";
import { DemoPortal } from "@/components/portal-demo/DemoPortal";

export const metadata: Metadata = {
  title: "Demo county portal (not a real government site)",
  robots: { index: false, follow: false },
};

export default function PortalDemoPage() {
  return <DemoPortal />;
}
