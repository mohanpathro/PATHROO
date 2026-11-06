import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="PATHROO"
    >
      <defs>
        <linearGradient id="pathroo-mark-gradient" x1="20" y1="100" x2="105" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        d="M30 108C26 78 28 42 32 19c21-2 49-3 61 10 15 16 6 34-8 41-14 7-35 3-51 1"
        fill="none"
        stroke="url(#pathroo-mark-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <path d="m105 13 2.8 6.2L114 22l-6.2 2.8L105 31l-2.8-6.2L96 22l6.2-2.8z" fill="#a855f7" />
    </svg>
  );
}

export function Wordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/pathroo-navbar.svg"
      alt="PATHROO"
      width={520}
      height={100}
      priority
      className={cn("h-auto shrink-0", className)}
      style={{ width: size * 5.2 }}
    />
  );
}
