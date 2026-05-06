export interface ValidationResult {
  isValid: boolean;
  confidence: "high" | "medium" | "low";
  issues: string[];
  warnings: string[];
}

export interface RangeRule {
  min: number;
  max: number;
  outlierThresholdPct: number;
}

const VALIDATION_RULES: Record<string, RangeRule> = {
  pricePerKwh: { min: 0.05, max: 0.50, outlierThresholdPct: 30 },
  pricePerRackMonth: { min: 50, max: 2000, outlierThresholdPct: 30 },
  capacityMw: { min: 0.1, max: 500, outlierThresholdPct: 30 },
  pueRating: { min: 1.0, max: 3.0, outlierThresholdPct: 20 },
  occupancyPercent: { min: 0, max: 100, outlierThresholdPct: 15 },
};

export function validateDataPoint(
  field: string,
  value: number | undefined,
  regionAverage?: number
): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  if (value === undefined || value === null) {
    return { isValid: true, confidence: "low", issues: ["No data provided"], warnings: [] };
  }

  const rule = VALIDATION_RULES[field];
  if (!rule) {
    return { isValid: true, confidence: "low", issues: [`No validation rule for ${field}`], warnings: [] };
  }

  // Range check
  if (value < rule.min) {
    issues.push(`${field} (${value}) below minimum (${rule.min})`);
    confidence = "low";
  }
  if (value > rule.max) {
    issues.push(`${field} (${value}) above maximum (${rule.max})`);
    confidence = "low";
  }

  // Outlier detection relative to regional average
  if (regionAverage && regionAverage > 0) {
    const percentDiff = Math.abs((value - regionAverage) / regionAverage) * 100;
    if (percentDiff > rule.outlierThresholdPct) {
      warnings.push(
        `${field} (${value}) deviates ${percentDiff.toFixed(1)}% from regional avg (${regionAverage})`
      );
      confidence = confidence === "high" ? "medium" : confidence;
    }
  }

  return {
    isValid: issues.length === 0,
    confidence,
    issues,
    warnings,
  };
}

export interface DiscrepancyDetection {
  hasDiscrepancy: boolean;
  spreadPercent?: number;
  recommendation: "confirm_a" | "confirm_b" | "average" | "investigate";
}

export function detectDiscrepancy(
  valueA: number | undefined,
  valueB: number | undefined,
  spreadThresholdPct: number = 20
): DiscrepancyDetection {
  if (!valueA || !valueB) {
    return { hasDiscrepancy: false };
  }

  const spreadPercent = Math.abs((valueA - valueB) / ((valueA + valueB) / 2)) * 100;

  if (spreadPercent > spreadThresholdPct) {
    return {
      hasDiscrepancy: true,
      spreadPercent,
      recommendation: spreadPercent > 50 ? "investigate" : "confirm_a", // Arbitrary recommendation
    };
  }

  return { hasDiscrepancy: false, spreadPercent };
}

export function calculateRegionalAverage(
  values: (number | undefined)[]
): number | undefined {
  const validValues = values.filter((v) => v !== undefined && v !== null) as number[];
  if (validValues.length === 0) return undefined;
  return validValues.reduce((a, b) => a + b, 0) / validValues.length;
}
