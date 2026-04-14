import { pack } from 'tar-stream';
import { Readable } from 'node:stream';

export interface TarEntry {
  name: string;
  content: Buffer;
  mode?: number;
  mtime?: Date;
}

/**
 * tar-stream で Docker putArchive 向けの tar バッファを生成する。
 * 小さいファイル群向け。巨大ファイルは streaming 版が必要 (将来課題)。
 */
export async function packEntriesToTar(entries: TarEntry[]): Promise<Readable> {
  const tarPack = pack();
  for (const e of entries) {
    await new Promise<void>((resolve, reject) => {
      tarPack.entry(
        { name: e.name, size: e.content.length, mode: e.mode ?? 0o644, mtime: e.mtime ?? new Date() },
        e.content,
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }
  tarPack.finalize();
  return Readable.from(tarPack);
}
