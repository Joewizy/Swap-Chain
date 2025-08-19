// app/components/Navigation.tsx
import Link from "next/link";

export default function Nav() {
  return (
    <nav className="p-4 bg-white text-primary-110">
      <div></div>
      <div>      
        <Link href="/transfer">Transfer</Link>
        <Link href="/history">Transaction History</Link>
        <Link href="/wallet">Wallet</Link>
        <Link href="/support">Support</Link>
      </div>
      <div></div>

    </nav>
  );
}
