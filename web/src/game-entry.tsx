import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './display-settings.css';
import BrandMark from './BrandMark';
import MotionPolicy from './MotionPolicy';
import { applyDisplayPreferences } from './display-preferences';
import { isNativeApp } from './native';

const AuthProvider = lazy(() => import('./auth/AuthProvider'));
const Game = lazy(() => import('./Game'));

applyDisplayPreferences();
window.addEventListener('storage', () => applyDisplayPreferences());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionPolicy>
      <Suspense fallback={<div className="boot-screen"><BrandMark /><p>Otwieramy Iskry Miasta…</p></div>}>
        <AuthProvider><Game /></AuthProvider>
      </Suspense>
    </MotionPolicy>
  </StrictMode>,
);

if (!isNativeApp() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
