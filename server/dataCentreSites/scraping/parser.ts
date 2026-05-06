import { load } from "cheerio";

export interface ExtractedData {
  capacityMw?: number;
  occupancyPercent?: number;
  pueRating?: number;
  pricePerKwh?: number;
  pricePerRackMonth?: number;
  rawText: string;
  extractedValues: Record<string, string | number>;
}

export async function parseHtml(html: string, extractionHints?: {
  keywords?: string[];
  selectors?: string[];
  patterns?: string[];
}): Promise<ExtractedData> {
  const $ = load(html);
  const rawText = $.text();
  const extractedValues: Record<string, string | number> = {};

  // Try structured extraction if selectors provided
  if (extractionHints?.selectors && extractionHints.selectors.length > 0) {
    for (const selector of extractionHints.selectors) {
      try {
        const elements = $(selector);
        elements.each((_idx: number, elem: any) => {
          const text = $(elem).text().trim();
          if (text) extractedValues[selector] = text;
        });
      } catch (e) {
        // Selector might be invalid, continue
      }
    }
  }

  // Extract numbers that match common patterns
  const capacityMatch = rawText.match(/(\d+(?:,\d{3}|\.\d+)?)\s*(?:MW|megawatt|megawatts)/i);
  const capacityMw = capacityMatch ? parseFloat(capacityMatch[1].replace(",", "")) : undefined;

  const pueMatch = rawText.match(/PUE\s*[:|=]?\s*(\d+\.\d+)/i);
  const pueRating = pueMatch ? parseFloat(pueMatch[1]) : undefined;

  const occupancyMatch = rawText.match(/occupancy\s*[:|=]?\s*(\d+(?:\.\d+)?)\s*%/i);
  const occupancyPercent = occupancyMatch ? parseFloat(occupancyMatch[1]) : undefined;

  // Price per kWh extraction (EUR/kWh format)
  const priceKwhMatch = rawText.match(/€?\s*(\d+\.\d{2,4})\s*\/\s*kWh/i);
  const pricePerKwh = priceKwhMatch ? parseFloat(priceKwhMatch[1]) : undefined;

  // Price per rack per month
  const priceRackMatch = rawText.match(/€?\s*(\d{2,5}(?:,\d{3}|\.\d+)?)\s*\/\s*(?:rack|month|mo)/i);
  const pricePerRackMonth = priceRackMatch ? parseFloat(priceRackMatch[1].replace(",", "")) : undefined;

  return {
    capacityMw,
    occupancyPercent,
    pueRating,
    pricePerKwh,
    pricePerRackMonth,
    rawText: rawText.substring(0, 5000), // Limit raw text storage
    extractedValues: {
      ...extractedValues,
      capacityMw: capacityMw ?? "not found",
      pueRating: pueRating ?? "not found",
      occupancyPercent: occupancyPercent ?? "not found",
      pricePerKwh: pricePerKwh ?? "not found",
      pricePerRackMonth: pricePerRackMonth ?? "not found",
    },
  };
}
