import { useState } from "react";
import { apiLogin, apiSignup, saveAuth } from "@/lib/auth";

interface Props {
  onAuth: (workspace: string) => void;
}

export default function LoginPage({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail]       = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await apiLogin(email, password)
          : await apiSignup(email, username, password);
      saveAuth(res.token, res.user, res.workspace);
      onAuth(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl font-black tracking-tighter text-white">
              FTM<span className="text-amber-400">-CODER</span>
            </span>
          </div>
          <p className="text-[#858585] text-sm">
            {mode === "login" ? "Sign in to your workspace" : "Create your workspace"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 shadow-2xl">
          {/* Mode tabs */}
          <div className="flex bg-[#111] rounded-lg p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-amber-400 text-black"
                    : "text-[#858585] hover:text-white"
                }`}
              >
                {m === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs text-[#858585] mb-1.5 font-medium uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-[#111] border border-[#333] text-white rounded-lg px-3 py-2.5 text-sm placeholder-[#444] focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            {/* Username (signup only) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs text-[#858585] mb-1.5 font-medium uppercase tracking-wide">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                  placeholder="shivam"
                  pattern="[a-z0-9_-]{3,20}"
                  title="3-20 chars, lowercase letters/numbers/dash/underscore"
                  className="w-full bg-[#111] border border-[#333] text-white rounded-lg px-3 py-2.5 text-sm placeholder-[#444] focus:outline-none focus:border-amber-400 transition-colors"
                />
                <p className="text-[10px] text-[#555] mt-1">
                  Used for your terminal prompt and workspace folder.
                </p>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs text-[#858585] mb-1.5 font-medium uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="w-full bg-[#111] border border-[#333] text-white rounded-lg px-3 py-2.5 text-sm placeholder-[#444] focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg py-2.5 text-sm transition-colors mt-2"
            >
              {loading
                ? mode === "login" ? "Signing in…" : "Creating account…"
                : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Footer toggle */}
          <p className="text-center text-[#555] text-xs mt-5">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              className="text-amber-400 hover:text-amber-300 transition-colors"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>

        {/* Hint */}
        <p className="text-center text-[#333] text-xs mt-4">
          Your workspace is isolated — only you can access your files.
        </p>
      </div>
    </div>
  );
}
