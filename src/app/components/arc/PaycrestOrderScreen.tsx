"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { getChain, type ChainId } from "@/config/network";
import type { PaycrestOrder } from "@/rails/paycrest";
import { formatDeadline, formatToken } from "@/utils";
import type { QuoteExec } from "./SendScreen";

/* ───────── types ───────── */

export type StageRow = {
  l: string;
  d: string;
  ref?: string;
  refHref?: string;
};

export type OfframpPhase =
  | "creating"
  | "awaiting-funds"
  | "sending"
  | "confirming"
  | "partial"
  | "converting"
  | "settled"
  | "expired"
  | "refunded";

export type PaycrestOrderScreenProps = {
  direction: "offramp" | "onramp";
  headline: string;
  intentText?: string;
  bootError: string | null;
  railError: string | null;
  done: boolean;
  onDone: () => void;
  onRestart: () => void;
  /** Creates a fresh Paycrest order (new id, address, validUntil) with the same payout. */
  onNewRate: () => void;
  onFund: () => void;
  funding: boolean;
  showFunding: boolean;
  isExpired: boolean;
  stuckAfterPaid: boolean;
  countdown: string | null;
  expiringSoon: boolean;
  sendLabel: string;
  receiveLabel: string;
  fromToken: string;
  fromChainLabel: string;
  fiatCode: string;
  feeLine: string | null;
  payoutName: string | null;
  payoutBank: string | null;
  payoutAcct: string | null;
  offrampOrder: PaycrestOrder | null;
  onrampOrder: PaycrestOrder | null;
  balanceFormatted: string | undefined;
  hasBalance: boolean;
  offrampPaid: number;
  sendAmountNum: number;
  phase: OfframpPhase | null;
  stages: StageRow[];
  activeIndex: number;
  timelineDone: boolean;
  depositSent: boolean;
  transferTxHash: string | null;
  walletAddress: string | null;
  exec: QuoteExec | null;
  onCopyAddress: () => void;
  copied: boolean;
  validUntil: string | null;
};

const MODAL_SHADOW =
  "0 16px 48px rgba(20,18,14,0.28), 0 4px 12px rgba(20,18,14,0.16)";

/* ───────── shell ───────── */

