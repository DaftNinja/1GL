import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import { sendPasswordResetEmail } from "../../email";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";

const BLOCKED_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "me.com", "mac.com", "googlemail.com",
];

const registerSchema = z.object({
  email: z.string().email("Valid email address required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Valid email address required"),
  password: z.string().min(1, "Password is required"),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = registerSchema.parse(req.body);
      const domain = email.split("@")[1]?.toLowerCase();

      if (!domain || BLOCKED_EMAIL_DOMAINS.includes(domain)) {
        return res.status(400).json({ message: "Please use a work email address. Personal email domains are not accepted." });
      }

      const existing = await authStorage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await authStorage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      req.session.userId = user.id;
      req.session.userEmail = user.email;

      storage.createAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: "REGISTER",
        entityType: "auth",
        ipAddress: req.ip || req.socket.remoteAddress || null,
      }).catch(() => {});

      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      req.session.userId = user.id;
      req.session.userEmail = user.email;

      storage.createAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: "LOGIN",
        entityType: "auth",
        ipAddress: req.ip || req.socket.remoteAddress || null,
      }).catch(() => {});

      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    if (userId) {
      storage.createAuditLog({
        userId,
        userEmail,
        action: "LOGOUT",
        entityType: "auth",
        ipAddress: req.ip || req.socket.remoteAddress || null,
      }).catch(() => {});
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = await authStorage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await authStorage.getUserByEmail(email);

      if (!user) {
        return res.json({ message: "If that address is registered, you'll receive a reset link shortly." });
      }

      await authStorage.deleteExpiredPasswordResetTokens();

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await authStorage.createPasswordResetToken(user.id, token, expiresAt);

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;

      await sendPasswordResetEmail(user.email, resetUrl);

      res.json({ message: "If that address is registered, you'll receive a reset link shortly." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Failed to send reset email. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      const record = await authStorage.getPasswordResetToken(token);
      if (!record || record.expiresAt < new Date()) {
        return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await authStorage.updateUserPassword(record.userId, hashedPassword);
      await authStorage.deletePasswordResetToken(token);

      res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  app.get("/api/audit-logs", isAuthenticated, async (req, res) => {
    if (req.session.userEmail !== "andrew.mccreath@1giglabs.com") {
      return res.status(403).json({ message: "Access denied" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await storage.listAuditLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });
}
