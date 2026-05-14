import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { signIn, signUp, setGuest, getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArchAI - Fra ide til byggetilladelse" },
      {
        name: "description",
        content: "AI-drevet byggeradgivning for private bygherrer i Danmark.",
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
  const [signupEmailSentTo, setSignupEmailSentTo] = useState<string | null>(null);
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    getSession().then((session) => {
      if (session) navigate({ to: "/projekt/start" });
    });
  }, [navigate]);

  useEffect(() => {
    if (!signupEmailSentTo) return;
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [signupEmailSentTo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (signupCooldownUntil > Date.now()) return;

    setError(null);
    setBusy(true);

    try {
      if (mode === "login") {
        await signIn(email, password);
        navigate({ to: "/projekt/start" });
      } else {
        const result = await signUp(email, password);
        if (result.needsEmailConfirmation) {
          setSignupEmailSentTo(email);
          setSignupCooldownUntil(Date.now() + 60_000);
        } else {
          navigate({ to: "/projekt/start" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kunne ikke logge ind. Prov igen.";
      const low = msg.toLowerCase();
      if (low.includes("rate limit") || low.includes("over_email_send_rate_limit")) {
        setSignupCooldownUntil(Date.now() + 60_000);
        setError("For mange email-forsog. Vent 60 sekunder for du prover igen.");
      } else {
        setError(msg);
      }
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
          <Link to="/" className="font-mono text-[28px] tracking-[0.2em] text-accent inline-block">
            ARCHAI
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Fra ide til byggetilladelse</p>
        </div>

        <div className="rounded-md border border-border bg-[#111111] p-6">
          {signupEmailSentTo ? (
            <div className="space-y-4">
              <div className="font-mono text-[11px] tracking-[0.15em] text-accent">
                BEKRAEFT DIN EMAIL
              </div>
              <p className="text-sm text-foreground">
                Vi har sendt en bekraeftelsesmail til <strong>{signupEmailSentTo}</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                Abn linket i mailen og log derefter ind.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupEmailSentTo(null);
                  setMode("login");
                  setPassword("");
                }}
                className="w-full inline-flex items-center justify-center rounded-md border border-border px-6 py-3 font-mono text-sm text-foreground transition-colors hover:bg-[#1a1a1a]"
              >
                Tilbage til login
              </button>
            </div>
          ) : (
            <>
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
                    placeholder="********"
                  />
                </div>

                {error && <p className="text-xs text-danger font-mono leading-relaxed">{error}</p>}
                {signupCooldownUntil > nowTs && (
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    Prov igen om {Math.ceil((signupCooldownUntil - nowTs) / 1000)} sek.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || signupCooldownUntil > nowTs}
                  className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? "Vent..." : mode === "login" ? "Log ind" : "Opret konto"}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-[#222] text-center">
                <button
                  onClick={handleGuest}
                  className="text-xs text-foreground/80 hover:text-accent transition-colors"
                >
                  Fortsaet uden at logge ind {"->"}
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Uden konto gemmes dit projekt ikke
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </main>
  );
}
