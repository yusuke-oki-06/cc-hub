import type { Metadata } from 'next';
import { Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'CC Hub',
  description: 'Claude Code ベースの社内向けアシスタント基盤',
};

// Inline script that applies the persisted theme BEFORE the first paint so
// there's no flash of the default theme when the user has opted into a
// different one. Kept minimal (IIFE, no external deps).
const themeBootstrap = `(function(){try{var t=localStorage.getItem('cc-hub-theme');if(t==='airbnb'||t==='parchment')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
