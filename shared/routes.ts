import { z } from 'zod';
import { analyses, tamAnalyses, powerTrendAnalyses, verifiedExecutives, siteSelectionReports, insertAnalysisSchema, analysisContentSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  analysis: {
    create: {
      method: 'POST' as const,
      path: '/api/analyze',
      input: z.object({ companyName: z.string() }),
      responses: {
        201: z.custom<typeof analyses.$inferSelect>(),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/analyses/:id',
      responses: {
        200: z.custom<typeof analyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/analyses',
      responses: {
        200: z.array(z.custom<typeof analyses.$inferSelect>()),
      },
    },
  },
  tam: {
    generate: {
      method: 'POST' as const,
      path: '/api/tam/generate',
      responses: {
        200: z.custom<typeof tamAnalyses.$inferSelect>(),
        201: z.custom<typeof tamAnalyses.$inferSelect>(),
        500: errorSchemas.internal,
      },
    },
    latest: {
      method: 'GET' as const,
      path: '/api/tam/latest',
      responses: {
        200: z.custom<typeof tamAnalyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/tam/:id',
      responses: {
        200: z.custom<typeof tamAnalyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  powerTrends: {
    generate: {
      method: 'POST' as const,
      path: '/api/power-trends/generate',
      responses: {
        200: z.custom<typeof powerTrendAnalyses.$inferSelect>(),
        201: z.custom<typeof powerTrendAnalyses.$inferSelect>(),
        500: errorSchemas.internal,
      },
    },
    latest: {
      method: 'GET' as const,
      path: '/api/power-trends/latest',
      responses: {
        200: z.custom<typeof powerTrendAnalyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/power-trends/:id',
      responses: {
        200: z.custom<typeof powerTrendAnalyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  verifiedExecutives: {
    list: {
      method: 'GET' as const,
      path: '/api/verified-executives',
      responses: {
        200: z.array(z.custom<typeof verifiedExecutives.$inferSelect>()),
      },
    },
    byCompany: {
      method: 'GET' as const,
      path: '/api/verified-executives/company/:company',
      responses: {
        200: z.array(z.custom<typeof verifiedExecutives.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/verified-executives',
      input: z.object({
        companyName: z.string(),
        name: z.string(),
        role: z.string(),
        sourceUrl: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof verifiedExecutives.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/verified-executives/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  researchAgent: {
    run: {
      method: 'POST' as const,
      path: '/api/research-agent/run',
      responses: {
        200: z.object({ jobId: z.string() }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    stream: {
      method: 'GET' as const,
      path: '/api/research-agent/stream/:jobId',
      responses: {
        200: z.string(), // SSE stream
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/research-agent/report/:id',
      responses: {
        200: z.custom<typeof siteSelectionReports.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/research-agent/reports',
      responses: {
        200: z.array(z.custom<typeof siteSelectionReports.$inferSelect>()),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
