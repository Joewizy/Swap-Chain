import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  createRampOrder,
  getRampCountries,
  getRampQuote,
  getRampOrder,
  type RampCountry,
  type RampFieldSpec,
  type RampOrder,
} from "@/api/chainrails";
import {
  classifyRampStatus,
  isRampPhaseTerminal,
  isValidRampAddress,
  rampTxUrl,
  type RampDestination,
  type RampOrderPhase,
} from "@/rails/chainrails";
import { ApiError } from "@/api/client";
import { pollRampOrder } from "@/lib/rampPoll";
import { useRampOrders } from "@/store/rampOrders";
import {
  Field,
  Intro,
  PageTitle,
  Primary,
  Secondary,
  formStyles as f,
} from "@/components/form";
import { Picker } from "@/components/Picker";
import { PrefixedAmountInput } from "@/components/PrefixedAmountInput";
import { theme } from "@/theme";

// A small crypto amount to probe the corridor's rate with. The rate is amount-
// independent, so this only needs to clear the provider minimum.
const RATE_PROBE_CRYPTO = 10;

/** fiat per 1 USDC, tolerant of both response shapes. */
function quoteRate(q: {
  exchangeRate?: number;
  exchangeRatePerUSD?: number;
}): number {
  return q.exchangeRate ?? q.exchangeRatePerUSD ?? 0;
}

/**
 * ChainrailsBuyFlow — Buy body for chains Paycrest can't reach. The user pays
 * local currency and their USDC is delivered to a pasted address; payment is
 * completed in the provider's hosted checkout (opened in the system browser).
 */
