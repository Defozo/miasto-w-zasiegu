import { Compass, RefreshCw, Ruler, Armchair, DoorOpen, Layers } from 'lucide-react';
import { useId } from 'react';
import type { ExplorerBadge } from './explorer-types';

const palettes: Record<string, [string, string, string]> = {
  mint: ['#c4f477', '#79b847', '#183c31'], blue: ['#b9dcff', '#80a6e3', '#173960'],
  orange: ['#ffc68b', '#ee9666', '#6b3520'], pink: ['#f9bad1', '#d983a9', '#632d49'],
  violet: ['#d7c4ff', '#ae91e3', '#432a6b'], yellow: ['#f8e498', '#dabc62', '#534722'],
};
const icons = { compass: Compass, refresh: RefreshCw, ruler: Ruler, bench: Armchair, door: DoorOpen, layers: Layers };
export default function ExplorerBadgeArt({ badge, locked = false, large = false }: { badge: Pick<ExplorerBadge, 'icon' | 'color' | 'level'>; locked?: boolean; large?: boolean }) {
  const id = useId().replaceAll(':', ''), [light, base, ink] = palettes[badge.color] || palettes.mint;
  const Icon = icons[badge.icon as keyof typeof icons] || Compass;
  return <svg className={`ex-badge-art ${locked ? 'is-locked' : ''} ${large ? 'is-large' : ''}`} viewBox="0 0 200 214" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={light} /><stop offset="1" stopColor={base} /></linearGradient></defs>
    <path d="m66 153-6 52 40-17 40 17-6-52Z" fill={ink} /><path d="m72 161-4 30 32-13 32 13-4-30Z" fill={light} />
    <path d="M100 9 168 45l16 72-46 54H62l-46-54 16-72Z" fill={ink} />
    <path d="M100 17 161 50l14 64-41 49H66l-41-49 14-64Z" fill={`url(#${id})`} stroke={light} strokeWidth="2" />
    <path d="M100 29 150 56l12 55-34 40H72l-34-40 12-55Z" fill="none" stroke={ink} strokeOpacity=".32" strokeDasharray="2 5" />
    <circle cx="100" cy="90" r="43" fill={ink} />
    <circle cx="100" cy="90" r="36" fill="none" stroke={light} strokeOpacity=".45" />
    <Icon x={76} y={66} width={48} height={48} stroke={light} strokeWidth={1.5} />
    <path d="m44 58 22-13m-25 22 16-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".65" />
    {[0, 1, 2].map(n => <circle key={n} cx={84 + 16 * n} cy="143" r="4" fill={n < Math.max(1, badge.level) ? ink : light} stroke={ink} strokeWidth="1" />)}
  </svg>;
}
