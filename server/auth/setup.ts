import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import type { Express, Request, RequestHandler } from "express";
import "./strategy";

// ── Embed token auth ──────────────────────────────────────────────────────────

function parseEmbedTokens(): Map<string, string> {
  const tokens = new Map<string, string>();
  const raw = process.env.EMBED_TOKENS || "";
  if (!raw) return tokens;
  for (const entry of raw.split(",")) {
    const idx = entry.trim().indexOf(":");
    if (idx > 0) {
      const token = entry.trim().slice(0, idx);
      const name  = entry.trim().slice(idx + 1);
      if (token && name) tokens.set(token, name);
    }
  }
  return tokens;
}

const embedTokens = parseEmbedTokens();

/** Returns true and logs access if a valid embed token is present on a GET request. */
export function isEmbedAuthenticated(req: Request): boolean {
  if (req.method !== "GET") return false;
  if (embedTokens.size === 0) return false;
  const token =
    (req.query.embed as string | undefined) ||
    (req.headers["x-embed-token"] as string | undefined);
  if (!token || !embedTokens.has(token)) return false;
  console.log(`[AUTH] Embed access: ${embedTokens.get(token)} | ${req.method} ${req.path}`);
  return true;
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    userEmail: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  if (isEmbedAuthenticated(req)) return next();
  return res.status(401).json({ message: "Unauthorized" });
};
