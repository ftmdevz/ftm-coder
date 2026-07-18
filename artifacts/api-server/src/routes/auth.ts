import { Router } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, getUserDir, initUserDir } from "../lib/auth-db.js";
import { requireAuth, signToken } from "../middleware/requireAuth.js";

const router = Router();

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post("/auth/signup", async (req, res) => {
  const { email, username, password } = req.body as {
    email?: string;
    username?: string;
    password?: string;
  };

  if (!email || !username || !password) {
    res.status(400).json({ error: "email, username and password are required" });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanUser = username.toLowerCase().trim();

  if (!/^[a-z0-9_-]{3,20}$/.test(cleanUser)) {
    res
      .status(400)
      .json({ error: "Username: 3-20 chars, lowercase letters/numbers/dash/underscore only" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const user = createUser(cleanEmail, cleanUser, hash);
    const dir = initUserDir(user.username);
    const token = signToken({ userId: user.id, username: user.username, email: user.email });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username },
      workspace: dir,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Email or username already taken" });
    } else {
      res.status(500).json({ error: "Signup failed — please try again" });
    }
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = findUserByEmail(email.toLowerCase().trim());
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Re-initialise dir (ensures it exists if user logs in on a fresh container)
  const dir = initUserDir(user.username);
  const token = signToken({ userId: user.id, username: user.username, email: user.email });

  res.json({
    token,
    user: { id: user.id, email: user.email, username: user.username },
    workspace: dir,
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, (req, res) => {
  const { userId, username, email } = req.user!;
  res.json({
    user: { id: userId, email, username },
    workspace: getUserDir(username),
  });
});

export default router;
