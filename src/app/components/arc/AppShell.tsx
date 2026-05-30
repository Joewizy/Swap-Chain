"use client";

// AppShell.tsx — sidebar shell + screen switcher
//
// The sidebar's account chip is wired to wagmi: when a wallet is connected
// the chip shows the real address + chain (and opens the disconnect menu);
// when none is connected it becomes a Connect button that opens the
// RainbowKit modal. The Send → Status flow passes the connected address
// through to StatusScreen, which uses it as the CCTP mint recipient.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { Icon } from "./icons";
import { SendScreen, StatusScreen, type Intent } from "./SendScreen";
import { HistoryScreen, RecipientsScreen, SettingsScreen } from "./AppScreens";
import { IS_TESTNET } from "@/config/network";

type View = "send" | "history" | "recipients" | "settings";

export default function AppShell() {
  const router = useRouter();
  const onBack = () => router.push("/");

  const [view, setView] = useState<View>("send");
  const [recentIntent, setRecentIntent] = useState<Intent | null>(null);
  const [showStatus, setShowStatus] = useState(false);

  // jump to status pane when a send is confirmed
  const submit = (intent: Intent) => {
    setRecentIntent(intent);
    setShowStatus(true);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "232px 1fr",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <Sidebar
        view={view}
        setView={(v) => {
          setShowStatus(false);
          setView(v);
        }}
        onBack={onBack}
      />
      <main
        style={{
          padding: "28px clamp(20px, 3vw, 44px) 64px",
          maxWidth: 1100,
          width: "100%",
        }}
      >
        {view === "send" &&
          (showStatus ? (
            <StatusScreen
              intent={recentIntent}
              onDone={() => setShowStatus(false)}
            />
          ) : (
            <SendScreen onSubmit={submit} />
          ))}
        {view === "history" && <HistoryScreen />}
        {view === "recipients" && <RecipientsScreen />}
        {view === "settings" && <SettingsScreen />}
      </main>
    </div>
  );
}

function Sidebar({
  view,
  setView,
  onBack,
}: {
  view: View;
  setView: (v: View) => void;
  onBack: () => void;
}) {
  const items: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: "send", label: "Send", icon: <Icon.Send /> },
    { id: "history", label: "History", icon: <Icon.History /> },
    { id: "recipients", label: "Recipients", icon: <Icon.Book /> },
    { id: "settings", label: "Settings", icon: <Icon.Settings /> },
  ];
  return (
    <aside
      style={{
        borderRight: "1px solid var(--line)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "sticky",
        top: 0,
        height: "100vh",
        background: "var(--bg)",
      }}
    >
      <button
        onClick={onBack}
        className="row center gap-2"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--fg)",
          padding: "6px 4px",
          fontSize: 14,
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        <Icon.Logo size={20} /> <span>Swap Chain</span>
      </button>

      <AccountChip />

      <div className="col gap-1">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            className="row center gap-3"
            style={{
              background: view === it.id ? "var(--bg-soft)" : "transparent",
              border: 0,
              padding: "9px 12px",
              borderRadius: 10,
              color: view === it.id ? "var(--fg)" : "var(--fg-soft)",
              fontSize: 14,
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: view === it.id ? 500 : 400,
            }}
          >
            {it.icon} {it.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Network mode chip — reads from NEXT_PUBLIC_NETWORK */}
      <div className="card row center between" style={{ padding: "10px 12px" }}>
        <span
          className="row center gap-2"
          style={{ fontSize: 12, color: "var(--fg-soft)" }}
        >
          <Icon.Globe size={12} /> {IS_TESTNET ? "Testnet" : "Mainnet"}
        </span>
      </div>

      <button
        onClick={onBack}
        className="btn btn-quiet btn-sm"
        style={{ justifyContent: "flex-start" }}
      >
        <Icon.Arrow rotate={180} size={12} /> Back to site
      </button>
    </aside>
  );
}

function AccountChip() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => openConnectModal?.()}
        className="card row center between"
        style={{
          padding: "10px 12px",
          marginBottom: 8,
          cursor: "pointer",
          border: "1px solid var(--line)",
        }}
      >
        <span className="row center gap-2" style={{ fontSize: 13 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "var(--bg-sunk)",
              border: "1px dashed var(--line-2)",
            }}
          />
          <span style={{ color: "var(--fg-soft)" }}>Connect wallet</span>
        </span>
        <Icon.ArrowRight size={11} />
      </button>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const chainLabel = chain?.name ?? "Unknown network";

  return (
    <div
      className="card row center between"
      style={{ padding: "10px 12px", marginBottom: 8 }}
    >
      <button
        onClick={() => openAccountModal?.()}
        className="row center gap-2"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
          flex: 1,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
        <div className="col" style={{ lineHeight: 1.2 }}>
          <span
            className="font-mono"
            style={{ fontSize: 11.5, color: "var(--fg)" }}
          >
            {short}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10, color: "var(--fg-mute)" }}
          >
            {chainLabel} · connected
          </span>
        </div>
      </button>
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        style={{
          background: "transparent",
          border: 0,
          padding: 4,
          cursor: "pointer",
          color: "var(--fg-mute)",
        }}
      >
        <Icon.ChevDown size={11} />
      </button>
    </div>
  );
}
