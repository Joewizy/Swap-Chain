import LandingPage from "./LandingPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landing Page",
  description: "Welcome to SwapChain",
};

export default function Page() {
  return <LandingPage />;
}
