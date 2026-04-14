'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function TokenSetup() {
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = window.localStorage.getItem('cc-hub-token') ?? '';
    setToken(t);
    setSaved(t.length > 0);
    setOpen(t.length === 0);
  }, []);

  if (!open && saved) {
    return (
      <div className="flex justify-end">
        <button
          className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
          onClick={() => setOpen(true)}
        >
          API token を変更
        </button>
      </div>
    );
  }

  return (
    <Card className="border-amber-700/50 bg-amber-900/10">
      <div className="space-y-2">
        <div className="text-xs text-amber-300">
          Phase 1: 開発用の固定 Bearer トークンを入力してください (.env.local の
          RUNNER_API_TOKEN と一致させる)
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm font-mono"
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
