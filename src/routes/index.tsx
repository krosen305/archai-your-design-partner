import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { signIn, signUp, setGuestMode, getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: AuthScreen,
});

type Mode = "login" | "signup";

function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Redirect hvis aktiv session allerede eksisterer
  useEffect(() => {
    getSession().then((session) => {
      if (session) navigate({ to: "/projekt/adresse" });
      else setCheckingSession(false);
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        navigate({ to: "/projekt/adresse" });
      } else {
        await signUp(email, password);
        setSuccess("Konto oprettet! Tjek din email for at bekræfte.");
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Ukendt fejl";
      if (msg.includes("Invalid login credentials")) {
        setError("Forkert email eller kodeord.");
      } else if (msg.includes("already registered") || msg.includes("User already registered")) {
        setError("Email er allerede registreret — prøv at logge ind.");
      } else if (msg.includes("Password should be")) {
        setError("Kodeord skal være mindst 6 tegn.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    setGuestMode();
    navigate({ to: "/projekt/adresse" });
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-mono text-xs text-muted-foreground tracking-widest animate-pulse">
          ARCHAI
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(232,255,77,0.06) 0%, rgba(232,255,77,0.02) 40%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-[400px]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-mono text-[28px] tracking-[0.25em] text-accent mb-2"
        >
          ARCHAI
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-xs text-muted-foreground mb-10"
        >
          Fra tom grund til byggetilladelse
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full"
        >
          {/* Mode toggle */}
          <div className="flex rounded-md border border-[#2a2a2a] bg-[#111] mb-6 p-1 gap-1">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 rounded py-2 font-mono text-xs transition-all ${
                  mode === m
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Log ind" : "Opret konto"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">
                EMAIL
              </label>
              <input
                data-testid="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@email.dk"
                className="w-full rounded-sm border border-[#333] bg-[#111] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">
                KODEORD
              </label>
              <input
                data-testid="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-sm border border-[#333] bg-[#111] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              />
            </div>

            {error && (
              <p className="font-mono text-[11px] text-danger bg-danger/5 border border-danger/20 rounded px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="font-mono text-[11px] text-success bg-success/5 border border-success/20 rounded px-3 py-2">
                {success}
              </p>
            )}

            <button
              data-testid="auth-submit"
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50 mt-1"
            >
              {loading ? "..." : mode === "login" ? "Log ind →" : "Opret konto →"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#222]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 font-mono text-[10px] text-muted-foreground">
                ELLER
              </span>
            </div>
          </div>

          <button
            data-testid="auth-guest"
            onClick={handleGuest}
            className="w-full inline-flex items-center justify-center rounded-md border border-[#333] bg-transparent px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-accent/40 hover:text-foreground"
          >
            Fortsæt uden at logge ind →
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Dine data gemmes lokalt i browseren som gæst.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
