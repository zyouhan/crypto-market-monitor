import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";
import { SelfCheckMonitor } from "../components/SelfCheckMonitor";
import { SelfCheckRecords } from "../components/SelfCheckRecords";

export default function SelfCheckRecordsPage() {
  return (
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>开单记录与复盘</p>
        </div>
      </header>

      <SelfCheckMonitor />
      <SelfCheckRecords />
      <SelfCheckDock />
      <NotesDock />
    </main>
  );
}
