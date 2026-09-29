import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  Building2,
  Calculator,
  ChartColumn,
  Clock,
  FileText,
  Gavel,
  HandCoins,
  Landmark,
  Layers,
  type LucideIcon,
  Printer,
  Receipt,
  Scale,
  TrendingDown,
  Wallet,
} from "lucide-react";

/**
 * A small dimensional icon badge for a section header.
 *
 * The badge is a machined keycap: the `.icon-badge` utility supplies the lit
 * upper-left face, the darker lower/right machined edge, the soft cast shadow
 * onto the section strip, and the recess well, while `.icon-badge-glyph` seats
 * the lucide glyph inside a shallow inner plate so it reads as a physical
 * control embedded in the worksheet rather than a flat outline icon.
 *
 * One fixed upper-left light source is shared by every badge, so the whole
 * workspace is lit consistently. The badge supports the heading — it never
 * overpowers it.
 *
 * Callers pass either a semantic `section` key (the canonical mapping below) or
 * an explicit `icon` name. `label` supplies the accessible name; when omitted
 * the badge is decorative and hidden from assistive technology.
 */

/** Canonical icon per major section, keyed by the section's stable name. */
const SECTION_ICONS = {
  property: Building2,
  primary_inputs: Calculator,
  closing_costs: Receipt,
  hoa_liens: Landmark,
  condition_renovation: Layers,
  hecm: HandCoins,
  capital_gains: Scale,
  market_friction: Clock,
  waterfall: TrendingDown,
  scenarios: ChartColumn,
  kpi: BadgeDollarSign,
  client_view: FileText,
  print: Printer,
  saved_runs: Wallet,
  shortfall: AlertTriangle,
  net_proceeds: Banknote,
  encumbrances: Gavel,
} as const;

export type SectionIconKey = keyof typeof SECTION_ICONS;

/** Explicit lucide icon names accepted in place of a section key. */
const ICON_NAMES = {
  building: Building2,
  calculator: Calculator,
  receipt: Receipt,
  landmark: Landmark,
  layers: Layers,
  hand_coins: HandCoins,
  scale: Scale,
  clock: Clock,
  trending_down: TrendingDown,
  chart: ChartColumn,
  badge_dollar: BadgeDollarSign,
  file_text: FileText,
  printer: Printer,
  wallet: Wallet,
  alert: AlertTriangle,
  banknote: Banknote,
  gavel: Gavel,
} as const;

export type SectionIconName = keyof typeof ICON_NAMES;

type SectionIconSize = "sm" | "lg";

interface SectionIconProps {
  /** Canonical section key; ignored when `icon` is provided. */
  section?: SectionIconKey;
  /** Explicit icon name; takes precedence over `section`. */
  icon?: SectionIconName;
  /** `sm` (default) for card headers, `lg` for the dark results panel. */
  size?: SectionIconSize;
  /** Accessible name. Omit for a purely decorative badge. */
  label?: string;
  className?: string;
}

export function SectionIcon({
  section,
  icon,
  size = "sm",
  label,
  className,
}: SectionIconProps) {
  const Glyph: LucideIcon =
    (icon ? ICON_NAMES[icon] : undefined) ??
    (section ? SECTION_ICONS[section] : undefined) ??
    Layers;

  return (
    <span
      className={cn("icon-badge", size === "lg" && "icon-badge-lg", className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <span className="icon-badge-glyph">
        <Glyph aria-hidden="true" />
      </span>
    </span>
  );
}
