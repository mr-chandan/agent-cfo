import { cn } from "@/lib/utils";

// agentcfo mark: a gold coin with the ink four-point spark the app uses for its agents.
// Money + AI in one shape; a circle, so it never reads as a copy of a square app icon.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id="acfo-coin" x1="12" y1="6" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.55" stopColor="#f5c23a" />
          <stop offset="1" stopColor="#d99a0b" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#acfo-coin)" />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="#1f1d1a" strokeOpacity="0.16" strokeWidth="1.5" />
      <path
        d="M32 15c1.4 9.6 5.9 14.1 17 17-11.1 2.9-15.6 7.4-17 17-1.4-9.6-5.9-14.1-17-17 11.1-2.9 15.6-7.4 17-17Z"
        fill="#1f1d1a"
      />
      <circle cx="44.5" cy="19.5" r="2.6" fill="#1f1d1a" />
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      agent<span className="text-brand-text">cfo</span>
    </span>
  );
}
