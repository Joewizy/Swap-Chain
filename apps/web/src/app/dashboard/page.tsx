import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Railglide — Dashboard",
  // Admin-only analytics: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardClient />
    </Suspense>
  );
}
