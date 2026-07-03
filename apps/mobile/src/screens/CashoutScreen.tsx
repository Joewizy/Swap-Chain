import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { useAccount } from "wagmi";
import {
  ACTIVE_CHAINS,
  getChain,
  resolveChain,
  type ChainId,
} from "@railglide/shared/network";
import { useSession } from "@/store/session";
import { useWalletAuth } from "@/wallet/useWalletAuth";
import { usePaycrestOfframp } from "@/wallet/usePaycrestOfframp";
import {
  getInstitutions,
  getRate,
  verifyAccount,
} from "@/api/paycrest";
import {
  PAYCREST_CHAIN_IDS,
  PAYCREST_FIAT,
  type PaycrestFiat,
  type PaycrestInstitution,
  type PaycrestToken,
} from "@/rails/paycrest";
import { ApiError } from "@/api/client";
import { Intro } from "@/components/form";
import { Picker } from "@/components/Picker";
import {
  chainOptions,
  currencyOptions,
  institutionOptions,
  tokenOptions,
} from "@/components/options";
import { theme } from "@/theme";

const TOKENS: PaycrestToken[] = ["USDC", "USDT"];

/** Chains that are both in the active network universe and Paycrest-supported. */
function offrampChains(): ChainId[] {
  return PAYCREST_CHAIN_IDS.filter((id) =>
    ACTIVE_CHAINS.some((c) => c.id === id)
  );
}

type Step = "compose" | "recipient" | "review";