export function ChainrailsBuyFlow({
  destination,
  onBack,
  resumeOrderId,
}: {
  destination: RampDestination;
  onBack: () => void;
  /** When set, load this existing order and show its status (from History). */
  resumeOrderId?: string;
}) {
  const trackedOrders = useRampOrders((s) => s.orders);
  const [countries, setCountries] = useState<RampCountry[]>([]);
  const [countryCode, setCountryCode] = useState("NG");
  const [amount, setAmount] = useState(""); // fiat the user pays
  const [unitRate, setUnitRate] = useState<number | null>(null); // fiat per USDC
  const [fields, setFields] = useState<RampFieldSpec[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [rateLoading, setRateLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [order, setOrder] = useState<RampOrder | null>(null);
  const [phase, setPhase] = useState<RampOrderPhase>("pending");
  // We only poll once the user has opened the checkout; the shared poller then
  // pauses while the app is backgrounded (i.e. while they're paying in Safari)
  // and fires immediately when they return.
  const [polling, setPolling] = useState(false);

  // Load the currency catalogue once.
  useEffect(() => {
    let cancelled = false;
    getRampCountries()
      .then((list) => {
        if (cancelled) return;
        setCountries(list);
        if (!list.some((c) => c.countryCode === "NG") && list[0])
          setCountryCode(list[0].countryCode);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : "Couldn't load countries."
          );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const country = useMemo(
    () => countries.find((c) => c.countryCode === countryCode),
    [countries, countryCode]
  );

  // Probe one quote per country/chain to learn the rate + the provider fields.
  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    setUnitRate(null);
    setRateLoading(true);
    getRampQuote({
      fiatCurrency: country.currency.code,
      cryptoAmount: RATE_PROBE_CRYPTO,
      destinationChain: destination.chainrailsChain,
      countryCode,
    })
      .then((q) => {
        if (!q || cancelled) return;
        if (quoteRate(q) > 0) setUnitRate(quoteRate(q));
        const req = q.paymentChannels?.[0]?.directTransferDetails
          ?.fieldsRequired ?? [];
        setFields(req);
        setFieldValues((prev) => {
          const next = { ...prev };
          for (const fld of req) {
            if (fld.type === "enum" && fld.options?.[0] && !next[fld.key])
              next[fld.key] = fld.options[0].value;
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setRateLoading(false));
    return () => {
      cancelled = true;
    };
  }, [countryCode, country, destination.chainrailsChain]);

  const fiatAmount = Number(amount);
  const estimateUsdc =
    unitRate && fiatAmount > 0 ? fiatAmount / unitRate : null;
  const belowMin =
    !!country && fiatAmount > 0 && fiatAmount < country.currency.minAmount;
  const addressValid = isValidRampAddress(destination.addressKind, address);
  const fieldsComplete = fields.every(
    (fld) => !fld.required || (fieldValues[fld.key]?.trim()?.length ?? 0) > 0
  );
  const canSubmit =
    !!country &&
    fiatAmount > 0 &&
    !!unitRate &&
    !belowMin &&
    addressValid &&
    fieldsComplete &&
    !quoting;

  const submit = async () => {
    if (!country || !unitRate) return;
    // Convert the fiat typed into the crypto amount ChainRails quotes on.
    const cryptoAmount = Number((fiatAmount / unitRate).toFixed(4));
    setQuoting(true);
    setError(null);
    try {
      const q = await getRampQuote({
        fiatCurrency: country.currency.code,
        cryptoAmount,
        destinationChain: destination.chainrailsChain,
        countryCode,
      });
      if (!q)
        throw new Error("No provider can quote this purchase right now.");
      const created = await createRampOrder({
        type: "on-ramp",
        provider: q.provider,
        fiatCurrency: q.fiatCurrency,
        cryptoAmount: q.cryptoAmount,
        destinationChain: destination.chainrailsChain,
        recipientAddress: address.trim(),
        countryCode,
        fields: { ...fieldValues },
      });
      setOrder(created);
      setPhase(classifyRampStatus(created.status));
      // Remember it on-device so it shows in History and can be reopened instead
      // of creating a duplicate.
      void useRampOrders.getState().track({
        id: String(created.id),
        direction: "onramp",
        chainrailsChain: destination.chainrailsChain,
        chainLabel: destination.label,
        cryptoLabel: `${created.cryptoAmount ?? q.cryptoAmount} ${
          created.cryptoCurrency ?? "USDC"
        }`,
        fiatLabel: `${(
          created.fiatAmount ?? Number(amount) ?? 0
        ).toLocaleString("en-US")} ${created.fiatCurrency ?? country.currency.code}`,
        address: address.trim(),
        widgetUrl: created.widgetUrl,
        status: created.status,
        createdAt: Date.now(),
      });
      // Don't auto-open the checkout — it's jarring. The user taps "Open
      // checkout to pay" themselves, which also starts the status polling.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the order."
      );
    } finally {
      setQuoting(false);
    }
  };

  const orderId = order?.id;

  // Optional immediate check, and make sure the background cadence is running.
  const checkNow = async () => {
    if (orderId == null) return;
    setPolling(true);
    try {
      const data = await getRampOrder(orderId);
      setOrder(data);
      setPhase(classifyRampStatus(data.status));
      if (data.status)
        void useRampOrders.getState().setStatus(String(data.id), data.status);
    } catch {
      /* the poller retries */
    }
  };

  // Poll only after checkout is opened. The shared poller polls immediately,
  // backs off toward 30s, pauses while the app is backgrounded, and stops at a
  // terminal state — keyed on the order id so refreshing it doesn't re-arm it.
  useEffect(() => {
    if (orderId == null || !polling) return;
    const handle = pollRampOrder(orderId, {
      onUpdate: (data) => {
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
        if (data.status)
          void useRampOrders.getState().setStatus(String(data.id), data.status);
      },
      onSettled: (data, settledPhase) => {
        if (data) {
          setOrder(data);
          if (data.status)
            void useRampOrders
              .getState()
              .setStatus(String(data.id), data.status);
        }
        setPhase(settledPhase);
      },
    });
    return () => handle.stop();
  }, [orderId, polling]);

  // Resume an existing order from History — load it and show its status instead
  // of the compose form. Poll on mount since it may already be paid.
  useEffect(() => {
    if (!resumeOrderId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getRampOrder(resumeOrderId);
        if (cancelled) return;
        setOrder(data);
        setPhase(classifyRampStatus(data.status));
        setPolling(true);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : "Couldn't load this order."
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeOrderId]);

  // ----- Order created: checkout + live status ----------------------------
  if (order) {
    const done = isRampPhaseTerminal(phase);
    const failed = phase === "expired" || phase === "failed";
    // Prefer the stored record's labels — a resumed order has an empty form.
    const rec = trackedOrders.find((o) => o.id === String(order.id));
    const symbol = country?.currency.symbol ?? "$";
    const receiveUsdc = order.cryptoAmount ?? estimateUsdc ?? 0;
    const receiveLabel = rec?.cryptoLabel
      ? `≈ ${rec.cryptoLabel}`
      : `≈ ${receiveUsdc.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })} ${order.cryptoCurrency ?? "USDC"}`;
    const payLabel =
      rec?.fiatLabel ??
      `${symbol}${(Number(amount) || 0).toLocaleString("en-US")}`;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <PageTitle>Buy</PageTitle>
        {phase === "completed" ? (
          <SuccessCard order={order} destination={destination} />
        ) : failed ? (
          <View style={styles.centerCard}>
            <View style={[styles.iconRing, styles.iconRingErr]}>
              <Feather name="alert-circle" size={26} color={theme.colors.err} />
            </View>
            <Text style={styles.centerTitle}>
              {phase === "expired" ? "Payment window closed" : "Order didn't go through"}
            </Text>
            <Text style={styles.centerSub}>
              If you didn&apos;t pay, nothing was charged — you can start a new
              order.
            </Text>
          </View>
        ) : phase === "processing" ? (
          // Payment received — provider is settling/bridging the USDC. No more
          // checkout; just reassure and let the poller flip us to completed.
          <View style={styles.centerCard}>
            <View style={styles.iconRing}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
            <Text style={styles.centerTitle}>Payment received</Text>
            <Text style={styles.centerSub}>
              Delivering your USDC to your wallet on {destination.label}. You can
              close this — it&apos;ll keep going.
            </Text>
          </View>
        ) : (
          <>
            <OrderSummary
              pay={payLabel}
              receive={receiveLabel}
              chain={destination.label}
              address={order.recipientAddress ?? rec?.address ?? address}
            />

            {order.widgetUrl && (
              <>
                <Primary
                  label="Open checkout to pay"
                  onPress={() => {
                    setPolling(true);
                    void Linking.openURL(order.widgetUrl!);
                  }}
                />
                <View style={styles.secureRow}>
                  <Feather name="lock" size={12} color={theme.colors.muted} />
                  <Text style={styles.secureText}>Secure checkout</Text>
                </View>
              </>
            )}

            {polling && (
              <>
                <View style={styles.statusRow}>
                  <ActivityIndicator color={theme.colors.accent} />
                  <Text style={f.estimate}>
                    Waiting for payment
                  </Text>
                </View>
                <Pressable
                  onPress={() => void checkNow()}
                  hitSlop={8}
                  style={styles.linkBtn}
                >
                  <Text style={styles.linkText}>Check status now</Text>
                </Pressable>
              </>
            )}
          </>
        )}
        <Text style={styles.orderRef}>Order #{order.id}</Text>
        <Secondary label={done ? "New order" : "Back"} onPress={onBack} />
      </ScrollView>
    );
  }

  // ----- Resuming from History: don't flash the compose form while loading ---
  if (resumeOrderId) {
    return (
      <View style={styles.resumeLoading}>
        {error ? (
          <Text style={f.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={theme.colors.accent} />
        )}
        <Secondary label="Back" onPress={onBack} />
      </View>
    );
  }

  // ----- Compose form ------------------------------------------------------
  const symbol = country?.currency.symbol ?? "$";
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageTitle>Buy</PageTitle>
      <Intro>{`Pay with local currency, receive USDC on ${destination.label}.`}</Intro>

      <Field label="You pay">
        <PrefixedAmountInput amount={amount} onChange={setAmount} prefix={symbol} />
      </Field>
      {estimateUsdc !== null && (
        <Text style={f.estimate}>
          ≈ {estimateUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
          USDC (rate locks when you create the order)
        </Text>
      )}
      {belowMin && country && (
        <Text style={f.error}>
          Minimum is {country.currency.minAmount.toLocaleString()}{" "}
          {country.currency.code}.
        </Text>
      )}
      {!rateLoading && country && !unitRate && (
        <Text style={f.error}>
          Couldn&apos;t load a live rate for {destination.label} in{" "}
          {country.currency.code} right now.
        </Text>
      )}

      <Field label="Pay with">
        <Picker
          title="Pay with"
          searchable
          placeholder={loading ? "Loading…" : "Select currency"}
          value={countryCode}
          options={countries.map((c) => ({
            value: c.countryCode,
            label: c.currency.name || c.currency.code,
            sublabel: `${c.currency.code} · ${c.name}`,
          }))}
          onChange={setCountryCode}
        />
      </Field>

      <Field label={`Receive USDC on ${destination.label}`}>
        <TextInput
          style={[
            f.input,
            address.length > 0 && !addressValid && styles.inputError,
          ]}
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={`Your ${destination.label} address`}
          placeholderTextColor={theme.colors.muted}
        />
        {address.length > 0 && !addressValid && (
          <Text style={f.error}>
            That doesn&apos;t look like a valid {destination.label} address.
          </Text>
        )}
      </Field>

      {/* Provider fields the order requires (bank dropdown, phone, account). */}
      {fields.map((fld) => (
        <Field key={fld.key} label={fld.label}>
          {fld.type === "enum" ? (
            <Picker
              title={fld.label}
              searchable
              value={fieldValues[fld.key]}
              options={(fld.options ?? []).map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              onChange={(v) =>
                setFieldValues((p) => ({ ...p, [fld.key]: v }))
              }
            />
          ) : (
            <TextInput
              style={f.input}
              value={fieldValues[fld.key] ?? ""}
              onChangeText={(t) =>
                setFieldValues((p) => ({ ...p, [fld.key]: t }))
              }
              keyboardType={fld.type === "phone" ? "phone-pad" : "default"}
              placeholder={fld.label}
              placeholderTextColor={theme.colors.muted}
            />
          )}
        </Field>
      ))}

      {error && <Text style={f.error}>{error}</Text>}

      <View style={f.rowButtons}>
        <Secondary label="Back" onPress={onBack} />
        <Primary
          label={quoting ? "Getting quote…" : "Continue"}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </ScrollView>
  );
}

/** Order summary shown on the checkout screen so the user isn't paying blind. */
function OrderSummary({
  pay,
  receive,
  chain,
  address,
}: {
  pay: string;
  receive: string;
  chain: string;
  address: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <SummaryRow label="You pay" value={pay} />
      <SummaryRow label="You receive" value={receive} accent />
      <SummaryRow label="On" value={chain} />
      {address ? (
        <SummaryRow
          label="To"
          value={`${address.slice(0, 6)}…${address.slice(-4)}`}
        />
      ) : null}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[styles.summaryValue, accent && styles.summaryValueAccent]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SuccessCard({
  order,
  destination,
}: {
  order: RampOrder;
  destination: RampDestination;
}) {
  const txUrl = rampTxUrl(destination.chainrailsChain, order.providerTxHash);
  return (
    <View style={styles.successCard}>
      <View style={styles.successBadge}>
        <Feather name="check" size={22} color={theme.colors.surface} />
      </View>
      <Text style={styles.successEyebrow}>Sent</Text>
      <Text style={styles.successAmount}>
        {order.cryptoAmount ?? ""} {order.cryptoCurrency ?? "USDC"}
      </Text>
      <Text style={styles.successSub}>
        {order.cryptoCurrency ?? "USDC"} has been sent to your{" "}
        {destination.label} wallet
        {order.recipientAddress
          ? `\n${order.recipientAddress.slice(0, 6)}…${order.recipientAddress.slice(-4)}`
          : ""}
      </Text>
      {txUrl && (
        <Pressable
          onPress={() => void Linking.openURL(txUrl)}
          hitSlop={8}
          style={styles.txLink}
        >
          <Feather name="external-link" size={14} color={theme.colors.accent} />
          <Text style={styles.txLinkText}>View transaction</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  inputError: { borderColor: theme.colors.err },
  resumeLoading: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    gap: theme.spacing(2),
  },

  // Order summary card on the checkout screen
  summaryCard: {
    padding: theme.spacing(2.25),
    borderRadius: theme.radius.cardLg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1.5),
    ...theme.shadow,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing(2),
  },
  summaryLabel: { color: theme.colors.muted, fontSize: 14 },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  summaryValueAccent: { color: theme.colors.accent },

  // "Secure checkout" reassurance under the primary button
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -theme.spacing(0.5),
  },
  secureText: {
    color: theme.colors.muted,
    fontSize: 12.5,
    fontWeight: "500",
  },

  // Lighter, text-only secondary action
  linkBtn: { alignSelf: "center", paddingVertical: theme.spacing(0.5) },
  linkText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1),
    paddingVertical: theme.spacing(1),
  },
  orderRef: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing(0.5),
  },
  centerCard: {
    alignItems: "center",
    gap: theme.spacing(0.75),
    paddingVertical: theme.spacing(2),
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing(0.5),
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  iconRingErr: { backgroundColor: "#FDF2F0", borderColor: "#F5C4BC" },
  centerTitle: {
    color: theme.colors.text,
    fontFamily: theme.serif,
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center",
  },
  centerSub: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 300,
  },
  successCard: {
    alignItems: "center",
    borderRadius: theme.radius.cardLg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing(3),
    gap: theme.spacing(0.5),
    ...theme.shadow,
  },
  successBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    fontSize: 34,
    lineHeight: 40,
  },
  successSub: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  txLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: theme.spacing(1),
  },
  txLinkText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
});
