import { SectionIcon, type SectionIconKey } from "@/components/ui/section-icon";
import { CALCULATOR_VERSION } from "@/lib/seller-net";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Calculator } from "lucide-react";

const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: SectionIconKey;
  exact: boolean;
}> = [
  { to: "/", label: "Work surface", icon: "primary_inputs", exact: true },
  { to: "/client", label: "Client view", icon: "client_view", exact: false },
  { to: "/print", label: "Print sheet", icon: "print", exact: false },
  { to: "/runs", label: "Saved runs", icon: "saved_runs", exact: false },
];

/**
 * Top navigation: compact wordmark on the left, view links on the right. The
 * internal calculator identifier is de-emphasized to a quiet metadata tag so it
 * never competes with the app name. The header sits on `bg-card` with a
 * hairline rule so it reads as a distinct zone from the work surface below.
 */
export function TopNav() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-card">
      <div className="mx-auto flex h-11 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
        <Link
          to="/"
          data-ocid="nav.brand_link"
          className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground"
          >
            <Calculator className="size-3.5" />
          </span>
          <span className="min-w-0 truncate font-display text-[13px] font-semibold tracking-tight text-foreground">
            Seller Net Waterfall
          </span>
          <span
            title="Internal calculator identifier"
            className="hidden shrink-0 font-money text-[10px] tracking-wide text-muted-foreground/70 sm:inline"
          >
            {CALCULATOR_VERSION}
          </span>
        </Link>

        <nav aria-label="Views" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-ocid={`nav.${item.to === "/" ? "work_surface" : item.to.slice(1)}.link`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-smooth outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <SectionIcon section={item.icon} />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
