"use client";

// AppShell.tsx — responsive shell + screen switcher
//
// Mobile-first: below ~860px the sidebar collapses into a hamburger drawer
// and the main column goes full-width; at desktop widths the sidebar is
// sticky. The Send experience starts at the Home goal chooser, which routes
// into the existing Send flow (per-goal guided flows land in Phase 2). The
// account chip is wired to wagmi; the connected address flows through to
// StatusScreen as the CCTP mint recipient.

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { Icon } from "./icons";
import { SendScreen, StatusScreen, type Intent } from "./SendScreen";
import { Home, type FlowId } from "./Home";
import { SwapForm } from "./SwapForm";
import { CashoutFlow } from "./flows/CashoutFlow";
import { BuyFlow } from "./flows/BuyFlow";
import {
  HistoryScreen,
  RecipientsScreen,
  SettingsScreen,
  type Order,
} from "./AppScreens";
import {
  DEFAULT_SETTLEMENT_CHAIN_ID,
  IS_TESTNET,
  getChain,
  type TokenSymbol,
} from "@/config/network";
import { chainIdFromPaycrestSlug } from "@/rails/paycrest";
import { formatFiat, titleCase } from "@/utils";

type View = "send" | "history" | "recipients" | "settings";

/** Reconstructs a minimal Intent from a History order so StatusScreen can
 *  adopt and fund it (resumeOrderId tells StatusScreen not to recreate it). */
function intentFromOrder(o: Order): Intent {
  const chain = chainIdFromPaycrestSlug(o.network) ?? DEFAULT_SETTLEMENT_CHAIN_ID;
  const chainName = getChain(chain)?.name ?? chain;
  const fiat = o.currency ?? "";
  const fiatGets =
    o.fiatAmount !== null && fiat
      ? formatFiat(fiat, o.fiatAmount)
      : `Paid out in ${fiat}`;
  const name = o.recipientName ? titleCase(o.recipientName) : "";
  return {
    text: `Cash out ${o.amount} ${o.token} to ${fiat}`,
    resumeOrderId: o.id,
    quote: {
      from: { token: o.token, chain: chainName, amount: Number(o.amount) },
      to: {
        kind: "Bank account",
        currency: fiat,
        amount: fiatGets,
        label: "Bank / mobile money",
        sub: o.accountIdentifier ?? "—",
      },
      rate: null,
      fee: { network: "—", rail: "—", spread: "—", total: "—" },
      eta: "≈ 2 min",
      rail: ["Deposit", "Settle", "Payout"],
      kind: "fiat",
      railName: "Paycrest",
      railReason: "",
      exec: {
        rail: "paycrest",
        action: "offramp",
        fromChain: chain,
        fromToken: o.token as TokenSymbol,
        fromAmount: o.amount,
        toChain: null,
        toToken: null,
        fiatCurrency: fiat,
        recipient: o.accountIdentifier,
        payout: {
          institution: o.institution ?? "",
          institutionName: o.institution ?? "",
          accountIdentifier: o.accountIdentifier ?? "",
          accountName: name,
        },
      },
    },
  };
}

const MOBILE_QUERY = "(max-width: 860px)";

function useIsMobile(): boolean {
  // Default desktop so SSR + first paint match; correct on mount.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isMobile;
}

