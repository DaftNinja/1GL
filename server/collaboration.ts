import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./auth/setup";
import { z } from "zod";

interface PresenceEntry {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  lastSeen: number;
}

const presenceMap = new Map<number, Map<string, PresenceEntry>>();
const sseClients = new Map<number, Set<Response>>();

const PRESENCE_TIMEOUT_MS = 30000;

function cleanStalePresence(analysisId: number) {
  const entries = presenceMap.get(analysisId);
  if (!entries) return;
  const now = Date.now();
  for (const [userId, entry] of entries) {
    if (now - entry.lastSeen > PRESENCE_TIMEOUT_MS) {
      entries.delete(userId);
    }
  }
  if (entries.size === 0) presenceMap.delete(analysisId);
}

function broadcastPresence(analysisId: number) {
  cleanStalePresence(analysisId);
  const entries = presenceMap.get(analysisId);
  const viewers = entries ? Array.from(entries.values()) : [];
  const clients = sseClients.get(analysisId);
  if (!clients) return;
  const data = JSON.stringify({ type: "presence", viewers });
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

function broadcastEvent(analysisId: number, event: any) {
  const clients = sseClients.get(analysisId);
  if (!clients) return;
  const data = JSON.stringify(event);
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

export function registerCollaborationRoutes(app: Express) {
  app.get("/api/analyses/:id/presence", isAuthenticated, (req: Request, res: Response) => {
    const analysisId = Number(req.params.id);
    if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("\n");

    if (!sseClients.has(analysisId)) sseClients.set(analysisId, new Set());
    sseClients.get(analysisId)!.add(res);

    const session = req.session as any;
    const userId = session.userId;
    const email = session.userEmail || "";

    if (userId) {
      if (!presenceMap.has(analysisId)) presenceMap.set(analysisId, new Map());
      presenceMap.get(analysisId)!.set(userId, {
        userId,
        email,
        firstName: email.split("@")[0].split(".")[0] || "",
        lastName: email.split("@")[0].split(".")[1] || "",
        lastSeen: Date.now(),
      });
      broadcastPresence(analysisId);
    }

    const keepAlive = setInterval(() => {
      try { res.write(":keepalive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.get(analysisId)?.delete(res);
      if (userId) presenceMap.get(analysisId)?.delete(userId);
      broadcastPresence(analysisId);
    });
  });

  app.post("/api/analyses/:id/presence/heartbeat", isAuthenticated, (req: Request, res: Response) => {
    const analysisId = Number(req.params.id);
    if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
    const session = req.session as any;
    const userId = session.userId;
    const email = session.userEmail || "";

    if (userId && presenceMap.has(analysisId)) {
      const entry = presenceMap.get(analysisId)!.get(userId);
      if (entry) {
        entry.lastSeen = Date.now();
      } else {
        presenceMap.get(analysisId)!.set(userId, {
          userId,
          email,
          firstName: email.split("@")[0].split(".")[0] || "",
          lastName: email.split("@")[0].split(".")[1] || "",
          lastSeen: Date.now(),
        });
      }
      broadcastPresence(analysisId);
    }
    res.json({ ok: true });
  });

  const commentSchema = z.object({
    section: z.string().min(1).max(100),
    content: z.string().min(1).max(2000),
  });

  app.post("/api/analyses/:id/comments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const analysisId = Number(req.params.id);
      if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
      const session = req.session as any;
      const parsed = commentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid comment data" });

      const comment = await storage.createReportComment({
        analysisId,
        userId: session.userId,
        userEmail: session.userEmail,
        section: parsed.data.section,
        content: parsed.data.content,
      });

      await storage.createReportActivity({
        analysisId,
        userId: session.userId,
        userEmail: session.userEmail,
        action: "comment",
        details: `Commented on ${parsed.data.section}`,
      });

      broadcastEvent(analysisId, { type: "comment_added", comment });
      res.status(201).json(comment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/analyses/:id/comments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const analysisId = Number(req.params.id);
      if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
      const comments = await storage.getReportComments(analysisId);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/analyses/:id/comments/:commentId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const commentId = Number(req.params.commentId);
      const analysisId = Number(req.params.id);
      if (isNaN(commentId) || isNaN(analysisId)) return res.status(400).json({ message: "Invalid ID" });

      const session = req.session as any;
      const comment = await storage.getReportCommentById(commentId);
      if (!comment) return res.status(404).json({ message: "Comment not found" });
      if (comment.analysisId !== analysisId) return res.status(403).json({ message: "Forbidden" });
      if (comment.userId !== session.userId) return res.status(403).json({ message: "You can only delete your own comments" });

      const deleted = await storage.deleteReportComment(commentId);
      if (deleted) {
        broadcastEvent(analysisId, { type: "comment_deleted", commentId });
      }
      res.json({ deleted });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const assignmentSchema = z.object({
    assignedToEmail: z.string().email().max(200),
    section: z.string().min(1).max(100),
    note: z.string().max(500).optional(),
  });

  app.post("/api/analyses/:id/assignments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const analysisId = Number(req.params.id);
      if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
      const session = req.session as any;
      const parsed = assignmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid assignment data" });

      const assignment = await storage.createReportAssignment({
        analysisId,
        assignedByEmail: session.userEmail,
        assignedToEmail: parsed.data.assignedToEmail,
        section: parsed.data.section,
        status: "pending",
        note: parsed.data.note || null,
      });

      await storage.createReportActivity({
        analysisId,
        userId: session.userId,
        userEmail: session.userEmail,
        action: "assignment",
        details: `Assigned "${parsed.data.section}" to ${parsed.data.assignedToEmail}`,
      });

      broadcastEvent(analysisId, { type: "assignment_added", assignment });
      res.status(201).json(assignment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/analyses/:id/assignments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const analysisId = Number(req.params.id);
      if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
      const assignments = await storage.getReportAssignments(analysisId);
      res.json(assignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/analyses/:id/assignments/:assignmentId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const analysisId = Number(req.params.id);
      if (isNaN(assignmentId) || isNaN(analysisId)) return res.status(400).json({ message: "Invalid ID" });

      const session = req.session as any;
      const { status } = req.body;
      if (!["pending", "in_progress", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const existing = await storage.getReportAssignmentById(assignmentId);
      if (!existing) return res.status(404).json({ message: "Assignment not found" });
      if (existing.analysisId !== analysisId) return res.status(403).json({ message: "Forbidden" });

      const updated = await storage.updateReportAssignment(assignmentId, status);
      if (!updated) return res.status(404).json({ message: "Assignment not found" });

      await storage.createReportActivity({
        analysisId,
        userId: session.userId,
        userEmail: session.userEmail,
        action: "assignment_update",
        details: `Updated "${updated.section}" status to ${status}`,
      });

      broadcastEvent(analysisId, { type: "assignment_updated", assignment: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/analyses/:id/activity", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const analysisId = Number(req.params.id);
      if (isNaN(analysisId)) return res.status(400).json({ message: "Invalid analysis ID" });
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const activity = await storage.getReportActivity(analysisId, limit);
      res.json(activity);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
