import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import type { Express, Request, RequestHandler } from "express";
import "./strategy";

// ── Embed token bypass ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      isEmbed?: boolean;
    }
  }
}

/**
 * Middleware that must be registered BEFORE the session auth check.
 * When a valid ?embed=<token> is present on a GET request, sets
 * req.isEmbed = true and req.user to a synthetic viewer identity so
 * that downstream middleware and route handlers treat the request as
 * authenticated without requiring a session cookie.
 */
export const embedBypass: RequestHandler = (req, _res, next) => {
  const secret = process.env.EMBED_TOKEN;
  if (
    secret &&
    (req.query.embed as string | undefined) === secret
  ) {
    req.isEmbed = true;
    // Satisfy passport's req.user slot with a read-only viewer identity.
    // Cast needed because the real User type has additional DB fields.
    (req as any).user = { id: "embed-viewer", role: "viewer" };
    console.log(`[AUTH] Embed viewer | ${req.method} ${req.path}`);
  }
  next();
};

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
  if (req.isEmbed) return next();
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Unauthorized" });
};
