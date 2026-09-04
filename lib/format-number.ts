export type NumberType =
  | "fiat_value"
  | "stable_value"
  | "token_amount"
  | "token_price"
  | "percent"
  | "ratio";

export type NumberContext = "compact" | "detailed";
export type SignMode = "auto" | "always" | "never";

export type FormatOptions = {
  type: NumberType;
  context?: NumberContext;
  tokenPriceUsd?: number;
  sign?: SignMode;
};

export type FormatResult = {
  display: string;
  raw: string;
  ariaLabel: string;
  isTiny: boolean;
  isSubscript: boolean;
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

function decimalString(value: number) {
  const stringValue = value.toString();
  if (!/[eE]/.test(stringValue)) return stringValue;
  const [coefficient, exponentText] = stringValue.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const sign = coefficient.startsWith("-") ? "-" : "";
  const digits = coefficient.replace("-", "").replace(".", "");
  const decimalIndex = coefficient.replace("-", "").indexOf(".");
  const initialIntegerLength = decimalIndex === -1 ? digits.length : decimalIndex;
  const targetIndex = initialIntegerLength + exponent;
  if (targetIndex <= 0) return `${sign}0.${"0".repeat(-targetIndex)}${digits}`;
  if (targetIndex >= digits.length) return `${sign}${digits}${"0".repeat(targetIndex - digits.length)}`;
  return `${sign}${digits.slice(0, targetIndex)}.${digits.slice(targetIndex)}`;
}

function signFor(value: number, mode: SignMode = "auto") {
  if (value === 0 || mode === "never") return "";
  if (value < 0) return "-";
  return mode === "always" ? "+" : "";
}

function baseResult(value: number, display: string, extras?: Partial<FormatResult>): FormatResult {
  const raw = decimalString(value);
  return { display, raw, ariaLabel: display, isTiny: false, isSubscript: false, ...extras };
}

function zeroResult(type: NumberType): FormatResult {
  const display = {
    fiat_value: "$0.00", stable_value: "$0.00", token_amount: "0",
    token_price: "$0.00", percent: "0.00%", ratio: "0x",
  }[type];
  return { display, raw: "0", ariaLabel: display, isTiny: false, isSubscript: false };
}

function abbreviation(abs: number) {
  const suffixes = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const;
  const match = suffixes.find(([threshold]) => abs >= threshold);
  if (!match) return null;
  const value = (abs / match[0]).toFixed(1).replace(/\.0$/, "");
  return `${value}${match[1]}`;
}

function leadingZeros(abs: number) {
  if (abs >= 1) return 0;
  const decimal = decimalString(abs).split(".")[1] ?? "";
  return decimal.match(/^0*/)?.[0].length ?? 0;
}

function subscriptValue(abs: number, digits: number) {
  const zeros = leadingZeros(abs);
  const precision = zeros + digits;
  const fixed = abs.toFixed(precision);
  const significant = fixed.split(".")[1]?.slice(zeros, precision) ?? "";
  const marker = String(zeros).split("").map((digit) => SUBSCRIPT[digit]).join("");
  return { display: `0.0${marker}${significant}`, expanded: fixed };
}

export function formatNumber(input: number | null | undefined, options: FormatOptions): FormatResult {
  if (input == null || !Number.isFinite(input)) {
    return { display: "--", raw: "", ariaLabel: "no data", isTiny: false, isSubscript: false };
  }

  const value = Object.is(input, -0) ? 0 : input;
  if (value === 0) return zeroResult(options.type);

  const context = options.context ?? "compact";
  const abs = Math.abs(value);
  const sign = signFor(value, options.sign);

  if (options.type === "fiat_value" || options.type === "stable_value") {
    if (abs < 0.01) return baseResult(value, `${sign}<$0.01`, { isTiny: true });
    const short = context === "compact" ? abbreviation(abs) : null;
    const core = short ?? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return baseResult(value, `${sign}$${core}`);
  }

  if (options.type === "percent") {
    if (abs < 0.01) return baseResult(value, `${sign}<0.01%`, { isTiny: true });
    const decimals = abs >= 1000 ? (context === "compact" ? 0 : 1) : abs >= 100 ? 1 : 2;
    const core = abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return baseResult(value, `${sign}${core}%`);
  }

  if (options.type === "ratio") {
    if (abs < 0.01) return baseResult(value, `${sign}<0.01x`, { isTiny: true });
    const core = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return baseResult(value, `${sign}${core}x`);
  }

  if (leadingZeros(abs) >= 3) {
    const tiny = subscriptValue(abs, context === "compact" ? 2 : 4);
    const prefix = options.type === "token_price" ? "$" : "";
    return baseResult(value, `${sign}${prefix}${tiny.display}`, {
      ariaLabel: `${sign}${prefix}${tiny.expanded}`,
      isSubscript: true,
    });
  }

  if (options.type === "token_price") {
    const decimals = abs >= 1000 ? 2 : abs >= 100 ? (context === "compact" ? 0 : 2) : abs >= 1 ? (context === "compact" ? 1 : 3) : context === "compact" ? 3 : 5;
    const core = abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return baseResult(value, `${sign}$${core}`);
  }

  const threshold = context === "compact" ? 0.01 : 0.0001;
  const price = options.tokenPriceUsd && options.tokenPriceUsd > 0 ? options.tokenPriceUsd : 1;
  const decimals = options.tokenPriceUsd == null || options.tokenPriceUsd <= 0
    ? 4
    : Math.max(0, Math.min(context === "compact" ? 6 : 12, Math.ceil(-Math.log10(threshold / price))));
  const rounded = Number(abs.toFixed(decimals));
  if (rounded === 0) {
    const minimum = decimals > 0 ? (1 / 10 ** decimals).toFixed(decimals) : "1";
    return baseResult(value, `${sign}<${minimum}`, { isTiny: true });
  }
  const short = context === "compact" ? abbreviation(abs) : null;
  const core = short ?? abs.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return baseResult(value, `${sign}${core}`);
}
