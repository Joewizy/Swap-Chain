"use client";

import type { CSSProperties } from "react";
import { formatAmountInput } from "@/utils";

type PrefixedAmountInputProps = {
  amount: string;
  onAmountChange: (value: string) => void;
  /** e.g. "$" for stablecoins, "₦" for NGN. Omit or empty to hide. */
  prefix?: string;
  placeholder?: string;
  style?: CSSProperties;
};

/** Amount field with a leading currency symbol — value stays digits-only in state. */
export function PrefixedAmountInput({
  amount,
  onAmountChange,
  prefix,
  placeholder = "0",
  style,
}: PrefixedAmountInputProps) {
  return (
    <div
      className="row center"
      style={{
        flex: 1,
        minWidth: 0,
        padding: "10px 12px",
        background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        ...style,
      }}
    >
      {prefix ? (
        <span
          aria-hidden
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: "var(--fg-mute)",
            marginRight: 6,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {prefix}
        </span>
      ) : null}
      <input
        value={formatAmountInput(amount)}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          if ((v.match(/\./g) || []).length > 1) return;
          onAmountChange(v);
        }}
        inputMode="decimal"
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          background: "transparent",
          fontSize: 22,
          fontWeight: 500,
          outline: "none",
          color: "var(--fg)",
        }}
      />
    </div>
  );
}