export default function AppShell() {
  const router = useRouter();
  const onBack = () => router.push("/");
  const isMobile = useIsMobile();

  const [view, setView] = useState<View>("send");
  const [recentIntent, setRecentIntent] = useState<Intent | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  // Send view starts on the Home chooser; picking a goal opens its flow.
  const [flow, setFlow] = useState<FlowId | "describe" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const goToView = (v: View) => {
    setShowStatus(false);
    setFlow(null);
    setView(v);
    setDrawerOpen(false);
  };

  // jump to status pane when a send is confirmed
  const submit = (intent: Intent) => {
    setRecentIntent(intent);
    setShowStatus(true);
  };

  // resume a still-fundable order from History into the status screen
  const resumeOrder = (order: Order) => {
    setRecentIntent(intentFromOrder(order));
    setFlow(null);
    setView("send");
    setShowStatus(true);
    setDrawerOpen(false);
  };

  const backToChooser = () => setFlow(null);

  // "Send crypto" and "Convert" share the swap card; "describe" is the NL
  // path; cash out / buy are guided fiat flows. All converge on the same
  // Review → StatusScreen contract via onSubmit.
  const flowBody = () => {
    switch (flow) {
      case "cashout":
        return <CashoutFlow onSubmit={submit} onBack={backToChooser} />;
      case "buy":
        return <BuyFlow onSubmit={submit} onBack={backToChooser} />;
      case "send":
      case "convert":
        return (
          <WithBack onBack={backToChooser}>
            <SwapForm onSubmit={submit} />
          </WithBack>
        );
      case "describe":
        return (
          <WithBack onBack={backToChooser}>
            <SendScreen onSubmit={submit} describeOnly />
          </WithBack>
        );
      default:
        return <Home onPick={setFlow} />;
    }
  };

  const sendBody = showStatus ? (
    <StatusScreen intent={recentIntent} onDone={() => setShowStatus(false)} />
  ) : (
    flowBody()
  );

  const main = (
    <main
      style={{
        padding: isMobile
          ? "16px 16px 96px"
          : "28px clamp(20px, 3vw, 44px) 64px",
        maxWidth: 1100,
        width: "100%",
      }}
    >
      {/* Re-keyed per screen so each navigation fades in (respects
          prefers-reduced-motion via the global guard). */}
      <div
        key={`${view}|${flow}|${showStatus}`}
        style={{ animation: "fade-up .22s var(--ease) both" }}
      >
        {view === "send" && sendBody}
        {view === "history" && <HistoryScreen onResume={resumeOrder} />}
        {view === "recipients" && <RecipientsScreen />}
        {view === "settings" && <SettingsScreen />}
      </div>
    </main>
  );

  // ---- mobile: top bar + slide-in drawer ----
  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <MobileTopBar onMenu={() => setDrawerOpen(true)} onBack={onBack} />
        {main}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 40,
              animation: "fade-up .15s var(--ease) both",
            }}
          >
            <aside
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 264,
                maxWidth: "84vw",
                height: "100%",
                background: "var(--bg)",
                borderRight: "1px solid var(--line)",
                padding: "18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                className="row between center"
                style={{ marginBottom: 4 }}
              >
                <span className="row center gap-2" style={{ fontSize: 14, fontWeight: 500 }}>
                  <Icon.Logo size={20} /> Swap Chain
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--fg-soft)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <NavContent view={view} setView={goToView} onBack={onBack} />
            </aside>
          </div>
        )}
      </div>
    );
  }

  // ---- desktop: sticky sidebar grid ----
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "232px 1fr",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
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
        <NavContent view={view} setView={goToView} onBack={onBack} />
      </aside>
      {main}
    </div>
  );
}

function WithBack({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="col gap-4">
      <button
        className="btn btn-quiet btn-sm"
        onClick={onBack}
        style={{ padding: "0 8px", alignSelf: "flex-start" }}
      >
        <Icon.Arrow rotate={180} size={12} /> Choose another
      </button>
      {children}
    </div>
  );
}

function MobileTopBar({
  onMenu,
  onBack,
}: {
  onMenu: () => void;
  onBack: () => void;
}) {
  return (
    <div
      className="row between center"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        padding: "12px 14px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <button
        onClick={onMenu}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--fg)",
          cursor: "pointer",
          padding: 6,
          display: "inline-flex",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 6h18M3 12h18M3 18h18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        onClick={onBack}
        className="row center gap-2"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--fg)",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <Icon.Logo size={18} /> Swap Chain
      </button>
      <AccountChip compact />
    </div>
  );
}

function NavContent({
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
    <>
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
    </>
  );
}

function AccountChip({ compact }: { compact?: boolean }) {
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
          padding: compact ? "6px 10px" : "10px 12px",
          marginBottom: compact ? 0 : 8,
          cursor: "pointer",
          border: "1px solid var(--line)",
        }}
      >
        <span className="row center gap-2" style={{ fontSize: 13 }}>
          {!compact && (
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "var(--bg-sunk)",
                border: "1px dashed var(--line-2)",
              }}
            />
          )}
          <span style={{ color: "var(--fg-soft)" }}>Connect</span>
        </span>
        {!compact && <Icon.ArrowRight size={11} />}
      </button>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const chainLabel = chain?.name ?? "Unknown network";

  if (compact) {
    return (
      <button
        onClick={() => openAccountModal?.()}
        className="card row center gap-2"
        style={{ padding: "6px 10px", cursor: "pointer" }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
        <span className="font-mono" style={{ fontSize: 11, color: "var(--fg)" }}>
          {short}
        </span>
      </button>
    );
  }

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
          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--fg)" }}>
            {short}
          </span>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--fg-mute)" }}>
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
