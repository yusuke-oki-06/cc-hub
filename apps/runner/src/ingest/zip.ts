import yauzl from 'yauzl';
import { Readable } from 'node:stream';
import { pack } from 'tar-stream';
import {
  MAX_EXTRACTED_BYTES,
  MAX_FILE_COUNT_IN_ARCHIVE,
  assertSafeArchiveEntry,
} from './validation.js';

/**
 * zip ファイルを解凍し、そのまま tar stream に詰め替えて返す。
 * Docker putArchive 先にパイプして /workspace に配置できる。
 * validate: zip bomb (ファイル数/展開後サイズ), traversal, null byte。
 */
export async function zipToTar(zipBuffer: Buffer): Promise<Readable> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error('failed to open zip'));

      const tarPack = pack();
      let fileCount = 0;
      let totalExtracted = 0;

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        fileCount += 1;
        if (fileCount > MAX_FILE_COUNT_IN_ARCHIVE) {
          zipfile.close();
          tarPack.destroy(new Error('zip_bomb_too_many_files'));
          return;
        }
        const check = assertSafeArchiveEntry(entry.fileName);
        if (!check.ok) {
          zipfile.close();
          tarPack.destroy(new Error(`unsafe_path:${check.reason}`));
          return;
        }
        if (/\/$/.test(entry.fileName)) {
          tarPack.entry({ name: entry.fileName, type: 'directory' });
          zipfile.readEntry();
          return;
        }
        totalExtracted += entry.uncompressedSize;
        if (totalExtracted > MAX_EXTRACTED_BYTES) {
          zipfile.close();
          tarPack.destroy(new Error('zip_bomb_extracted_too_large'));
          return;
        }
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close();
            tarPack.destroy(streamErr ?? new Error('open_stream_failed'));
            return;
          }
          const tarEntry = tarPack.entry(
            { name: entry.fileName, size: entry.uncompressedSize },
            (tarErr) => {
              if (tarErr) {
                zipfile.close();
                tarPack.destroy(tarErr);
                return;
              }
              zipfile.readEntry();
            },
          );
          readStream.pipe(tarEntry);
        });
      });

      zipfile.once('end', () => tarPack.finalize());
      zipfile.once('error', (e) => tarPack.destroy(e));

      resolve(Readable.from(tarPack));
    });
  });
}
