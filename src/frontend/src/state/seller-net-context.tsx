import {
  CALCULATOR_VERSION,
  type ConditionTier,
  type MortgagePayoffMode,
  type ProvenancedNumber,
  SELLER_NET_CONFIG,
  type Section121Status,
  type SellerNetInput,
  type SellerNetResult,
  type ValidationResult,
  calculateSellerNetWaterfall,
  defaultAssumption,
  isCalculable,
  unknownField,
  validateInput,
} from "@/lib/seller-net";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * The shared work-surface state: the current input draft, its provenance, the
 * property identifier, and the derived result.
 *
 * The draft starts with every required field UNKNOWN — no fake sample values.
 * Only the canonical default assumptions (escrow/title/transfer rates, recording
 * fees, warranty) are pre-filled, and they are labelled DEFAULT_ASSUMPTION.
 */

/** The 22 provenanced fields of SellerNetInput, keyed by field name. */
export type ProvenancedFieldKey = {
  [K in keyof SellerNetInput]: SellerNetInput[K] extends ProvenancedNumber
    ? K
    : never;
}[keyof SellerNetInput];

export type ProvenancedFields = Record<ProvenancedFieldKey, ProvenancedNumber>;

/** Raw string drafts, one per provenanced field, so typing is never lossy. */
export type FieldDrafts = Record<ProvenancedFieldKey, string>;

function initialFields(): ProvenancedFields {
  return {
    basePrice: unknownField(),
    manualAdjustedPrice: unknownField(),
    listingCommissionRateBps: unknownField(),
    buyerCommissionRateBps: unknownField(),
    escrowRateBps: defaultAssumption(SELLER_NET_CONFIG.escrowRateBps),
    titleRateBps: defaultAssumption(SELLER_NET_CONFIG.titleRateBps),
    transferTaxRateBps: defaultAssumption(SELLER_NET_CONFIG.transferTaxRateBps),
    recordingFees: defaultAssumption(SELLER_NET_CONFIG.recordingFees),
    homeWarranty: defaultAssumption(SELLER_NET_CONFIG.homeWarranty),
    annualPropertyTax: unknownField(),
    taxDaysElapsed: unknownField(),
    mortgageBalance: unknownField(),
    mortgageRateBps: unknownField(),
    mortgageMonthsRemaining: unknownField(),
    hoaPayoff: unknownField(),
    liensJudgments: unknownField(),
    stagingPhotoCost: unknownField(),
    sellerConcessionsToBuyer: unknownField(),
    repairsCost: unknownField(),
    renovationCost: unknownField(),
    hecmInitialBalance: unknownField(),
    hecmCurrentRateBps: unknownField(),
    hecmLifetimeCapBps: unknownField(),
    hecmMonthsElapsed: unknownField(),
    originalPurchasePrice: unknownField(),
    capitalImprovements: unknownField(),
    estimatedCapitalGainsTaxRateBps: unknownField(),
    monthlyCarryingCost: unknownField(),
    pctExpectedDom: unknownField(),
    pctExpectedDiscountPct: unknownField(),
  };
}

function initialDrafts(fields: ProvenancedFields): FieldDrafts {
  const drafts = {} as FieldDrafts;
  for (const key of Object.keys(fields) as ProvenancedFieldKey[]) {
    const field = fields[key];
    drafts[key] = field.value === null ? "" : String(field.value);
  }
  return drafts;
}

