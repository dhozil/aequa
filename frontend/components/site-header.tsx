"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { Brand } from "@/components/brand";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CHAIN_ID } from "@/lib/config";

const links = [
  { href: "/rounds", label: "Rounds" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/rubric", label: "Rubric" },
  { href: "/consensus", label: "Consensus" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-transparent">
      <div className="shell flex h-[72px] items-center justify-between gap-4">
        <Brand />
        <div className="flex items-center gap-3">
          <span className="hidden h-8 w-[132px] rounded-full bg-muted md:block" />
          <span className="h-9 w-[112px] rounded-full bg-muted" />
        </div>
      </div>
    </header>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Landing page renders its own hero-financial header (pill + mobile drawer);
  // the global sticky header is suppressed there to avoid two stacked headers.
  if (pathname === "/") return null;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/80 bg-background/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="shell flex h-[72px] items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex">
            {links.map((link) => {
              const active =
                link.href === "/rounds"
                  ? pathname.startsWith("/rounds")
                  : link.href === "/admin"
                    ? pathname.startsWith("/admin")
                    : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative text-[13px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:text-ink",
                    active && "text-ink",
                  )}
                >
                  {link.label}
                  {active && (
                    <span className="absolute -bottom-1.5 left-0 h-px w-full bg-forest" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 md:inline-flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-forest/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-forest" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Studionet · {CHAIN_ID}
            </span>
          </span>
          <div className="hidden sm:block">
            <WalletButton />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="lg:hidden" aria-label="Open menu">
                {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[320px] border-l-border bg-background p-6">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Brand />
                </SheetTitle>
                <SheetDescription className="label pt-3">
                  Grants by open criteria
                </SheetDescription>
              </SheetHeader>

              <nav className="mt-8 flex flex-col">
                {links.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-baseline justify-between border-b border-border/70 py-4 text-[15px] text-ink transition-colors hover:text-forest"
                  >
                    {link.label}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </Link>
                ))}
              </nav>

              <div className="mt-8 space-y-3">
                <WalletButton fullWidth />
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link href="/rounds" onClick={() => setMobileOpen(false)}>
                    Browse rounds
                  </Link>
                </Button>
              </div>

              <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
                AI Governance grants. Every grant decision is re-evaluated by
                independent validators on GenLayer.
              </p>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
