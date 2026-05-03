import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { signIn, signUp, setGuest, getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArchAI — Fra idé til byggetilladelse" },
      {
        name: "description",
        content: "AI-drevet byggerådgivning for private bygherrer i Danmark.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Allerede logget ind → redirect direkte til /projekt/start
  useEffect(() => {
    getSession().then((session) => {
      if (session) navigate({ to: "/projekt/start" });
    });
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      navigate({ to: "/projekt/start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke logge ind. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  function handleGuest() {
    setGuest();
    navigate({ to: "/projekt/start" });
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(232,255,77,0.06) 0%, rgba(232,255,77,0.02) 40%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="text-center mb-8">
          <Link
            to="/"
            className="font-mono text-[28px] tracking-[0.2em] text-accent inline-block"
          >
            ARCHAI
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Fra idé til byggetilladelse</p>
        </div>

        <div className="rounded-md border border-border bg-[#111111] p-6">
          {/* Tabs */}
          <div className="flex gap-1 mb-5 p-1 rounded-md bg-[#1A1A1A]">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded font-mono text-[11px] tracking-[0.1em] transition-colors ${
                mode === "login" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              LOG IND
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded font-mono text-[11px] tracking-[0.1em] transition-colors ${
                mode === "signup" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              OPRET KONTO
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-1.5">
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-sm border border-[#333] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                placeholder="dig@example.dk"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.15em] text-muted-foreground mb-1.5">
                ADGANGSKODE
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-sm border border-[#333] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-danger font-mono leading-relaxed">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Vent…" : mode === "login" ? "Log ind" : "Opret konto"}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-[#222] text-center">
            <button
              onClick={handleGuest}
              className="text-xs text-foreground/80 hover:text-accent transition-colors"
            >
              Fortsæt uden at logge ind →
            </button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Uden konto gemmes dit projekt ikke
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
