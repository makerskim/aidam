import { SchoolOptionsPanel } from '../components/forms';
import { useSettings } from '../lib/settings';

export function SettingsPage() {
  const [s, set] = useSettings();
  return (
    <main className="container narrow page stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <h1>설정</h1>
        <p style={{ color: 'var(--text-2)' }}>학파마다 다르게 보는 부분을 고를 수 있어요. 바꾸면 다음 작명부터 적용돼요.</p>
      </div>
      <div className="card">
        <SchoolOptionsPanel school={s.school} saju={s.sajuOpts} onSchool={(school) => set({ ...s, school })} onSaju={(sajuOpts) => set({ ...s, sajuOpts })} />
      </div>
    </main>
  );
}