export function PaycrestOrderScreen(props: PaycrestOrderScreenProps) {
  const [showManual, setShowManual] = useState(false);
  const [confirmNav, setConfirmNav] = useState(false);
  const [exactWarn, setExactWarn] = useState(false);

  const {
    direction,
    headline,
    intentText,
    bootError,
    railError,
    done,
    onDone,
    onRestart,
    onNewRate,
    onFund,
    funding,
    showFunding,
    isExpired,
    stuckAfterPaid,
    countdown,
    expiringSoon,
    sendLabel,
    receiveLabel,
    fromToken,
    fromChainLabel,
    fiatCode,
    feeLine,
    payoutName,
    payoutBank,
    payoutAcct,
    offrampOrder,
    onrampOrder,
    balanceFormatted,
    hasBalance,
    offrampPaid,
    sendAmountNum,
    phase,
    stages,
    activeIndex,
    timelineDone,
    depositSent,
    transferTxHash,
    walletAddress,
    exec,
    onCopyAddress,
    copied,
    validUntil,
  } = props;

  const isOfframp = direction === "offramp";
  const activeOrder = isOfframp ? offrampOrder : onrampOrder;
  const depositAddress = offrampOrder?.receiveAddress ?? null;
  const showTimeline =
    !bootError &&
    stages.length > 0 &&
    !(isOfframp && (isExpired || phase === "refunded"));

  const settlementChainId = isOfframp ? exec?.fromChain : exec?.toChain ?? null;
  const settlementChainLabel = isOfframp
    ? fromChainLabel
    : exec?.toChain
      ? (getChain(exec.toChain)?.name ?? fromChainLabel)
      : fromChainLabel;

  // Off-ramp: settlement or user funding tx on source chain.
  // On-ramp: provider's stablecoin delivery tx on destination chain.
  const receiptTx = isOfframp
    ? offrampOrder?.txHash ?? transferTxHash
    : onrampOrder?.txHash ?? null;
  const receiptHref =
    receiptTx && settlementChainId
      ? explorerTxUrl(settlementChainId, receiptTx)
      : null;

  const cryptoRecipient =
    onrampOrder?.recipientAddress ?? walletAddress ?? null;

  // Lifecycle from Paycrest's transactionLogs — the honest source for timing.
  const lifecycle = extractLifecycle(activeOrder?.raw);
  // Prefer processing time (USDC received → delivered); that's what users mean
  // by "how long did it take." Fall back to total time, then a timestamp.
  const completedLabel = (() => {
    if (lifecycle?.processingMs) {
      return `Completed in ${formatDuration(Math.round(lifecycle.processingMs / 1000))}`;
    }
    const created = activeOrder?.createdAt ? Date.parse(activeOrder.createdAt) : NaN;
    const updated = activeOrder?.updatedAt ? Date.parse(activeOrder.updatedAt) : NaN;
    if (Number.isFinite(created) && Number.isFinite(updated) && updated > created) {
      const secs = Math.round((updated - created) / 1000);
      if (secs > 0 && secs < 600) return `Delivered in ${formatDuration(secs)}`;
    }
    if (activeOrder?.updatedAt && Number.isFinite(updated)) {
      return `Completed ${formatDeadline(activeOrder.updatedAt)}`;
    }
    return null;
  })();

  const handleCopy = () => {
    onCopyAddress();
    setExactWarn(true);
  };

  const summary = resolveTransferSummary({
    isOfframp,
    done,
    phase,
    depositSent,
    activeIndex,
    fromChainLabel,
    fromToken,
  });
  const paymentTxHref =
    transferTxHash && exec?.fromChain
      ? explorerTxUrl(exec.fromChain, transferTxHash)
      : null;
  const showPaymentReceipt =
    !!paymentTxHref &&
    (phase === "confirming" ||
      phase === "converting" ||
      phase === "partial" ||
      done);

  const primaryAction = resolvePrimaryAction({
    bootError,
    railError,
    done,
    isOfframp,
    showFunding,
    isExpired,
    stuckAfterPaid,
    phase,
    hasBalance,
    funding,
    sendLabel,
    fromToken,
    fromChainLabel,
    balanceFormatted,
    onFund,
    onRestart,
    onDone,
    depositAddress,
    copied,
    onCopy: handleCopy,
    walletAddress,
    validUntil,
    depositSent,
    countdown,
    expiringSoon,
  });

  return (
    <div
      className={`w-full mx-auto animate-[fade-up_0.4s_var(--ease)_both] ${
        showTimeline ? "max-w-4xl" : "max-w-xl"
      }`}
    >
      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Status</span>
          <h1 className="mt-1.5 text-[clamp(1.625rem,4vw,1.875rem)] font-medium tracking-[-0.02em] leading-[1.1] text-[var(--fg)]">
            {headline}
          </h1>
          {intentText && summary.mode !== "progress" && (
            <p className="mt-1.5 text-sm text-[var(--fg-mute)] truncate">
              {intentText}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill
            done={done}
            error={!!(bootError || railError)}
            expired={isExpired}
            phase={phase}
            countdown={countdown}
            expiringSoon={expiringSoon}
            depositSent={depositSent}
            showProcessing={summary.mode === "progress"}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              showFunding && !done ? setConfirmNav(true) : onDone()
            }
          >
            New send
          </button>
        </div>
      </header>

      {/* ── Boot error ── */}
      {bootError && (
        <div className="mt-5">
          <AlertCard tone="error" title="Can't start this transfer" body={bootError} />
        </div>
      )}

      {!bootError && (
        <div
          className={
            showTimeline
              ? "mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start"
              : "mt-5"
          }
        >
          {/* ── Main column: only the information the user acts on ── */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* Summary — phase-aware so in-flight transfers feel alive */}
            {!done && !isExpired && phase !== "refunded" && (
              <>
                <TransferSummary
                  mode={summary.mode}
                  sendAmount={sendLabel || `— ${fromToken}`}
                  sendSub={
                    summary.sendConfirmedSub ??
                    (isOfframp
                      ? `${fromChainLabel} · ${fromToken}`
                      : fiatCode)
                  }
                  sendState={summary.send.state}
                  receiveAmount={receiveLabel}
                  receiveSub={
                    isOfframp
                      ? [payoutBank, payoutAcct].filter(Boolean).join(" · ") ||
                        fiatCode
                      : `${fromToken} on ${settlementChainLabel}`
                  }
                  receiveState={summary.receive.state}
                  progressStatus={summary.progressStatus}
                  progressEta={summary.progressEta}
                  quoteReceiveHint={summary.quoteReceiveHint}
                  feeLine={feeLine}
                />
                {showPaymentReceipt && paymentTxHref && (
                  <a
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline -mt-2"
                    href={paymentTxHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View payment on {fromChainLabel} ↗
                  </a>
                )}
              </>
            )}

            {/* Terminal states */}
            {isOfframp && isExpired && (
              stuckAfterPaid ? (
                <StuckCard
                  orderId={offrampOrder?.id ?? null}
                  txHash={transferTxHash}
                  fromChain={exec?.fromChain ?? null}
                  refundAddress={walletAddress}
                />
              ) : (
                <ActionCard>
                  <p className="text-sm font-medium text-[var(--fg)]">
                    The deposit window has closed.
                  </p>
                  <p className="mt-1 text-sm text-[var(--fg-soft)] leading-relaxed">
                    This rate and deposit address are no longer valid. If you
                    didn&apos;t send anything, nothing was charged. Start a new
                    transfer with the same amount and recipient — you&apos;ll
                    get a fresh rate and deposit address.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-big w-full mt-4"
                    onClick={onNewRate}
                  >
                    Start new transfer <Icon.ArrowRight size={14} />
                  </button>
                </ActionCard>
              )
            )}
            {isOfframp && phase === "refunded" && (
              <AlertCard
                tone="neutral"
                title="Order refunded"
                body={`This order couldn't be completed, so your deposit was returned${
                  walletAddress ? ` to ${short0x(walletAddress)}` : ""
                }.`}
              />
            )}

            {/* Primary action — `bare` content brings its own card chrome. */}
            {primaryAction && !isExpired && phase !== "refunded" && (
              primaryAction.bare ? (
                <div>{primaryAction.content}</div>
              ) : (
                <ActionCard highlight={primaryAction.highlight}>
                  {primaryAction.content}
                </ActionCard>
              )
            )}

            {/* On-ramp fiat deposit */}
            {!isOfframp &&
              onrampOrder?.depositAccountIdentifier &&
              !done &&
              !railError && <OnrampDepositCard order={onrampOrder} />}

            {/* Off-ramp manual deposit (secondary) */}
            {isOfframp &&
              showFunding &&
              !isExpired &&
              depositAddress &&
              hasBalance && (
                <section className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--bg-elev)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowManual((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm text-[var(--fg-soft)] hover:bg-[var(--bg-soft)] transition-colors"
                  >
                    <span>Send from another wallet or exchange</span>
                    <span
                      className="text-[var(--fg-mute)] transition-transform duration-150"
                      style={{ transform: showManual ? "rotate(180deg)" : undefined }}
                    >
                      <Icon.ChevDown size={14} />
                    </span>
                  </button>
                  {showManual && (
                    <div className="px-4 pb-4 pt-4 border-t border-[var(--line)]">
                      <DepositCard
                        token={fromToken}
                        chainName={fromChainLabel}
                        address={depositAddress}
                        sendLabel={sendLabel}
                        copied={copied}
                        onCopy={handleCopy}
                        compact
                      />
                    </div>
                  )}
                </section>
              )}

            {/* Partial deposit notice */}
            {isOfframp && phase === "partial" && (
              <AlertCard
                tone="pending"
                title="Partial deposit received"
                body={
                  <>
                    Received{" "}
                    <strong className="font-mono tabular-nums">
                      {formatToken(offrampPaid, fromToken, 2)}
                    </strong>{" "}
                    of {sendLabel}. Send{" "}
                    <strong className="font-mono tabular-nums">
                      {formatToken(
                        Math.max(sendAmountNum - offrampPaid, 0),
                        fromToken,
                        2
                      )}
                    </strong>{" "}
                    more to continue.
                  </>
                }
              />
            )}

            {/* Rail error */}
            {railError && (
              <AlertCard tone="error" title="Transfer stopped" body={railError}>
                <div className="flex gap-2 mt-4">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onRestart}>
                    Retry
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={onDone}>
                    Start over
                  </button>
                </div>
              </AlertCard>
            )}

            {/* Success — the hero moment */}
            {done && (
              <section className="rounded-[var(--r-card-lg)] border border-[var(--ok)]/30 bg-[var(--ok-soft)] p-6 text-center shadow-[var(--shadow-1)] animate-[fade-up_0.35s_var(--ease)_both]">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ok)] text-white shadow-[0_4px_14px_var(--ok-soft)]">
                  <Icon.Check size={22} />
                </span>
                <p className="mt-3 eyebrow text-[var(--ok)]">Transfer complete</p>
                <p className="mt-1 font-mono text-[clamp(1.875rem,6vw,2.5rem)] font-semibold tabular-nums tracking-[-0.02em] leading-none text-[var(--fg)]">
                  {receiveLabel}
                </p>
                {isOfframp ? (
                  <>
                    {payoutName && (
                      <p className="mt-2.5 text-[15px] text-[var(--fg-soft)]">
                        delivered to{" "}
                        <span className="font-semibold text-[var(--fg)]">
                          {payoutName}
                        </span>
                      </p>
                    )}
                    {(payoutBank || payoutAcct) && (
                      <p className="mt-0.5 font-mono text-xs text-[var(--fg-mute)] tabular-nums">
                        {[payoutBank, payoutAcct].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </>
                ) : (
                  cryptoRecipient && (
                    <div className="mt-3 text-left rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] px-4 py-3">
                      <p className="eyebrow text-[10px]">Received at</p>
                      <p className="mt-1 font-mono text-[13px] leading-relaxed break-all text-[var(--fg)]">
                        {cryptoRecipient}
                      </p>
                      <p className="mt-1 text-xs text-[var(--fg-mute)]">
                        {fromToken} on {settlementChainLabel}
                      </p>
                    </div>
                  )
                )}
                {receiptTx && (
                  <p className="mt-2 font-mono text-xs text-[var(--fg-mute)] tabular-nums">
                    Tx {short0x(receiptTx)}
                  </p>
                )}
                {completedLabel && (
                  <p className="mt-2 text-xs text-[var(--fg-mute)]">{completedLabel}</p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {receiptHref && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={receiptHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View transaction on {settlementChainLabel} ↗
                    </a>
                  )}
                  <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
                    Send another
                  </button>
                </div>
              </section>
            )}

            {/* Technical refs */}
            {!isOfframp && onrampOrder && done && (
              <details className="group text-xs text-[var(--fg-mute)]">
                <summary className="cursor-pointer list-none flex items-center gap-1.5 py-1 hover:text-[var(--fg-soft)] transition-colors [&::-webkit-details-marker]:hidden">
                  <span className="transition-transform group-open:rotate-90">›</span>
                  Order details
                </summary>
                <div className="mt-2 pl-3 flex flex-col gap-1.5 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5">
                    Order {onrampOrder.id}
                    <CopyInline text={onrampOrder.id} />
                  </span>
                  {cryptoRecipient && (
                    <span className="text-[var(--fg-mute)] break-all">
                      Wallet {cryptoRecipient}
                    </span>
                  )}
                  {receiptTx && settlementChainId && (
                    <a
                      className="inline-flex items-center gap-1 text-[var(--accent)] underline-offset-2 hover:underline"
                      href={explorerTxUrl(settlementChainId, receiptTx) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Transaction {short0x(receiptTx)} ↗
                    </a>
                  )}
                </div>
              </details>
            )}
            {isOfframp && offrampOrder && (
              <details className="group text-xs text-[var(--fg-mute)]">
                <summary className="cursor-pointer list-none flex items-center gap-1.5 py-1 hover:text-[var(--fg-soft)] transition-colors [&::-webkit-details-marker]:hidden">
                  <span className="transition-transform group-open:rotate-90">›</span>
                  Order details
                </summary>
                <div className="mt-2 pl-3 flex flex-col gap-1.5 font-mono text-[11px]">
                  {lifecycle && lifecycle.steps.length > 0 && (
                    <div className="flex flex-col gap-1 pb-2 mb-0.5 border-b border-[var(--line)]">
                      {lifecycle.steps.map((s, i) => (
                        <div
                          key={s.label}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-[var(--fg-mute)]">{s.label}</span>
                          <span className="tabular-nums text-[var(--fg-soft)]">
                            {i === 0 ? formatStamp(s.at) : formatClock(s.at)}
                          </span>
                        </div>
                      ))}
                      {lifecycle.processingMs != null && (
                        <div className="flex items-center justify-between gap-3 mt-1 pt-1.5 border-t border-[var(--line)]">
                          <span className="text-[var(--fg-soft)]">Processing time</span>
                          <span className="tabular-nums font-medium text-[var(--fg)]">
                            {formatDuration(Math.round(lifecycle.processingMs / 1000))}
                          </span>
                        </div>
                      )}
                      {lifecycle.totalMs != null && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[var(--fg-mute)]">Total order time</span>
                          <span className="tabular-nums text-[var(--fg-soft)]">
                            {formatDuration(Math.round(lifecycle.totalMs / 1000))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <span className="flex items-center gap-1.5">
                    Order {offrampOrder.id}
                    <CopyInline text={offrampOrder.id} />
                  </span>
                  {walletAddress && (
                    <span className="text-[var(--fg-mute)]">
                      Refund address {short0x(walletAddress)}
                    </span>
                  )}
                  {transferTxHash && exec && (
                    <>
                      <a
                        className="inline-flex items-center gap-1 text-[var(--accent)] underline-offset-2 hover:underline"
                        href={explorerTxUrl(exec.fromChain, transferTxHash) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View payment on {getChain(exec.fromChain)?.name ?? "chain"} ↗
                      </a>
                      <span className="text-[var(--fg-faint)]">
                        {short0x(transferTxHash)}
                      </span>
                    </>
                  )}
                  {offrampOrder.txHash && exec && (
                    <a
                      className="inline-flex items-center gap-1 text-[var(--accent)] underline-offset-2 hover:underline"
                      href={explorerTxUrl(exec.fromChain, offrampOrder.txHash) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Transaction {short0x(offrampOrder.txHash)} ↗
                    </a>
                  )}
                </div>
              </details>
            )}
          </div>

          {/* ── Progress rail: alongside content, never blocking it ── */}
          {showTimeline && (
            <aside className="lg:sticky lg:top-6">
              <section
                aria-label="Order progress"
                className="rounded-[var(--r-card-lg)] border border-[var(--line)] bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-1)]"
              >
                <h2 className="eyebrow mb-4">Progress</h2>
                <Timeline
                  stages={stages}
                  activeIndex={activeIndex}
                  done={timelineDone}
                  failed={!!railError}
                />
              </section>
            </aside>
          )}
        </div>
      )}

      {exactWarn && depositAddress && (
        <BeforeYouSendModal
          sendLabel={sendLabel}
          token={fromToken}
          chainName={fromChainLabel}
          address={depositAddress}
          copied={copied}
          onCopy={handleCopy}
          onClose={() => setExactWarn(false)}
        />
      )}
      {confirmNav && (
        <StatusModal
          title="Active transfer waiting"
          body="You have an active transfer waiting for funds. Start a new one? You can still find this order in History."
          confirmLabel="Start new"
          onConfirm={() => {
            setConfirmNav(false);
            onDone();
          }}
          onClose={() => setConfirmNav(false)}
        />
      )}
    </div>
  );
}

/* ───────── primary action resolver ───────── */

function resolvePrimaryAction(ctx: {
  bootError: string | null;
  railError: string | null;
  done: boolean;
  isOfframp: boolean;
  showFunding: boolean;
  isExpired: boolean;
  stuckAfterPaid: boolean;
  phase: OfframpPhase | null;
  hasBalance: boolean;
  funding: boolean;
  sendLabel: string;
  fromToken: string;
  fromChainLabel: string;
  balanceFormatted: string | undefined;
  onFund: () => void;
  onRestart: () => void;
  onDone: () => void;
  depositAddress: string | null;
  copied: boolean;
  onCopy: () => void;
  walletAddress: string | null;
  validUntil: string | null;
  depositSent: boolean;
  countdown: string | null;
  expiringSoon: boolean;
}): { content: React.ReactNode; bare?: boolean; highlight?: boolean } | null {
  if (ctx.bootError || ctx.railError || ctx.done || ctx.isExpired) return null;
  if (!ctx.isOfframp || !ctx.showFunding || !ctx.depositAddress) return null;

  // Wallet can cover it → one-tap pay is the action; manual address is secondary.
  if (ctx.hasBalance) {
    return {
      highlight: true,
      content: (
        <>
          <div className="flex items-start gap-3 mb-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon.ArrowRight size={16} />
            </span>
            <div>
              <p className="text-[15px] font-medium text-[var(--fg)]">
                Pay {ctx.sendLabel} from your wallet
              </p>
              <p className="mt-0.5 text-sm text-[var(--fg-mute)]">
                One tap — we&apos;ll send to the deposit address for you.
              </p>
              {ctx.countdown && !ctx.depositSent && (
                <p className="mt-1 text-xs text-[var(--fg-faint)]">
                  Expires in{" "}
                  <span className="font-mono tabular-nums">{ctx.countdown}</span>
                </p>
              )}
            </div>
          </div>
          {ctx.balanceFormatted !== undefined && (
            <div className="flex items-center justify-between mb-3 px-0.5 text-xs">
              <span className="text-[var(--fg-mute)]">Wallet balance</span>
              <span className="font-mono tabular-nums text-[var(--fg)]">
                {ctx.balanceFormatted} {ctx.fromToken}
              </span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-big w-full"
            disabled={ctx.funding}
            onClick={() => ctx.onFund()}
          >
            {ctx.funding ? (
              <>
                <Icon.Spinner size={14} /> Confirm in your wallet…
              </>
            ) : (
              <>
                Pay {ctx.sendLabel} <Icon.ArrowRight size={14} />
              </>
            )}
          </button>
        </>
      ),
    };
  }

  // No wallet balance → the deposit address + QR is the hero. Balance is demoted
  // to a contextual note that explains why there's no one-tap pay.
  return {
    bare: true,
    content: (
      <>
        <DepositCard
          token={ctx.fromToken}
          chainName={ctx.fromChainLabel}
          address={ctx.depositAddress}
          sendLabel={ctx.sendLabel}
          copied={ctx.copied}
          onCopy={ctx.onCopy}
          countdown={ctx.countdown}
          expiringSoon={ctx.expiringSoon}
        />
        {ctx.balanceFormatted !== undefined && (
          <div className="mt-3 flex items-start gap-2 px-1 text-xs text-[var(--fg-mute)]">
            <span className="mt-px shrink-0 text-[var(--pend)]">
              <WarnIcon size={13} />
            </span>
            <span>
              Connected wallet has{" "}
              <span className="font-mono tabular-nums text-[var(--fg-soft)]">
                {ctx.balanceFormatted} {ctx.fromToken}
              </span>{" "}
              — send from another wallet or exchange to the address above.
            </span>
          </div>
        )}
      </>
    ),
  };
}

/* ───────── transfer summary ───────── */

type LegVisualState = "idle" | "active" | "done";

type SummaryLegConfig = {
  state: LegVisualState;
};

type TransferSummaryView = {
  mode: "quote" | "progress";
  send: SummaryLegConfig;
  receive: SummaryLegConfig;
  sendConfirmedSub?: string;
  progressStatus?: string;
  progressEta?: string;
  quoteReceiveHint?: string;
};

function resolveTransferSummary({
  isOfframp,
  done,
  phase,
  depositSent,
  activeIndex,
  fromChainLabel,
  fromToken,
}: {
  isOfframp: boolean;
  done: boolean;
  phase: OfframpPhase | null;
  depositSent: boolean;
  activeIndex: number;
  fromChainLabel: string;
  fromToken: string;
}): TransferSummaryView {
  if (done) {
    return {
      mode: "progress",
      send: { state: "done" },
      receive: { state: "done" },
    };
  }

  if (isOfframp) {
    if (phase === "confirming") {
      return {
        mode: "progress",
        send: { state: "done" },
        receive: { state: "idle" },
        sendConfirmedSub: `Submitted on ${fromChainLabel}`,
        progressStatus: "Waiting for provider confirmation",
      };
    }

    if (phase === "converting" || (phase === "partial" && depositSent)) {
      return {
        mode: "progress",
        send: { state: "done" },
        receive: { state: "done" },
        sendConfirmedSub: `${fromToken} received`,
        progressStatus:
          "Your funds will be credited to your bank account shortly.",
      };
    }

    const sendActive =
      phase === "awaiting-funds" || phase === "sending" || phase === "creating";

    return {
      mode: "quote",
      send: { state: sendActive ? "active" : "idle" },
      receive: { state: "idle" },
      quoteReceiveHint: "Locked at this rate",
    };
  }

  const fiatProcessing = activeIndex >= 2;

  if (fiatProcessing) {
    return {
      mode: "progress",
      send: { state: "done" },
      receive: { state: "done" },
      sendConfirmedSub: "Payment received",
      progressStatus: "Sending to your wallet",
    };
  }

  return {
    mode: "quote",
    send: { state: activeIndex === 1 ? "active" : "idle" },
    receive: { state: "idle" },
    quoteReceiveHint: "Locked at this rate",
  };
}

function TransferSummary({
  mode,
  sendAmount,
  sendSub,
  sendState,
  receiveAmount,
  receiveSub,
  receiveState,
  progressStatus,
  progressEta,
  quoteReceiveHint,
  feeLine,
}: {
  mode: "quote" | "progress";
  sendAmount: string;
  sendSub: string;
  sendState: LegVisualState;
  receiveAmount: string;
  receiveSub: string;
  receiveState: LegVisualState;
  progressStatus?: string;
  progressEta?: string;
  quoteReceiveHint?: string;
  feeLine: string | null;
}) {
  if (mode === "progress") {
    return (
      <section
        aria-label="Transfer summary"
        aria-busy
        className="rounded-[var(--r-card-lg)] border border-[var(--line)] bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-1)]"
      >
        <div className="flex items-start gap-2">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok)]">
            <Icon.Check size={12} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[clamp(1.375rem,3.5vw,1.75rem)] font-medium tabular-nums tracking-[-0.02em] leading-none text-[var(--fg)]">
              {sendAmount}
            </p>
            <p className="mt-1.5 text-sm text-[var(--fg-soft)]">{sendSub}</p>
          </div>
        </div>

        <div
          className="my-4 flex justify-center text-[var(--fg-mute)]"
          aria-hidden
        >
          <Icon.ChevDown size={16} />
        </div>

        <div className="text-center">
          <p className="font-mono text-[clamp(1.5rem,4vw,2rem)] font-medium tabular-nums tracking-[-0.02em] leading-none text-[var(--accent)]">
            {receiveAmount}
          </p>
          {receiveSub && (
            <p className="mt-2 text-sm text-[var(--fg-soft)]">{receiveSub}</p>
          )}
        </div>

        {(progressStatus || progressEta) && (
          <div className="mt-5 pt-4 border-t border-[var(--line)] text-center">
            {progressStatus && (
              <p className="text-sm font-medium text-[var(--fg)]">
                {progressStatus}
              </p>
            )}
            {progressEta && (
              <p className="mt-1 text-sm text-[var(--fg-soft)]">
                {progressEta}
              </p>
            )}
          </div>
        )}

        {feeLine && (
          <p className="mt-3 pt-3 border-t border-[var(--line)] font-mono text-[11px] text-[var(--fg-mute)] tabular-nums text-center">
            {feeLine}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Transfer summary"
      className="rounded-[var(--r-card-lg)] border border-[var(--line)] bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-1)]"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
        <AmountBlock
          label="You send"
          amount={sendAmount}
          sub={sendSub}
          state={sendState}
        />
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--bg-soft)] text-[var(--fg-mute)]"
          aria-hidden
        >
          <Icon.ArrowRight size={14} />
        </div>
        <AmountBlock
          label="They receive"
          amount={receiveAmount}
          sub={receiveSub}
          state={receiveState}
          hint={quoteReceiveHint}
          align="end"
        />
      </div>
      {feeLine && (
        <p className="mt-3 pt-3 border-t border-[var(--line)] font-mono text-[11px] text-[var(--fg-mute)] tabular-nums">
          {feeLine}
        </p>
      )}
    </section>
  );
}

/* ───────── sub-components ───────── */

function StatusPill({
  done,
  error,
  expired,
  phase,
  countdown,
  expiringSoon,
  depositSent,
  showProcessing,
}: {
  done: boolean;
  error: boolean;
  expired: boolean;
  phase: OfframpPhase | null;
  countdown: string | null;
  expiringSoon: boolean;
  depositSent: boolean;
  showProcessing?: boolean;
}) {
  if (error) {
    return <span className="chip chip-err">Needs attention</span>;
  }
  if (done) {
    return <span className="chip chip-ok">Complete</span>;
  }
  if (expired) {
    return <span className="chip chip-err">Rate expired</span>;
  }
  if (countdown && !depositSent) {
    return (
      <span className={`chip ${expiringSoon ? "chip-pend" : ""}`}>
        Rate locked ·{" "}
        <span className="font-mono tabular-nums">{countdown}</span>
      </span>
    );
  }
  if (
    showProcessing ||
    phase === "converting" ||
    phase === "confirming"
  ) {
    return <span className="chip chip-accent">Processing</span>;
  }
  if (phase === "awaiting-funds" || (phase === "partial" && !depositSent)) {
    return <span className="chip chip-pend">Awaiting payment</span>;
  }
  return null;
}

function AmountBlock({
  label,
  amount,
  sub,
  state = "idle",
  hint,
  align = "start",
}: {
  label: string;
  amount: string;
  sub?: string;
  /** @deprecated use state */
  accent?: boolean;
  state?: LegVisualState;
  hint?: string;
  align?: "start" | "end";
}) {
  const amountTone: Record<LegVisualState, string> = {
    idle: "text-[var(--fg-mute)]",
    active: "text-[var(--fg)]",
    done: "text-[var(--fg)]",
  };

  return (
    <div className={align === "end" ? "text-right" : "text-left"}>
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--fg-mute)] font-mono">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-[clamp(1.25rem,3.5vw,1.625rem)] font-medium tabular-nums tracking-[-0.02em] leading-none ${
          align === "end" && state !== "idle"
            ? "text-[var(--accent)]"
            : amountTone[state]
        }`}
      >
        {amount}
      </p>
      {sub && (
        <p
          className={`mt-1.5 text-xs truncate max-w-[140px] sm:max-w-none ${
            state === "idle" ? "text-[var(--fg-mute)]" : "text-[var(--fg-soft)]"
          } ${align === "end" ? "ml-auto" : ""}`}
        >
          {sub}
        </p>
      )}
      {hint && (
        <p
          className={`mt-1 text-[11px] leading-snug text-[var(--fg-mute)] ${
            align === "end" ? "ml-auto max-w-[160px]" : "max-w-[180px]"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function ActionCard({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-[var(--r-card-lg)] border p-5 shadow-[var(--shadow-1)] ${
        highlight
          ? "border-[var(--accent-line)] bg-[var(--bg-elev)] ring-1 ring-[var(--accent-soft)]"
          : "border-[var(--line)] bg-[var(--bg-elev)]"
      }`}
    >
      {children}
    </section>
  );
}

function AlertCard({
  tone,
  title,
  body,
  children,
}: {
  tone: "error" | "pending" | "neutral";
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  const styles = {
    error: "border-[var(--err)]/30 bg-[var(--err-soft)]",
    pending: "border-[var(--pend)]/30 bg-[var(--pend-soft)]",
    neutral: "border-[var(--line-2)] bg-[var(--bg-soft)]",
  }[tone];

  return (
    <section className={`rounded-[var(--r-card)] border p-4 ${styles}`}>
      <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
      <div className="mt-1.5 text-sm text-[var(--fg-soft)] leading-relaxed">{body}</div>
      {children}
    </section>
  );
}

/**
 * The deposit card — the one action on this screen, so the address + QR are the
 * hero. `compact` strips the outer chrome + amount header for embedding under
 * the "send from another wallet" expander.
 */
function DepositCard({
  token,
  chainName,
  address,
  sendLabel,
  copied,
  onCopy,
  countdown,
  expiringSoon,
  compact,
  className = "",
}: {
  token: string;
  chainName: string;
  address: string;
  sendLabel: string;
  copied: boolean;
  onCopy: () => void;
  countdown?: string | null;
  expiringSoon?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const body = (
    <div className={`flex flex-col gap-3 ${compact ? "" : "mt-4"}`}>
      <div className="min-w-0">
        <span className="eyebrow text-[10px]">Deposit address</span>
        <p className="mt-1 select-all font-mono text-[13px] leading-relaxed break-all text-[var(--fg)]">
          {address}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="btn btn-primary btn-sm"
          aria-label="Copy deposit address"
        >
          {copied ? (
            <>
              <Icon.Check size={14} /> Copied
            </>
          ) : (
            <>
              <Icon.Copy size={14} /> Copy address
            </>
          )}
        </button>
        {token && chainName && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-[var(--r-pill)] bg-[var(--err-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--err)]">
            <WarnIcon size={12} /> {token} on {chainName} only
          </span>
        )}
      </div>
    </div>
  );

  if (compact) return <div className={className}>{body}</div>;

  return (
    <div
      className={`rounded-[var(--r-card-lg)] border border-[var(--accent-line)] bg-[var(--accent-soft)]/60 p-5 shadow-[var(--shadow-1)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow text-[10px] text-[var(--accent)]">Send exactly</span>
        {countdown && (
          <span className={`chip text-[10px] ${expiringSoon ? "chip-err" : "chip-pend"}`}>
            Expires in <span className="font-mono tabular-nums">{countdown}</span>
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-[clamp(1.5rem,5vw,2rem)] font-semibold tabular-nums tracking-[-0.02em] leading-none text-[var(--fg)]">
        {sendLabel}
      </p>
      {body}
    </div>
  );
}

/** Warning triangle — used to flag the irreversible network/chain choice. */
function WarnIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function OnrampDepositCard({ order }: { order: PaycrestOrder }) {
  return (
    <ActionCard highlight>
      <h2 className="eyebrow mb-3">Send your payment</h2>
      <p className="text-sm text-[var(--fg-mute)] mb-4">
        Transfer exactly{" "}
        <strong className="font-mono text-[var(--fg)] tabular-nums">
          {order.amountToTransfer} {order.depositCurrency}
        </strong>{" "}
        to the account below.
      </p>
      <div className="rounded-xl border border-[var(--line-2)] bg-[var(--bg-soft)] p-4 space-y-2">
        {order.depositAccountName && (
          <p className="text-sm font-medium text-[var(--fg)]">
            {order.depositAccountName}
          </p>
        )}
        <p className="font-mono text-xl font-semibold tabular-nums tracking-[-0.02em] text-[var(--fg)]">
          {order.depositAccountIdentifier}
        </p>
        {order.depositInstitution && (
          <p className="text-xs text-[var(--fg-mute)]">{order.depositInstitution}</p>
        )}
      </div>
      {order.validUntil && (
        <p className="mt-3 text-xs text-[var(--fg-mute)]">
          Deposit before {formatDeadline(order.validUntil)}
        </p>
      )}
      {order.amount && order.currency && (
        <p className="mt-1 text-xs text-[var(--fg-mute)]">
          You receive ≈ {order.amount} {order.currency}
          {order.rate ? ` @ ${order.rate}` : ""}
        </p>
      )}
    </ActionCard>
  );
}

function Timeline({
  stages,
  activeIndex,
  done,
  failed,
}: {
  stages: StageRow[];
  activeIndex: number;
  done: boolean;
  failed: boolean;
}) {
  return (
    <ol className="flex flex-col">
      {stages.map((s, i) => {
        const isDone = done || activeIndex > i;
        const isActive = !done && activeIndex === i;
        const isFailed = failed && activeIndex === i;
        const pending = !isDone && !isActive && !isFailed;

        return (
          <li
            key={i}
            className={`flex gap-3.5 ${i < stages.length - 1 ? "pb-5" : ""}`}
          >
            <div className="flex flex-col items-center w-5 shrink-0">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono transition-colors ${
                  isFailed
                    ? "bg-[var(--err)] text-white"
                    : isDone
                      ? "bg-[var(--ok)] text-white"
                      : isActive
                        ? "bg-[var(--accent)] text-white animate-[pulse-ring_1.4s_var(--ease)_infinite]"
                        : "border border-[var(--line-2)] bg-[var(--bg-sunk)] text-[var(--fg-mute)]"
                }`}
              >
                {isFailed ? "!" : isDone ? <Icon.Check size={10} /> : i + 1}
              </span>
              {i < stages.length - 1 && (
                <div
                  className={`w-0.5 flex-1 min-h-[20px] mt-1 rounded-full ${
                    isDone ? "bg-[var(--ok)]" : "bg-[var(--line)]"
                  }`}
                />
              )}
            </div>
            <div className={`flex-1 min-w-0 pt-px ${pending ? "opacity-50" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-[var(--fg)]">{s.l}</p>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--fg-faint)]">
                  {isFailed
                    ? "Failed"
                    : isDone
                      ? "Done"
                      : isActive
                        ? "Now"
                        : "Next"}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-[var(--fg-mute)] leading-snug">
                {s.d}
              </p>
              {s.ref && (isDone || isActive) && (
                <RailRef text={s.ref} href={s.refHref ?? null} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StuckCard({
  orderId,
  txHash,
  fromChain,
  refundAddress,
}: {
  orderId: string | null;
  txHash: string | null;
  fromChain: ChainId | null;
  refundAddress: string | null;
}) {
  return (
    <AlertCard
      tone="pending"
      title="Payment received — taking longer"
      body={
        <>
          Your payment is on-chain but payout confirmation is delayed. Don&apos;t
          send again.
          {refundAddress && (
            <> Refunds go to {short0x(refundAddress)} if fulfillment fails.</>
          )}
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-1 font-mono text-[11px] text-[var(--fg-mute)]">
        {orderId && <span>Order {orderId}</span>}
        {txHash && fromChain && (
          <a
            className="text-[var(--accent)] underline-offset-2 hover:underline"
            href={explorerTxUrl(fromChain, txHash) ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            Your payment {short0x(txHash)}
          </a>
        )}
      </div>
    </AlertCard>
  );
}

function RailRef({ text, href }: { text: string; href: string | null }) {
  if (!href) {
    return (
      <span className="mt-1 inline-block font-mono text-[11px] text-[var(--fg-faint)]">
        {text}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-block font-mono text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
    >
      {text}
    </a>
  );
}

function StatusModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-[360px] p-5"
        style={{ boxShadow: MODAL_SHADOW }}
      >
        <strong className="text-[15px]">{title}</strong>
        <p className="mt-2 text-[13.5px] text-[var(--fg-mute)] leading-relaxed">
          {body}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            {confirmLabel ? "Cancel" : "Got it"}
          </button>
          {confirmLabel && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function BeforeYouSendModal({
  sendLabel,
  token,
  chainName,
  address,
  copied,
  onCopy,
  onClose,
}: {
  sendLabel: string;
  token: string;
  chainName: string;
  address: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Before you send"
        className="card flex flex-col gap-4 w-full max-w-[380px] p-5"
        style={{ boxShadow: MODAL_SHADOW }}
      >
        <strong className="text-[15px]">Before you send</strong>
        <div>
          <span className="eyebrow text-[10px]">Send exactly</span>
          <p className="mt-1 text-[26px] font-semibold tracking-[-0.01em] leading-none">
            {sendLabel}
          </p>
          <span className="chip chip-err mt-2 text-[11px]">
            {token} on {chainName} only
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-soft)] px-3.5 py-3 text-left"
        >
          <span className="font-mono text-[13px] break-all leading-snug">{address}</span>
          {copied ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--ok)]">
              <Icon.Check size={12} /> Copied
            </span>
          ) : (
            <Icon.Copy size={14} />
          )}
        </button>
        <p className="text-xs text-[var(--fg-mute)] leading-relaxed">
          Sending on any other network will lose the funds. Double-check the chain
          in your wallet before you confirm.
        </p>
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ───────── utils ───────── */

function explorerTxUrl(chainId: ChainId, txHash: string): string | null {
  const base = getChain(chainId)?.explorer;
  return base ? `${base}/tx/${txHash}` : null;
}

function short0x(hash: string): string {
  if (!hash.startsWith("0x") || hash.length < 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** "43" → "43s", "126" → "2m 06s". */
function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${String(s).padStart(2, "0")}s` : `${m}m`;
}

/** Local wall-clock time, e.g. "8:56:15 AM". */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Date + time for the order-created row, e.g. "12/6/26, 2:59:39 PM". */
function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString([], {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

type Lifecycle = {
  steps: { label: string; at: number }[];
  /** USDC received → delivered. The "how long did it take" number. */
  processingMs?: number;
  /** Order created → delivered (includes funding delay). */
  totalMs?: number;
};

// Paycrest transactionLogs statuses → human labels (noise stages dropped).
const LIFECYCLE_LABELS: Record<string, string> = {
  order_initiated: "Order created",
  crypto_deposited: "USDC received",
  order_created: "Conversion began",
  order_fulfilled: "Delivered",
  order_refunded: "Refunded",
};

/**
 * Pulls the order's transactionLogs (under raw.data, or raw) into a sorted,
 * de-duplicated lifecycle. Logs arrive out of chronological order, so we sort
 * by timestamp before deriving any stage times or durations.
 */
function extractLifecycle(raw: unknown): Lifecycle | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const logs = data.transactionLogs;
  if (!Array.isArray(logs)) return null;

  const parsed = logs
    .map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      const status = typeof o.status === "string" ? o.status : "";
      const at = typeof o.created_at === "string" ? Date.parse(o.created_at) : NaN;
      return { status, at };
    })
    .filter((l) => l.status && Number.isFinite(l.at))
    .sort((a, b) => a.at - b.at);
  if (!parsed.length) return null;

  const firstAt = (s: string) => parsed.find((l) => l.status === s)?.at;
  const deposited = firstAt("crypto_deposited");
  const fulfilled = firstAt("order_fulfilled");
  const initiated = firstAt("order_initiated") ?? parsed[0].at;

  const steps = parsed
    .filter((l, i, arr) => arr.findIndex((x) => x.status === l.status) === i)
    .filter((l) => LIFECYCLE_LABELS[l.status])
    .map((l) => ({ label: LIFECYCLE_LABELS[l.status], at: l.at }));

  return {
    steps,
    processingMs:
      deposited != null && fulfilled != null && fulfilled > deposited
        ? fulfilled - deposited
        : undefined,
    totalMs:
      initiated != null && fulfilled != null && fulfilled > initiated
        ? fulfilled - initiated
        : undefined,
  };
}

/** Inline tap-to-copy button for IDs that aren't links (e.g. the order ID). */
function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {})
      }
      className="text-[var(--fg-mute)] transition-colors hover:text-[var(--fg)]"
      title="Copy"
      aria-label="Copy"
    >
      {copied ? <Icon.Check size={11} /> : <Icon.Copy size={12} />}
    </button>
  );
}
