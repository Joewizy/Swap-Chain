import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import {
  ACTIVE_CHAINS,
  getChain,
  type ChainId,
} from "@railglide/shared/network";
import { useSession } from "@/store/session";
import { useWalletAuth } from "@/wallet/useWalletAuth";
import { usePaycrestOnramp } from "@/wallet/usePaycrestOnramp";
import { getInstitutions, getRate, verifyAccount } from "@/api/paycrest";
import {
  buildPaycrestReference,
  PAYCREST_CHAIN_IDS,
  PAYCREST_FIAT,
  type PaycrestFiat,
  type PaycrestInstitution,
  type PaycrestToken,
} from "@/rails/paycrest";
import { ApiError } from "@/api/client";
import {
  Field,
  Intro,
  PageTitle,
  Primary,
  Row,
  Secondary,
  formStyles as f,
} from "@/components/form";
import { Picker } from "@/components/Picker";
import { clipboardAvailable, copyToClipboard } from "@/lib/clipboard";
import {
  chainOptions,
  currencyOptions,
  institutionOptions,
  tokenOptions,
} from "@/components/options";
import { theme } from "@/theme";

const TOKENS: PaycrestToken[] = ["USDC", "USDT"];

function buyChains(): ChainId[] {
  return PAYCREST_CHAIN_IDS.filter((id) =>
    ACTIVE_CHAINS.some((c) => c.id === id)
  );
}

type Step = "compose" | "recipient" | "review";

