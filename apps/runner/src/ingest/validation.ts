import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB (ADR 0005 では 100MB だったが要件変更で 2GB)
export const MAX_FILE_COUNT_IN_ARCHIVE = 20_000;
export const MAX_EXTRACTED_BYTES = 10 * 1024 * 1024 * 1024; // 10GB 展開後

export const ALLOWED_UPLOAD_EXTENSIONS = [
  // archives
  '.zip', '.tar', '.gz', '.tgz',
  // packet captures
  '.pcap', '.pcapng', '.cap',
  // office
  '.xlsx', '.xlsm', '.xls', '.csv', '.tsv',
  '.pptx', '.ppt',
  '.docx', '.doc',
  '.pdf',
  // text / structured
  '.txt', '.md', '.log', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  // images (小規模まで許容、Claude は画像入力対応)
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
];

export const GitCloneInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith('https://'),
      'HTTPS URL のみ許可 (ssh/git/file は不可)',
    )
    .refine((u) => !u.includes('..'), 'URL に .. を含めることは不可'),
  branch: z.string().regex(/^[\w./-]{1,128}$/).optional(),
  depth: z.number().int().positive().max(50).default(1),
  pat: z.string().optional(),
});
export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;

/**
 * アップロードされたファイル名の最終検証。
 * パストラバーサル対策と拡張子 allowlist の両方を実施。
 */
export function assertSafeArchiveEntry(entryName: string): { ok: true } | { ok: false; reason: string } {
  const normalized = entryName.replaceAll('\\', '/');
  if (normalized.startsWith('/')) return { ok: false, reason: 'absolute path not allowed' };
  if (normalized.includes('..')) return { ok: false, reason: 'path traversal detected' };
  if (normalized.includes('\0')) return { ok: false, reason: 'null byte in path' };
  if (normalized.length > 1024) return { ok: false, reason: 'path too long' };
  return { ok: true };
}

export function assertAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
