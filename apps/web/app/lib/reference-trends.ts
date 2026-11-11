export interface ReferenceTrendLike {
  interval: string;
  direction: "up" | "down";
  turning: boolean;
  accelerating: boolean;
  weakening: boolean;
}

export interface ReferenceTagItem {
  interval: string;
  direction: "up" | "down";
  arrow: string;
  flags: string[];
  label: string;
  title: string;
}

export function referenceTagItems(
  trends:
    | Record<string, ReferenceTrendLike | null | undefined>
    | null
    | undefined
): ReferenceTagItem[] {
  if (!trends) {
    return [];
  }

  return ["15m", "1h", "4h"]
    .map((interval) => {
      const trend = trends[interval];

      if (!trend) {
        return null;
      }

      const arrow = trend.direction === "up" ? "↑" : "↓";
      const flags = [
        trend.turning ? "拐头" : "",
        trend.accelerating ? "加速" : "",
        trend.weakening ? "走弱" : ""
      ].filter(Boolean);

      return {
        interval,
        direction: trend.direction,
        arrow,
        flags,
        label: `${interval}${arrow}`,
        title: `${interval} ${
          trend.direction === "up" ? "向上" : "向下"
        }${flags.length > 0 ? ` · ${flags.join(" / ")}` : ""}`
      };
    })
    .filter((item): item is ReferenceTagItem => item !== null);
}
