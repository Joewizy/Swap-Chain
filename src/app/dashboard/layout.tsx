import Link from 'next/link';
import type { Metadata } from 'next';
import Nav from '../components/Navigation';
import { StarknetProvider } from "../components/starknet-provider";

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StarknetProvider>
      <div className='flex min-h-screen bg-[#f9f9f9]'>
        {/* Sidebar */}
        <Nav />

        {/* Main content */}
        <main className='flex-1 ml-64 relative'>{children}</main>
      </div>
    </StarknetProvider>
  );
}
