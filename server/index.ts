import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, isEmbedAuthenticated } from "./auth/setup";
import { registerAuthRoutes } from "./auth/routes";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";
import path from "path";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// Allow embedding in iframes from dcauk.org and self
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://www.dcauk.org https://*.dcauk.org"
  );
  next();
});

// Serve static assets from root public folder
app.use(express.static('public'));

const PUBLIC_API_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/logout",
  "/auth/user",
  "/auth/forgot-password",
  "/auth/reset-password",
];

(async () => {
  await migrate(db, { migrationsFolder: path.join(__dirname, "../migrations") });

  await setupAuth(app);

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC_API_PATHS.includes(req.path)) return next();
    if (req.isAuthenticated()) return next();
    if (isEmbedAuthenticated(req)) return next();
    return res.status(401).json({ message: "Unauthorized" });
  });

  registerAuthRoutes(app);
  await registerRoutes(httpServer, app);

  // Background: populate 1GL data centre DB on startup if empty
  setImmediate(async () => {
    try {
      const { db } = await import("./db");
      const { oneGLDatacentres } = await import("../shared/schema");
      const { count } = await import("drizzle-orm");
      const [{ value }] = await db.select({ value: count() }).from(oneGLDatacentres);
      if (Number(value) === 0) {
        log("1GL DC DB empty — fetching European data centres from Mapbox tiles...", "1gl");
        const { scrapeOneGLDatacentres } = await import("./DCData");
        const { storage } = await import("./storage");
        const records = await scrapeOneGLDatacentres(true);
        const result = await storage.upsertOneGLDatacentres(records);
        log(`1GL: loaded ${records.length} records (inserted ${result.inserted}, updated ${result.updated})`, "1gl");
      }
    } catch (err: any) {
      log(`1GL startup populate error: ${err.message}`, "1gl");
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
