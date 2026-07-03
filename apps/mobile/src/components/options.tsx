// Picker option builders with branded logos, shared by the flow screens.
import { Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getChain, type ChainId } from "@railglide/shared/network";
import type { PaycrestInstitution } from "@/rails/paycrest";
import type { PickerOption } from "./Picker";
import { TokenLogo, ChainLogo } from "./Logo";
import { theme } from "@/theme";

export const tokenOptions = (tokens: readonly string[]): PickerOption[] =>
  tokens.map((t) => ({
    value: t,
    label: t,
    icon: <TokenLogo symbol={t} size={24} />,
  }));

export const chainOptions = (chains: readonly ChainId[]): PickerOption[] =>
  chains.map((c) => ({
    value: c,
    label: getChain(c)?.name ?? c,
    icon: <ChainLogo id={c} size={24} />,
  }));

const FIAT: Record<string, { flag: string; name: string }> = {
  NGN: { flag: "🇳🇬", name: "Nigerian Naira" },
  KES: { flag: "🇰🇪", name: "Kenyan Shilling" },
  GHS: { flag: "🇬🇭", name: "Ghanaian Cedi" },
  UGX: { flag: "🇺🇬", name: "Ugandan Shilling" },
  XOF: { flag: "🇧🇯", name: "West African CFA Franc" },
  ZMW: { flag: "🇿🇲", name: "Zambian Kwacha" },
  TZS: { flag: "🇹🇿", name: "Tanzanian Shilling" },
  ZAR: { flag: "🇿🇦", name: "South African Rand" },
};

export const currencyOptions = (fiats: readonly string[]): PickerOption[] =>
  fiats.map((c) => ({
    value: c,
    label: FIAT[c]?.name ?? c,
    sublabel: c,
    icon: <Text style={{ fontSize: 22 }}>{FIAT[c]?.flag ?? "🌍"}</Text>,
  }));

export const institutionOptions = (
  list: PaycrestInstitution[]
): PickerOption[] =>
  list.map((i) => ({
    value: i.code,
    label: i.name,
    sublabel: i.type === "mobile_money" ? "Mobile money" : "Bank",
    icon: (
      <Feather
        name={i.type === "mobile_money" ? "smartphone" : "home"}
        size={20}
        color={theme.colors.muted}
      />
    ),
  }));
