import Image from "next/image";
import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Landing Page",
  description: "Welcome to SwapChain",
};

export default function LandingPage() {
  return (
    <main className="bg-[url('https://ik.imagekit.io/Ochoja01/bg.png?updatedAt=1755582280091')] bg-center bg-fixed bg-cover bg-no-repeat text-white min-h-screen flex flex-col items-center pt-10">
      {/* Logo */}
      <Image src="/logo2.png" alt="Logo" width={200} height={200} priority />

      <div className="mt-[10%] text-center">
      {/* Title */}
      <h1 className={`${bebasNeue.className} text-7xl font-bold uppercase mt-6`}>
        Welcome to SwapChain
      </h1>

      {/* Subtitle */}
      <p className="mt-4 text-xl text-center">
        Powered by AI-driven insights for smarter swaps. <br />
        Swap, send, and receive crypto with intelligence and speed.
      </p>

      <button className="px-8 py-3 text-primary-110 hover:text-white bg-white hover:bg-primary-110 rounded-full cursor-pointer hover:border-white hover:border mt-6">Connect Wallet to begin</button>
      </div>

    </main>
  );
}
