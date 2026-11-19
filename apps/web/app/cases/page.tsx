import { CasesPanel } from "../components/CasesPanel";
import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";

export default function CasesPage() {
  return (
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>交易案例与复盘截图</p>
        </div>
      </header>

      <CasesPanel />
      <SelfCheckDock />
      <NotesDock />
    </main>
  );
}
