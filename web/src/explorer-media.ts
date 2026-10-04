import type { ExplorerState } from './explorer-types';

export function polishNoun(count: number, one: string, few: string, many: string) {
  return count === 1 ? one : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? few : many;
}
let audio: AudioContext | undefined;
export async function playExplorerSound(celebration = false) {
  try {
    audio ??= new AudioContext();
    await audio.resume();
    const start = audio.currentTime;
    (celebration ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 783.99]).forEach((frequency, index) => {
      const oscillator = audio!.createOscillator(), gain = audio!.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + index * .11);
      gain.gain.linearRampToValueAtTime(.055, start + index * .11 + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + index * .11 + .42);
      oscillator.connect(gain); gain.connect(audio!.destination);
      oscillator.start(start + index * .11); oscillator.stop(start + index * .11 + .44);
    });
  } catch { /* Sound is optional; the visible result always remains available. */ }
}
export async function exportExplorerCard(state: ExplorerState, name: string, badges: SVGSVGElement[]) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1440;
  const c = canvas.getContext('2d'); if (!c) throw new Error('Nie można przygotować obrazu w tej przeglądarce.');
  const accent = state.theme === 'sunset' ? '#ffc68b' : state.theme === 'night' ? '#d7c4ff' : '#c4f477';
  c.fillStyle = '#152c2a'; c.fillRect(0, 0, 1080, 1440);
  c.strokeStyle = '#2c4541'; c.lineWidth = 2;
  for (let x = -120; x < 1400; x += 130) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 330, 700); c.stroke(); }
  c.fillStyle = accent; c.font = 'bold 36px Arial'; c.fillText('ISKRY / KRAKÓW', 80, 100);
  c.fillStyle = '#fff9ed'; c.font = 'bold 64px Arial';
  let title = name.trim().slice(0, 32) || 'Miejski odkrywca';
  while (c.measureText(title).width > 920) title = title.slice(0, -1);
  c.fillText(title, 80, 246); c.font = '32px Arial'; c.fillText(state.rank.name, 80, 305);
  const badgeCount = Math.min(3, badges.length), badgeStart = (1080 - (badgeCount * 300 + (badgeCount - 1) * 20)) / 2;
  for (let i = 0; i < badgeCount; i++) {
    const svg = badges[i].cloneNode(true) as SVGSVGElement; svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '200'); svg.setAttribute('height', '214');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try { const img = new Image(); img.src = url; await img.decode(); c.drawImage(img, badgeStart + i * 320, 405, 300, 321); }
    finally { URL.revokeObjectURL(url); }
    const badge = state.badges.find(b => b.id === state.featured[i]);
    c.fillStyle = '#fff9ed'; c.font = 'bold 23px Arial'; c.textAlign = 'center';
    c.fillText(badge?.name || '', badgeStart + 150 + i * 320, 780); c.textAlign = 'left';
  }
  c.fillStyle = accent; c.font = 'bold 90px Arial'; c.fillText(String(state.stats.contributions), 80, 1000);
  c.fillStyle = '#fff9ed'; c.font = '32px Arial'; c.fillText(`${polishNoun(state.stats.contributions, 'obserwacja', 'obserwacje', 'obserwacji')} dla miasta`, 80, 1060);
  c.font = '25px Arial'; c.fillText(`${state.stats.refreshes} ${polishNoun(state.stats.refreshes, 'aktualizacja', 'aktualizacje', 'aktualizacji')} · ${state.stats.measurements} ${polishNoun(state.stats.measurements, 'pomiar', 'pomiary', 'pomiarów')} · ${state.stats.xp} XP`, 80, 1120);
  c.fillStyle = '#bcc9c1'; c.font = '22px Arial'; c.fillText('Obserwacje społeczności, bez niezależnego audytu.', 80, 1275);
  c.fillText(`Stan na ${new Date().toLocaleDateString('pl-PL')}`, 80, 1315);
  c.fillStyle = accent; c.font = 'bold 25px Arial'; c.fillText('miastowzasiegu.pl/gra', 80, 1370);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Nie udało się przygotować karty.')), 'image/png'));
  return new File([blob], 'iskry-moje-osiagniecia.png', { type: 'image/png' });
}
export function downloadExplorerCard(file: File) {
  const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = file.name;
  a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
