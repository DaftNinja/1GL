import { db } from "../server/db";
import { analyses } from "../shared/schema";

async function main() {
  const content = {
    companyName: "Acme Corp",
    website: "https://acme.com",
    colorScheme: { primary: "#0047BB", secondary: "#FFD700" },
    executiveSummary: "Acme Corp is a leading provider of widgets...",
    overview: {
      description: "Global widget manufacturer.",
      founded: "1920",
      headquarters: "New York, NY",
      employees: "10,000",
      locations: ["NY", "London", "Tokyo"]
    },
    financials: {
      revenue: "$5.2B",
      revenueGrowth: "12%",
      netIncome: "$800M",
      stockSymbol: "ACME",
      recentPerformance: "Strong growth in Q4.",
      chartData: [
        { year: "2020", revenue: 4200, netIncome: 600 },
        { year: "2021", revenue: 4500, netIncome: 650 },
        { year: "2022", revenue: 4800, netIncome: 700 },
        { year: "2023", revenue: 5000, netIncome: 750 },
        { year: "2024", revenue: 5200, netIncome: 800 }
      ]
    },
    strategy: {
      vision: "To be the #1 widget maker.",
      initiatives: [
        { title: "Digital Transformation", description: "Moving to cloud." },
        { title: "AI Integration", description: "Automating supply chain." }
      ]
    },
    market: {
      competitors: [
        { name: "Globex", description: "Major competitor in Asia." },
        { name: "Soylent", description: "Foodstuff giant entering widget space." }
      ],
      challenges: ["Supply chain disruption", "Rising material costs"],
      marketShare: "25%"
    },
    technicalSpend: {
      totalEstimatedBudget: "$250M",
      breakdown: [
        { category: "Network", percentage: 10, estimatedAmount: "$25M" },
        { category: "Hardware", percentage: 15, estimatedAmount: "$37.5M" },
        { category: "Software", percentage: 25, estimatedAmount: "$62.5M" },
        { category: "Cloud", percentage: 20, estimatedAmount: "$50M" },
        { category: "Data Center", percentage: 10, estimatedAmount: "$25M" },
        { category: "AI & Automation", percentage: 10, estimatedAmount: "$25M" },
        { category: "Managed Services", percentage: 10, estimatedAmount: "$25M" }
      ],
      categories: {
        network: "Estimated based on global MPLS and SD-WAN rollouts.",
        hardware: "Laptop refreshes and server maintenance.",
        software: "SaaS subscriptions (Salesforce, Workday).",
        cloud: "AWS/Azure consumption.",
        dataCenter: "Legacy on-prem facilities.",
        aiAndAutomation: "New pilots in predictive analytics.",
        managedServices: "Outsourced helpdesk."
      }
    }
  };

  try {
    await db.insert(analyses).values({
      companyName: "Acme Corp",
      content: content as any
    });
    console.log("Seeded Acme Corp analysis");
  } catch (e) {
    console.error("Error seeding:", e);
  }
}

main().catch(console.error).finally(() => process.exit(0));
