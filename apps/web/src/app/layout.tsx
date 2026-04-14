import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CC Hub — 社内 AI 業務アシスタント',
  description:
    'Claude Code をベースとした社内向け AI 業務アシスタント基盤。Phase 1 PoC (本人ローカル)。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
