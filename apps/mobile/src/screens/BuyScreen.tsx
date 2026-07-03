import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
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
  PAYCREST_CHAIN_IDS,
  PAYCREST_FIAT,
  type PaycrestFiat,
  type PaycrestInstitution,
  type PaycrestToken,
} from "@/rails/paycrest";
import { ApiError } from "@/api/client";
import {
  Field,
  Primary,
  Row,
  Secondary,
  Segmented,
  formStyles as f,
} from "@/components/form";
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

  const [institutions, setInstitutions] = useState<PaycrestInstitution[]>([]);
  const [search, setSearch] = useState(launch?.institutionName ?? "");
  const [institution, setInstitution] = useState<PaycrestInstitution | null>(
    null
  );
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  useEffect(() => () => setPendingLaunch(null), [setPendingLaunch]);

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
    getInstitutions(currency)
      .then((list) => !cancelled && setInstitutions(list))
      .catch(() => !cancelled && setInstitutions([]));
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

  const filtered = institutions.filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase())
  );

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
    if (!institution || !accountName || !address) return;
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
        recipientAddress: address as `0x${string}`,
      });
    } catch {
      // surfaced via onramp.error
    }
  };

  if (onramp.status !== "idle") {
    return <OnrampStatus onramp={onramp} token={token} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={f.estimate}>Buy crypto with local currency.</Text>

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
            <Segmented
              options={PAYCREST_FIAT as unknown as string[]}
              value={currency}
              onChange={(c) => setCurrency(c as PaycrestFiat)}
            />
          </Field>
          <Field label="Receive token">
            <Segmented
              options={TOKENS}
              value={token}
              onChange={(t) => setToken(t as PaycrestToken)}
            />
          </Field>
          <Field label="On chain">
            <Segmented
              options={chains}
              value={chain}
              labels={chains.map((c) => getChain(c)?.name ?? c)}
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
            Your {token} lands in your connected wallet. A refund account is
            required in case the order can&apos;t be filled.
          </Text>

          {!isConnected ? (
            <Primary label="Connect wallet" onPress={connect} />
          ) : (
            <View style={f.card}>
              <Row
                l="Receiving wallet"
                r={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""}
              />
            </View>
          )}

          <Field label="Refund account — bank / mobile money">
            <TextInput
              style={f.input}
              value={search}
              onChangeText={(t) => {
                setSearch(t);
                setInstitution(null);
                setAccountName(null);
              }}
              placeholder="Search provider…"
              placeholderTextColor={theme.colors.muted}
            />
          </Field>

          {!institution && (
            <View style={styles.instList}>
              {institutions.length === 0 && (
                <ActivityIndicator color={theme.colors.accent} />
              )}
              {filtered.slice(0, 8).map((i) => (
                <Pressable
                  key={i.code}
                  style={styles.instRow}
                  onPress={() => {
                    setInstitution(i);
                    setSearch(i.name);
                  }}
                >
                  <Text style={styles.instName}>{i.name}</Text>
                  <Text style={styles.instType}>
                    {i.type === "mobile_money" ? "mobile" : "bank"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

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
              disabled={!accountName || !isConnected}
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
              r={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""}
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

function OnrampStatus({
  onramp,
  token,
}: {
  onramp: ReturnType<typeof usePaycrestOnramp>;
  token: PaycrestToken;
}) {
  const { status, order, error, reset } = onramp;
  const phase =
    status === "awaiting_deposit"
      ? "Send your payment"
      : status === "settling"
        ? `Delivering your ${token}…`
        : status === "complete"
          ? "Done 🎉"
          : status === "error"
            ? "Something went wrong"
            : "Working…";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={f.title}>{phase}</Text>

      {status === "awaiting_deposit" && order && (
        <>
          <Text style={f.estimate}>
            Transfer exactly this amount to the account below. Your {token}{" "}
            arrives once the payment is confirmed.
          </Text>
          <View style={f.card}>
            <Row l="Amount" r={`${order.amountToTransfer} ${order.depositCurrency ?? ""}`} />
            <Row l="Bank / provider" r={order.depositInstitution ?? ""} />
            <Row l="Account" r={order.depositAccountIdentifier ?? ""} />
            <Row l="Account name" r={order.depositAccountName ?? ""} />
          </View>
          <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
          <Text style={f.estimate}>Waiting for your payment…</Text>
        </>
      )}

      {status === "settling" && (
        <ActivityIndicator color={theme.colors.accent} style={styles.pad} />
      )}

      {status === "complete" && (
        <Text style={f.estimate}>
          Your {token} has been delivered to your wallet.
        </Text>
      )}

      {error && <Text style={f.error}>{error}</Text>}

      {(status === "complete" || status === "error") && (
        <Primary label="New order" onPress={reset} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  instList: { gap: theme.spacing(0.5) },
  instRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing(1.5),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  instName: { color: theme.colors.text, fontSize: 14, flex: 1 },
  instType: { color: theme.colors.muted, fontSize: 12 },
  accountName: { color: "#34D399", fontSize: 15, fontWeight: "600" },
  pad: { paddingVertical: theme.spacing(2) },
});