/** Parse a raw draft into a number, or `null` when it is not a usable value. */
export function parseDraft(raw: string): number | null {
  const trimmed = raw.trim().replace(/[$,%\s]/g, "");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Derive the EXACT effective inputs the calculator uses, so a saved snapshot
 * replays to identical outputs.
 *
 * In VERIFIED_PAYOFF mode the calculator ignores mortgageRateBps and
 * mortgageMonthsRemaining entirely, so the snapshot stores the effective payoff
 * values (rate 0, months 0) rather than unused raw inputs. The calculator's
 * public signature is unchanged — this only normalizes what gets persisted.
 */
export function deriveEffectiveInput(input: SellerNetInput): SellerNetInput {
  if (input.isHecm === true || input.mortgagePayoffMode !== "VERIFIED_PAYOFF") {
    return input;
  }
  return {
    ...input,
    mortgageRateBps: { value: 0, provenance: "USER_PROVIDED" },
    mortgageMonthsRemaining: { value: 0, provenance: "USER_PROVIDED" },
  };
}

export interface SellerNetContextValue {
  /** Property / case identifier that labels the run. */
  propertyId: string;
  setPropertyId: (value: string) => void;

  /** Raw string drafts, keyed by field. */
  drafts: FieldDrafts;
  /** Provenanced values derived from the drafts. */
  fields: ProvenancedFields;
  /** Set a field from a raw string draft; provenance becomes USER_PROVIDED. */
  setField: (key: ProvenancedFieldKey, raw: string) => void;
  /** Reset one field back to UNKNOWN. */
  clearField: (key: ProvenancedFieldKey) => void;
  /** Mark a field as an estimate, keeping its current value. */
  markEstimate: (key: ProvenancedFieldKey) => void;
  /** Mark a field as a verified payoff, keeping its current value. */
  markVerified: (key: ProvenancedFieldKey) => void;

  conditionTier: ConditionTier;
  setConditionTier: (tier: ConditionTier) => void;
  mortgagePayoffMode: MortgagePayoffMode;
  setMortgagePayoffMode: (mode: MortgagePayoffMode) => void;
  /** Whether the property carries a HECM / reverse mortgage. */
  isHecm: boolean;
  setIsHecm: (value: boolean) => void;

  /**
   * Section 121 primary-residence exclusion status. UNKNOWN until the user
   * chooses; it is never silently defaulted to None.
   */
  section121Status: Section121Status;
  setSection121Status: (status: Section121Status) => void;

  /** The canonical input assembled from the current draft. */
  input: SellerNetInput;
  /**
   * The exact effective inputs the calculator used, with unused raw fields
   * normalized. Persist this for snapshots so replay reproduces identical
   * outputs.
   */
  effectiveInput: SellerNetInput;
  /** Deterministic result — always computed, even while fields are UNKNOWN. */
  result: SellerNetResult;
  /** Field-level validation of the current input. */
  validation: ValidationResult;
  /** True when every required field carries a valid value. */
  calculable: boolean;

  /** Replace the whole draft (used when loading a saved run record). */
  loadInput: (input: SellerNetInput, propertyId: string) => void;
  /** Reset every field to UNKNOWN and clear the identifier. */
  reset: () => void;

  calculatorVersion: string;
}

const SellerNetContext = createContext<SellerNetContextValue | null>(null);

export function SellerNetProvider({ children }: { children: ReactNode }) {
  const [propertyId, setPropertyId] = useState("");
  const [fields, setFields] = useState<ProvenancedFields>(initialFields);
  const [drafts, setDrafts] = useState<FieldDrafts>(() =>
    initialDrafts(initialFields()),
  );
  const [conditionTier, setConditionTier] = useState<ConditionTier>("GOOD");
  const [mortgagePayoffMode, setMortgagePayoffMode] =
    useState<MortgagePayoffMode>("VERIFIED_PAYOFF");
  const [isHecm, setIsHecm] = useState(false);
  const [section121Status, setSection121Status] =
    useState<Section121Status>("UNKNOWN");

  const setField = useCallback((key: ProvenancedFieldKey, raw: string) => {
    setDrafts((current) => ({ ...current, [key]: raw }));
    const parsed = parseDraft(raw);
    setFields((current) => ({
      ...current,
      [key]:
        parsed === null
          ? { value: null, provenance: "UNKNOWN" }
          : { value: parsed, provenance: "USER_PROVIDED" },
    }));
  }, []);

  const clearField = useCallback((key: ProvenancedFieldKey) => {
    setDrafts((current) => ({ ...current, [key]: "" }));
    setFields((current) => ({ ...current, [key]: unknownField() }));
  }, []);

  const markEstimate = useCallback((key: ProvenancedFieldKey) => {
    setFields((current) => {
      const field = current[key];
      if (field.value === null) return current;
      return {
        ...current,
        [key]: { value: field.value, provenance: "ESTIMATE" },
      };
    });
  }, []);

  const markVerified = useCallback((key: ProvenancedFieldKey) => {
    setFields((current) => {
      const field = current[key];
      if (field.value === null) return current;
      return {
        ...current,
        [key]: { value: field.value, provenance: "VERIFIED_PAYOFF" },
      };
    });
  }, []);

  const input = useMemo<SellerNetInput>(
    () => ({
      ...fields,
      conditionTier,
      mortgagePayoffMode,
      isHecm,
      section121Status,
    }),
    [fields, conditionTier, mortgagePayoffMode, isHecm, section121Status],
  );

  const result = useMemo(() => calculateSellerNetWaterfall(input), [input]);
  const effectiveInput = useMemo(() => deriveEffectiveInput(input), [input]);
  const validation = useMemo(() => validateInput(input), [input]);
  const calculable = useMemo(() => isCalculable(input), [input]);

  const loadInput = useCallback(
    (next: SellerNetInput, nextPropertyId: string) => {
      const nextFields = initialFields();
      for (const key of Object.keys(nextFields) as ProvenancedFieldKey[]) {
        nextFields[key] = next[key];
      }
      setFields(nextFields);
      setDrafts(initialDrafts(nextFields));
      setConditionTier(next.conditionTier);
      setMortgagePayoffMode(next.mortgagePayoffMode);
      setIsHecm(next.isHecm === true);
      setSection121Status(next.section121Status);
      setPropertyId(nextPropertyId);
    },
    [],
  );

  const reset = useCallback(() => {
    const nextFields = initialFields();
    setFields(nextFields);
    setDrafts(initialDrafts(nextFields));
    setConditionTier("GOOD");
    setMortgagePayoffMode("VERIFIED_PAYOFF");
    setIsHecm(false);
    setSection121Status("UNKNOWN");
    setPropertyId("");
  }, []);

  const value = useMemo<SellerNetContextValue>(
    () => ({
      propertyId,
      setPropertyId,
      drafts,
      fields,
      setField,
      clearField,
      markEstimate,
      markVerified,
      conditionTier,
      setConditionTier,
      mortgagePayoffMode,
      setMortgagePayoffMode,
      isHecm,
      setIsHecm,
      section121Status,
      setSection121Status,
      input,
      effectiveInput,
      result,
      validation,
      calculable,
      loadInput,
      reset,
      calculatorVersion: CALCULATOR_VERSION,
    }),
    [
      propertyId,
      drafts,
      fields,
      setField,
      clearField,
      markEstimate,
      markVerified,
      conditionTier,
      mortgagePayoffMode,
      isHecm,
      section121Status,
      input,
      effectiveInput,
      result,
      validation,
      calculable,
      loadInput,
      reset,
    ],
  );

  return (
    <SellerNetContext.Provider value={value}>
      {children}
    </SellerNetContext.Provider>
  );
}

export function useSellerNet(): SellerNetContextValue {
  const context = useContext(SellerNetContext);
  if (!context) {
    throw new Error("useSellerNet must be used within a SellerNetProvider");
  }
  return context;
}
