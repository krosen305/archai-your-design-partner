import { useNavigate, Link } from "@tanstack/react-router";
import { LogOut, FolderOpen, LogIn, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsFromEmail(email: string | undefined | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

export function UserMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="h-8 w-8" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
      >
        <LogIn size={12} />
        LOG IND
      </Link>
    );
  }

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Brugermenu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-[#111] font-mono text-[10px] text-foreground hover:border-accent/60 transition-colors"
        >
          {initialsFromEmail(user.email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground truncate">{user.email}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/projekt/start" className="flex items-center gap-2 cursor-pointer">
            <FolderOpen size={14} />
            Mine projekter
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
          <LogOut size={14} />
          Log ud
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenuIcon() {
  return <UserIcon size={14} />;
}