export function BuyScreen() {
  const launch = useSession((s) => s.pendingLaunch);
  const setPendingLaunch = useSession((s) => s.setPendingLaunch);
  const resumeOrder = useSession((s) => s.resumeOrder);
  const setResumeOrder = useSession((s) => s.setResumeOrder);
  const { address, isConnected } = useAccount();
  const { connect } = useWalletAuth();
  const onramp = usePaycrestOnramp();

  const chains = useMemo(buyChains, []);
  const [step, setStep] = useState<Step>("compose");

  const [amount, setAmount] = useState(launch?.amount ?? "");
  const [token, setToken] = useState<PaycrestToken>("USDC");
  const [chain, setChain] = useState<ChainId>(chains[0]);
  const [currency, setCurrency] = useState<PaycrestFiat>(
    (launch?.currency as PaycrestFiat) &&
      PAYCREST_FIAT.includes(launch!.currency as PaycrestFiat)
      ? (launch!.currency as PaycrestFiat)
      : "NGN"
  );
  const [rate, setRate] = useState<number | null>(null);

  // Receiving wallet — defaults to the connected wallet, but the user can paste
  // any address to receive the crypto elsewhere.
  const [recipient, setRecipient] = useState("");
  const recipientValid = isAddress(recipient);

  const [institutions, setInstitutions] = useState<PaycrestInstitution[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [institution, setInstitution] = useState<PaycrestInstitution | null>(
    null
  );
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  useEffect(() => () => setPendingLaunch(null), [setPendingLaunch]);

  // Resume a Buy order tapped in History.
  useEffect(() => {
    if (resumeOrder?.direction === "onramp") {
      void onramp.resume(resumeOrder.id);
      setResumeOrder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeOrder]);

  // Prefill the receiving wallet with the connected address once, without
  // clobbering an address the user has since typed.
  useEffect(() => {
    if (address && !recipient) setRecipient(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    getRate(currency, token)
      .then((r) => !cancelled && setRate(r.rate))
      .catch(() => !cancelled && setRate(null));
    return () => {
      cancelled = true;
    };
  }, [currency, token]);

  useEffect(() => {
    let cancelled = false;
    setInstitutions([]);
    setProvidersError(null);
    getInstitutions(currency)
      .then((list) => !cancelled && setInstitutions(list))
      .catch((err) => {
        if (cancelled) return;
        setInstitutions([]);
        setProvidersError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load providers — check that the app can reach the backend."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  // Fiat in → crypto out: divide the fiat amount by the unit rate.
  const estimate =
    rate && Number(amount) > 0
      ? (Number(amount) / rate).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })
      : null;

  const doVerify = async () => {
    if (!institution || !account.trim()) return;
    setVerifying(true);
    setRecipientError(null);
    setAccountName(null);
    try {
      setAccountName(await verifyAccount(institution.code, account.trim()));
    } catch (err) {
      setRecipientError(
        err instanceof ApiError ? err.message : "Couldn't verify that account."
      );
    } finally {
      setVerifying(false);
    }
  };

  const createOrder = async () => {
    if (!institution || !accountName || !recipientValid) return;
    try {
      await onramp.onramp({
        toChain: chain,
        token,
        amount: amount.trim(),
        fiatCurrency: currency,
        refundAccount: {
          institution: institution.code,
          accountIdentifier: account.trim(),
          accountName,
        },
        recipientAddress: recipient as `0x${string}`,
        reference: buildPaycrestReference("onramp", recipient),
      });
    } catch {
      // surfaced via onramp.error
    }
  };

  // Full reset back to a blank compose form — used by "New order" so it never
  // lands on the previous order's review/settling state.
  const newOrder = () => {
    onramp.reset();
    setStep("compose");
    setAmount("");
    setAccount("");
    setAccountName(null);
    setInstitution(null);
    setRecipientError(null);
  };

  if (onramp.status !== "idle") {
    return (
      <OnrampStatus
        onramp={onramp}
        token={token}
        chain={chain}
        recipient={recipient}
        onNewOrder={newOrder}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageTitle>Buy</PageTitle>
      <Intro>Pay with local currency, receive USDC or USDT in your wallet.</Intro>

      {step === "compose" && (
        <>
          <Field label={`Amount (${currency})`}>
            <TextInput
              style={f.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.muted}
            />
          </Field>
          <Field label="Pay with">
            <Picker
              title="Pay with"
              value={currency}
              options={currencyOptions(PAYCREST_FIAT)}
              onChange={(c) => setCurrency(c as PaycrestFiat)}
            />
          </Field>
          <Field label="Receive token">
            <Picker
              title="Receive token"
              value={token}
              options={tokenOptions(TOKENS)}
              onChange={(t) => setToken(t as PaycrestToken)}
            />
          </Field>
          <Field label="On chain">
            <Picker
              title="Receive on"
              value={chain}
              options={chainOptions(chains)}
              onChange={(c) => setChain(c as ChainId)}
            />
          </Field>
          <Text style={f.estimate}>
            {estimate
              ? `≈ ${estimate} ${token}  (rate locks when you create the order)`
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
          <Text style={f.estimate}>
            Your {token} lands in the receiving wallet below. A refund account is
            required in case the order can&apos;t be filled.
          </Text>

          {!isConnected ? (
            <Primary label="Connect wallet" onPress={connect} />
          ) : (
            <Field label="Receiving wallet">
              <TextInput
                style={[
                  f.input,
                  recipient.length > 0 && !recipientValid && styles.inputError,
                ]}
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="0x…"
                placeholderTextColor={theme.colors.muted}
              />
              {address &&
                recipient.toLowerCase() !== address.toLowerCase() && (
                  <Pressable onPress={() => setRecipient(address)}>
                    <Text style={styles.useConnected}>Use connected wallet</Text>
                  </Pressable>
                )}
              {recipient.length > 0 && !recipientValid && (
                <Text style={f.error}>Enter a valid wallet address.</Text>
              )}
            </Field>
          )}

          <Field label="Refund account — bank / mobile money">
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
          {providersError && <Text style={f.error}>{providersError}</Text>}

          {institution && (
            <>
              <Field label="Account number">
                <TextInput
                  style={f.input}
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
              {recipientError && <Text style={f.error}>{recipientError}</Text>}
            </>
          )}

          <View style={f.rowButtons}>
            <Secondary label="Back" onPress={() => setStep("compose")} />
            <Primary
              label="Review"
              disabled={!accountName || !isConnected || !recipientValid}
              onPress={() => setStep("review")}
            />
          </View>
        </>
      )}

      {step === "review" && (
        <>
          <View style={f.card}>
            <Row l="You pay" r={`${amount} ${currency}`} />
            <Row
              l="You receive"
              r={estimate ? `≈ ${estimate} ${token}` : `— ${token}`}
            />
            <Row l="On" r={getChain(chain)?.name ?? chain} />
            <Row
              l="Wallet"
              r={
                recipient
                  ? `${recipient.slice(0, 6)}…${recipient.slice(-4)}`
                  : ""
              }
            />
            <Row l="Refund to" r={accountName ?? ""} />
          </View>
          <Text style={f.estimate}>
            Estimate · the final rate locks when you create the order.
          </Text>
          <Primary label="Create order" onPress={() => void createOrder()} />
          {onramp.error && <Text style={f.error}>{onramp.error}</Text>}
          <Secondary label="Back" onPress={() => setStep("recipient")} />
        </>
      )}
    </ScrollView>
  );
}

// One tappable field that copies its value to the clipboard. If the native
// clipboard module isn't in this build, it stays a plain (non-copy) row.
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <Pressable
      style={({ pressed }) => [
        styles.copyRow,
        pressed && clipboardAvailable && styles.copyRowPressed,
      ]}
      onPress={() => void copy()}
      disabled={!clipboardAvailable}
    >
      <View style={styles.copyMain}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue} selectable>
          {value}
        </Text>
      </View>
      {clipboardAvailable && (
        <Feather
          name={copied ? "check" : "copy"}
          size={16}
          color={copied ? theme.colors.ok : theme.colors.muted}
        />
      )}
    </Pressable>
  );
}

function OnrampStatus({
  onramp,
  token,
  chain,
  recipient,
  onNewOrder,
}: {
  onramp: ReturnType<typeof usePaycrestOnramp>;
  token: PaycrestToken;
  chain: ChainId;
  recipient: string;
  onNewOrder: () => void;
}) {
  const { status, order, error, depositSent, markSent } = onramp;

  // --- Success: the hero moment, with delivery details --------------------
  if (status === "complete") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.successCard}>
          <View style={styles.successBadge}>
            <Feather name="check" size={24} color={theme.colors.surface} />
          </View>
          <Text style={styles.successEyebrow}>Transfer complete</Text>
          <Text style={styles.successAmount}>
            {order?.amount ?? ""} {token}
          </Text>
          <View style={styles.receivedBox}>
            <Text style={styles.receivedLabel}>RECEIVED AT</Text>
            <Text style={styles.receivedAddr} selectable>
              {recipient}
            </Text>
            <Text style={styles.receivedSub}>
              {token} on {getChain(chain)?.name ?? chain}
            </Text>
          </View>
          {order?.txHash && (
            <Text style={styles.txHash}>
              Tx {order.txHash.slice(0, 10)}…{order.txHash.slice(-8)}
            </Text>
          )}
        </View>
        <Primary label="New order" onPress={onNewOrder} />
      </ScrollView>
    );
  }

  // --- Awaiting deposit: details first, then confirm ----------------------
  if (status === "awaiting_deposit" && order) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={f.title}>Send your payment</Text>
        <Text style={f.estimate}>
          Transfer exactly this amount to the account below — tap any field to
          copy it. Your {token} arrives once we confirm the payment.
        </Text>
        <View style={styles.copyCard}>
          <CopyRow
            label="Amount"
            value={`${order.amountToTransfer} ${order.depositCurrency ?? ""}`.trim()}
          />
          <CopyRow
            label="Account number"
            value={order.depositAccountIdentifier ?? ""}
          />
          {order.depositAccountName && (
            <CopyRow label="Account name" value={order.depositAccountName} />
          )}
          {order.depositInstitution && (
            <CopyRow label="Bank / provider" value={order.depositInstitution} />
          )}
        </View>

        {depositSent ? (
          <>
            <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
            <Text style={f.estimate}>
              Confirming your payment — this can take a few minutes.
            </Text>
          </>
        ) : (
          <>
            <Primary label="I've sent the payment" onPress={markSent} />
            <Text style={f.estimate}>
              We&apos;ll only start checking once you&apos;ve paid — no need to
              keep this screen open the whole time.
            </Text>
          </>
        )}
        {error && <Text style={f.error}>{error}</Text>}
      </ScrollView>
    );
  }

  // --- Settling / creating / error ---------------------------------------
  const phase =
    status === "settling"
      ? `Delivering your ${token}…`
      : status === "error"
        ? "Something went wrong"
        : "Working…";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={f.title}>{phase}</Text>
      {status === "settling" && (
        <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
      )}
      {error && <Text style={f.error}>{error}</Text>}
      {status === "error" && <Primary label="New order" onPress={onNewOrder} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  accountName: { color: theme.colors.ok, fontSize: 15, fontWeight: "600" },
  inputError: { borderColor: theme.colors.err },
  useConnected: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "600",
    marginTop: theme.spacing(0.75),
  },
  pad: { paddingVertical: theme.spacing(2) },

  // Copyable deposit fields
  copyCard: {
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.75),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  copyRowPressed: { backgroundColor: theme.colors.bgSoft },
  copyMain: { flex: 1, gap: 3, marginRight: theme.spacing(1.5) },
  copyLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  copyValue: { color: theme.colors.text, fontSize: 17, fontWeight: "600" },

  // Success card
  successCard: {
    alignItems: "center",
    borderRadius: theme.radius.cardLg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing(3),
    gap: theme.spacing(0.75),
    ...theme.shadow,
  },
  successBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.ok,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing(0.5),
  },
  successEyebrow: {
    color: theme.colors.ok,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  successAmount: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 40,
    lineHeight: 46,
  },
  receivedBox: {
    alignSelf: "stretch",
    marginTop: theme.spacing(1.5),
    borderRadius: theme.radius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing(1.75),
    gap: 4,
  },
  receivedLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  receivedAddr: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  receivedSub: { color: theme.colors.muted, fontSize: 12 },
  txHash: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing(0.5),
  },
});
