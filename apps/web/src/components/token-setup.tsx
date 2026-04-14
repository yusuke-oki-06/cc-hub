'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function TokenSetup() {
  const [token, setToken] = useState('');
  // open === null means "still reading localStorage"; we render nothing until
  // hydration settles to avoid the yellow form flashing for users who already
  // have a token saved.
  const [open, setOpen] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = window.localStorage.getItem('cc-hub-token') ?? '';
    setToken(t);
    setSaved(t.length > 0);
    setOpen(t.length === 0);
  }, []);

  if (open === null) return null;

  if (!open && saved) {
    return (
      <div className="flex justify-end">
        <button
          className="font-sans text-[12px] text-stone underline decoration-dotted hover:text-olive"
          onClick={() => setOpen(true)}
        >
          API token を変更
        </button>
      </div>
    );
  }

  return (
    <Card className="border-[#e3d196] bg-[#faf3dd]">
      <div className="space-y-3">
        <div className="font-sans text-[13px] text-[#7a5a12]">
          Phase 1: 開発用の固定 Bearer トークンを入力してください。
          <span className="font-mono text-[11px]">.env.local</span> の{' '}
          <span className="font-mono text-[11px]">RUNNER_API_TOKEN</span> と一致が必要。
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-card border border-border-warm bg-white px-3 py-2 font-mono text-[13px] text-near placeholder:text-stone"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="dev-token-..."
          />
          <Button
            onClick={() => {
              window.localStorage.setItem('cc-hub-token', token);
              setSaved(true);
              setOpen(false);
              window.location.reload();
            }}
          >
            保存
          </Button>
        </div>
      </div>
    </Card>
  );
}
