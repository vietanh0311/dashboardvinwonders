"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LastSyncBadge from "@/components/LastSyncBadge";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Content" },
  { href: "/creators", label: "Creators" },
  { href: "/trends", label: "Signals" },
  { href: "/actions", label: "Cần xử lý" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1.5">
      <nav className="flex gap-1 rounded-lg border border-emerald-100 bg-white p-1 shadow-sm">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-emerald-50"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <LastSyncBadge />
    </div>
  );
}
