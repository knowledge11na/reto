'use client';

import { useRouter } from 'next/navigation';

const base = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 999,
  border: 'none',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
};

export default function FreeRematchButtons({ roomId, style }) {
  const router = useRouter();
  const room = String(roomId || '').replace(/\D/g, '').slice(0, 4);
  const go = (after) => router.push(`/rate-match?freeRoom=${room}&after=${after}`);

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 20, ...style }}>
      <button type="button" style={{ ...base, background: '#2563eb', color: '#fff' }} onClick={() => go('same')}>
        同じゲームで遊ぶ
      </button>
      <button type="button" style={{ ...base, background: '#e2e8f0', color: '#334155' }} onClick={() => go('select')}>
        ゲームを選び直す
      </button>
    </div>
  );
}
