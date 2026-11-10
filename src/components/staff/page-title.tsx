"use client";

import { usePathname } from "next/navigation";
import { staffNavGroups } from "./nav-items";

/**
 * The left side of the page header: the sidebar icon for this page, the
 * section it's in, the title and the description. Client-side because it
 * looks the page up by its address.
 */
export function PageTitle({ title, description }: { title: string; description?: string }) {
  const pathname = usePathname() ?? "";
  let best: { group: string; item: (typeof staffNavGroups)[number]["items"][number] } | null = null;
  for (const g of staffNavGroups)
    for (const i of g.items)
      if ((pathname === i.href || pathname.startsWith(`${i.href}/`)) && (!best || i.href.length > best.item.href.length)) best = { group: g.label, item: i };
  const Icon = best?.item.icon;
  return (
    <div className="flex min-w-0 items-center gap-4">
      {Icon && (
        <span aria-hidden className="page-header-icon grid size-14 shrink-0 place-items-center rounded-2xl text-white">
          <Icon className="size-7" />
        </span>
      )}
      <div className="min-w-0">
        {best && <p className="text-[0.7rem] font-bold tracking-[0.14em] text-ember-ink uppercase">{best.group}</p>}
        <h1 className="font-heading text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-pretty text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
