"use client";

import type { ReferenceTagItem } from "../lib/reference-trends";

interface ReferenceTagsProps {
  items: ReferenceTagItem[];
  empty?: string;
}

export function ReferenceTags({
  items,
  empty = "—"
}: ReferenceTagsProps) {
  if (items.length === 0) {
    return <span className="reference-empty">{empty}</span>;
  }

  return (
    <span className="reference-tags">
      {items.map((item) => (
        <span
          className={`reference-tag ${item.direction}`}
          title={item.title}
          key={item.interval}
        >
          <span className="reference-arrow">
            {item.label}
          </span>
          {item.flags.length > 0 && (
            <span className="reference-flags">
              {item.flags.join("/")}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