export function CashoutScreen() {
  const launch = useSession((s) => s.pendingLaunch);
  const setPendingLaunch = useSession((s) => s.setPendingLaunch);
  const { address, isConnected } = useAccount();
  const { connect } = useWalletAuth();
  const offramp = usePaycrestOfframp();

  const chains = useMemo(offrampChains, []);
  const [step, setStep] = useState<Step>("compose");

  // Compose
  const [amount, setAmount] = useState(launch?.amount ?? "");
  const [token, setToken] = useState<PaycrestToken>(
    (launch?.token as PaycrestToken) === "USDT" ? "USDT" : "USDC"
  );
  const [chain, setChain] = useState<ChainId>(
    (launch?.chain && resolveChain(launch.chain)) || chains[0]
  );
  const [currency, setCurrency] = useState<PaycrestFiat>(
    (launch?.currency as PaycrestFiat) &&
      PAYCREST_FIAT.includes(launch!.currency as PaycrestFiat)
      ? (launch!.currency as PaycrestFiat)
      : "NGN"
  );
  const [rate, setRate] = useState<number | null>(null);

  // Recipient
  const [institutions, setInstitutions] = useState<PaycrestInstitution[]>([]);
  const [institution, setInstitution] = useState<PaycrestInstitution | null>(
    null
  );
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  // Clear the one-shot handoff so leaving and returning starts fresh.
  useEffect(() => {
    return () => setPendingLaunch(null);
  }, [setPendingLaunch]);

  // Live unit rate for the estimate.
  useEffect(() => {
    let cancelled = false;
    getRate(currency, token)
      .then((r) => !cancelled && setRate(r.rate))
      .catch(() => !cancelled && setRate(null));
    return () => {
      cancelled = true;
    };
  }, [currency, token]);

  // Institutions for the chosen currency.
  useEffect(() => {
    let cancelled = false;
    setInstitutions([]);
    getInstitutions(currency)
      .then((list) => !cancelled && setInstitutions(list))
      .catch(() => !cancelled && setInstitutions([]));
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const estimate =
    rate && Number(amount) > 0
      ? (Number(amount) * rate).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })
      : null;

  const doVerify = async () => {
    if (!institution || !account.trim()) return;
    setVerifying(true);
    setRecipientError(null);
    setAccountName(null);
    try {
      const name = await verifyAccount(institution.code, account.trim());
      setAccountName(name);
    } catch (err) {
      setRecipientError(
        err instanceof ApiError ? err.message : "Couldn't verify that account."
      );
    } finally {
      setVerifying(false);
    }
  };

  const createOrder = async () => {
    if (!institution || !accountName || !address) return;
    try {
      await offramp.offramp({
        fromChain: chain,
        token,
        amount: amount.trim(),
        fiatCurrency: currency,
        recipient: {
          institution: institution.code,
          accountIdentifier: account.trim(),
          accountName,
        },
        refundAddress: address as `0x${string}`,
      });
    } catch {
      // error surfaced via offramp.error
    }
  };

  // ---- Order in flight: funding / settling / done ----------------------
  if (offramp.status !== "idle") {
    return (
      <OrderStatus offramp={offramp} token={token} currency={currency} />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Intro>Send stablecoins to a bank or mobile money account.</Intro>
      <Steps step={step} />

      {step === "compose" && (
        <>
          <Field label="Amount">
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.muted}
            />
          </Field>

          <Field label="Token">
            <Picker
              title="Token"
              value={token}
              options={tokenOptions(TOKENS)}
              onChange={(t) => setToken(t as PaycrestToken)}
            />
          </Field>

          <Field label="From chain">
            <Picker
              title="From chain"
              value={chain}
              options={chainOptions(chains)}
              onChange={(c) => setChain(c as ChainId)}
            />
          </Field>

          <Field label="Payout currency">
            <Picker
              title="Payout currency"
              value={currency}
              options={currencyOptions(PAYCREST_FIAT)}
              onChange={(c) => setCurrency(c as PaycrestFiat)}
            />
          </Field>

          <Text style={styles.estimate}>
            {estimate
              ? `≈ ${estimate} ${currency}  (rate locks when you create the order)`
              : "Enter an amount to see the estimate"}
          </Text>

          <Primary
            label="Continue"
            disabled={!(Number(amount) > 0)}
            onPress={() => setStep("recipient")}
          />
        </>
      )}

      {step === "recipient" && (
        <>
          <Field label="Bank / mobile money">
            <Picker
              title="Choose provider"
              searchable
              placeholder={
                institutions.length ? "Select provider" : "Loading providers…"
              }
              value={institution?.code}
              options={institutionOptions(institutions)}
              onChange={(code) => {
                setInstitution(institutions.find((i) => i.code === code) ?? null);
                setAccountName(null);
              }}
            />
          </Field>

          {institution && (
            <>
              <Field label="Account number">
                <TextInput
                  style={styles.input}
                  value={account}
                  onChangeText={(t) => {
                    setAccount(t);
                    setAccountName(null);
                  }}
                  keyboardType="number-pad"
                  placeholder="Account / phone number"
                  placeholderTextColor={theme.colors.muted}
                />
              </Field>

              {accountName ? (
                <Text style={styles.accountName}>✓ {accountName}</Text>
              ) : (
                <Primary
                  label={verifying ? "Verifying…" : "Verify account"}
                  disabled={!account.trim() || verifying}
                  onPress={() => void doVerify()}
                />
              )}
              {recipientError && (
                <Text style={styles.error}>{recipientError}</Text>
              )}
            </>
          )}

          <View style={styles.rowButtons}>
            <Secondary label="Back" onPress={() => setStep("compose")} />
            <Primary
              label="Review"
              disabled={!accountName}
              onPress={() => setStep("review")}
            />
          </View>
        </>
      )}

      {step === "review" && (
        <>
          <View style={styles.card}>
            <Row l="You send" r={`${amount} ${token}`} />
            <Row l="On" r={getChain(chain)?.name ?? chain} />
            <Row
              l="Recipient gets"
              r={estimate ? `≈ ${estimate} ${currency}` : `— ${currency}`}
            />
            <Row l="To" r={institution?.name ?? ""} />
            <Row l="Name" r={accountName ?? ""} />
            <Row l="Account" r={account} />
          </View>
          <Text style={styles.estimate}>
            Estimate · the final rate locks when you create the order.
          </Text>

          {!isConnected ? (
            <Primary label="Connect wallet" onPress={connect} />
          ) : (
            <Primary label="Create order" onPress={() => void createOrder()} />
          )}
          {offramp.error && <Text style={styles.error}>{offramp.error}</Text>}

          <Secondary label="Back" onPress={() => setStep("recipient")} />
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Order status (funding → settling → complete / error)
// ---------------------------------------------------------------------------

function OrderStatus({
  offramp,
  token,
  currency,
}: {
  offramp: ReturnType<typeof usePaycrestOfframp>;
  token: PaycrestToken;
  currency: PaycrestFiat;
}) {
  const { status, order, error, fund, reset, transferTxHash } = offramp;

  const phase =
    status === "awaiting_funding"
      ? "Fund your order"
      : status === "funding"
        ? "Sending…"
        : status === "settling"
          ? "Paying the recipient…"
          : status === "complete"
            ? "Done 🎉"
            : status === "error"
              ? "Something went wrong"
              : "Working…";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{phase}</Text>

      {order && (
        <View style={styles.card}>
          <Row l="Send exactly" r={`${order.amount} ${token}`} />
          {order.rate && <Row l="Locked rate" r={`${order.rate} ${currency}`} />}
          <Row l="Status" r={order.status} />
          {order.receiveAddress && (
            <Row
              l="Deposit address"
              r={`${order.receiveAddress.slice(0, 6)}…${order.receiveAddress.slice(-4)}`}
            />
          )}
        </View>
      )}

      {status === "awaiting_funding" && (
        <>
          <Text style={styles.estimate}>
            Send {order?.amount} {token} to the provider to complete the
            cash-out. This is the only signature you make.
          </Text>
          <Primary label="Send from wallet" onPress={() => void fund()} />
        </>
      )}

      {(status === "funding" || status === "settling") && (
        <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
      )}

      {transferTxHash && (
        <Text style={styles.estimate}>
          Payment tx {transferTxHash.slice(0, 10)}…
        </Text>
      )}

      {status === "complete" && (
        <Text style={styles.estimate}>
          The recipient has been paid in {currency}. You can start another
          cash-out.
        </Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {(status === "complete" || status === "error") && (
        <Primary label="New cash-out" onPress={reset} />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["compose", "recipient", "review"];
  const labels = { compose: "Amount", recipient: "Recipient", review: "Review" };
  return (
    <View style={styles.steps}>
      {order.map((s) => (
        <Text
          key={s}
          style={[styles.stepChip, step === s && styles.stepChipActive]}
        >
          {labels[s]}
        </Text>
      ))}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ViewProps["children"];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{l}</Text>
      <Text style={styles.rowValue}>{r}</Text>
    </View>
  );
}

function Primary({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.primary, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function Secondary({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.secondary} onPress={onPress}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2.5), gap: theme.spacing(1.75) },
  title: { color: theme.colors.text, fontSize: 30, fontFamily: theme.serif },
  steps: { flexDirection: "row", gap: theme.spacing(1), marginBottom: theme.spacing(1) },
  stepChip: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  stepChipActive: {
    color: theme.colors.accentFg,
    backgroundColor: theme.colors.accent,
  },
  field: { gap: theme.spacing(0.75) },
  fieldLabel: { color: theme.colors.muted, fontSize: 13 },
  input: {
    color: theme.colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25),
    backgroundColor: theme.colors.surface,
  },
  estimate: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  accountName: { color: theme.colors.ok, fontSize: 15, fontWeight: "600" },
  card: {
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1.25),
    ...theme.shadow,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing(2) },
  rowLabel: { color: theme.colors.muted, fontSize: 14 },
  rowValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  rowButtons: {
    flexDirection: "row",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  pad: { paddingVertical: theme.spacing(2) },
  primary: {
    backgroundColor: theme.colors.btnBg,
    borderRadius: theme.radius.input,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  primaryText: {
    color: theme.colors.btnFg,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.4 },
  secondary: {
    borderRadius: 10,
    padding: theme.spacing(1.5),
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
  },
  secondaryText: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  error: { color: theme.colors.err, fontSize: 13 },
});
