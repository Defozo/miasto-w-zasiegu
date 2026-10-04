import { lazy, Suspense } from 'react';
const ExplorerGame = lazy(() => import('./ExplorerGame'));
const GardenGame = lazy(() => import('./GardenGame'));
export default function Game() {
  return <Suspense fallback={<p role="status">Otwieramy Iskry Miasta…</p>}>
    {new URLSearchParams(location.search).get('tryb') === 'ogrod' ? <GardenGame /> : <ExplorerGame />}
  </Suspense>;
}
