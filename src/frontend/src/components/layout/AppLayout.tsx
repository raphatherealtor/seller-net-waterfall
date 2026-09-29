import { TopNav } from "@/components/layout/TopNav";
import { Disclaimer } from "@/components/ui/disclaimer";
import type { ReactNode } from "react";

/**
 * The application shell: compact sticky header, a full-height content region,
 * and the attribution footer carrying the planning-purposes disclaimer.
 *
 * The footer is suppressed on the print route, which renders its own sheet.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="flex-1">{children}</main>
      <footer className="no-print border-t border-border bg-muted/40 shadow-[inset_0_1px_0_0_oklch(var(--inset-highlight)/0.6)]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <Disclaimer className="max-w-3xl" />
          <p className="type-meta shrink-0">
            © {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-smooth hover:text-foreground"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
