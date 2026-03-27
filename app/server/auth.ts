import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";

const scryptAsync = promisify(scrypt);

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pin, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePin(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Middleware: authenticate via session OR API key
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check API key first (for MCP/agent access)
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey) {
    storage.getUserByApiKey(apiKey).then((user) => {
      if (user) {
        (req as any).userId = user.id;
        return next();
      }
      res.status(401).json({ message: "Invalid API key" });
    }).catch(() => {
      res.status(500).json({ message: "Auth error" });
    });
    return;
  }

  // Check session
  if (req.session && (req.session as any).userId) {
    (req as any).userId = (req.session as any).userId;
    return next();
  }

  res.status(401).json({ message: "Unauthorized" });
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "claw-crm-secret-change-me",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));

  // POST /api/setup - first-time setup (create user with PIN)
  app.post("/api/setup", async (req, res) => {
    const existingUser = await storage.getFirstUser();
    if (existingUser) {
      return res.status(400).json({ message: "Already set up" });
    }

    const { pin } = req.body;
    if (!pin || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ message: "PIN must be 4-6 digits" });
    }

    const hashedPin = await hashPin(pin);
    const apiKey = `claw_${randomBytes(24).toString("hex")}`;
    const user = await storage.createUser(hashedPin, apiKey);

    (req.session as any).userId = user.id;
    res.status(201).json({ id: user.id, apiKey: user.apiKey });
  });

  // POST /api/login - PIN login
  app.post("/api/login", async (req, res) => {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ message: "PIN required" });
    }

    const user = await storage.getFirstUser();
    if (!user) {
      return res.status(404).json({ message: "No user set up. Call /api/setup first." });
    }

    const valid = await comparePin(pin, user.pin);
    if (!valid) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    (req.session as any).userId = user.id;
    res.json({ id: user.id });
  });

  // POST /api/logout
  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.sendStatus(200);
    });
  });

  // GET /api/user - check auth status
  app.get("/api/user", async (req, res) => {
    // Check API key
    const apiKey = req.headers["x-api-key"] as string;
    if (apiKey) {
      const user = await storage.getUserByApiKey(apiKey);
      if (user) return res.json({ id: user.id, authenticated: true });
      return res.status(401).json({ message: "Invalid API key" });
    }

    // Check session
    if (req.session && (req.session as any).userId) {
      return res.json({ id: (req.session as any).userId, authenticated: true });
    }

    // Check if setup is needed
    const existingUser = await storage.getFirstUser();
    if (!existingUser) {
      return res.status(401).json({ message: "Setup required", needsSetup: true });
    }

    res.status(401).json({ message: "Not authenticated" });
  });
}
