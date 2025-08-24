"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard/transfer", label: "Transfer", icon: "ri:token-swap-fill" },
    { href: "/dashboard/history", label: "Transaction History", icon: "material-symbols:history" },
    { href: "/dashboard/wallet", label: "Wallet", icon: "solar:wallet-outline" },
    { href: "/dashboard/support", label: "Support", icon: "material-symbols:contact-support-outline" },
  ];

  return (
    <nav className="p-4 w-64 bg-white text-primary-110 h-screen border-r border-r-primary-20 fixed top-0 left-0">
      {/* Logo + collapse */}
      <div className="flex justify-between items-center mb-6">
        <Image src="/logo.png" alt="Logo" width={150} height={150} priority />
        <div
          className="text-2xl cursor-pointer iconify iconify--cuida"
          data-icon="cuida:sidebar-collapse-outline"
        />
      </div>

      {/* Nav links */}
      <div className="flex flex-col justify-center gap-2 mt-4">
        {links.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl transition ${
                isActive
                  ? "bg-primary-110 text-white font-medium"
                  : "bg-none hover:bg-primary-110 hover:text-white"
              }`}
            >
              <div 
                className="text-2xl iconify" 
                data-icon={icon}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
