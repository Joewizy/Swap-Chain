import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "../components/arc/AppShell";

export const metadata: Metadata = {
  title: "Swap Chain — Send",
};

export default function AppPage() {
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
