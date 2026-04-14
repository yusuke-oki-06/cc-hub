import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CC Hub',
  description: 'Claude Code ベースの社内 AI 業務アシスタント基盤',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
