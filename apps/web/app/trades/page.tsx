import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";
import { TradesPanel } from "../components/TradesPanel";

export default function TradesPage() {
  return (
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>交易记录与心态复盘</p>
        </div>
      </header>

      <TradesPanel />
      <SelfCheckDock />
      <NotesDock />
    </main>
  );
}
