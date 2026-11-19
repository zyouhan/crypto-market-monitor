"use client";

import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";
import { StrategyStatsPanel } from "../components/StrategyStatsPanel";

export default function StrategyStatsPage() {
  return (
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>策略统计与复盘</p>
        </div>
      </header>

      <StrategyStatsPanel pageMode onChanged={() => undefined} />
      <SelfCheckDock />
      <NotesDock />
    </main>
  );
}
