import { useNavigate } from 'react-router-dom';
import { SchoolOptionsPanel } from '../components/forms';
import { Icon } from '../components/ui';
import { useSettings } from '../lib/settings';

export function SettingsPage() {
  const [s, set] = useSettings();
  const navigate = useNavigate();
  return (
    <main className="container page">
      <div className="read stack-lg">
        <div className="topbar">
          <button type="button" className="icon-btn back-btn" aria-label="돌아가기" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            {Icon.back}
          </button>
          <span />
        </div>
        <h1>설정</h1>
        <SchoolOptionsPanel school={s.school} saju={s.sajuOpts} onSchool={(school) => set({ ...s, school })} onSaju={(sajuOpts) => set({ ...s, sajuOpts })} />
      </div>
    </main>
  );
}
