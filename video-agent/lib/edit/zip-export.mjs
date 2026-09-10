import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const updateCRC = (crc, bytes) => {
  for (const value of bytes) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  return crc >>> 0;
};
const limit = 0xffffffff;
function active(signal) {
  if (signal?.aborted)
    throw Object.assign(new Error("任务已取消"), { name: "AbortError" });
}
/** Streaming standard ZIP (STORE). Does not buffer videos or depend on tar/Python.
 * ZIP64 is intentionally rejected with a clear error before publication.
 * Output is published only after the central directory is complete.
 */
export async function exportProjectZip(
  directory,
  names,
  { signal, output = "project.zip", maxBytes = limit - 1 } = {},
) {
  const root = path.resolve(directory),
    entries = [],
    seen = new Set();
  async function visit(name) {
    active(signal);
    const file = path.resolve(root, name),
      relative = path.relative(root, file);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    )
      throw Error("工程文件路径超出目录");
    const st = await fs.lstat(file);
    if (st.isSymbolicLink()) throw Error("工程导出不允许符号链接");
    if (st.isDirectory()) {
      for (const child of (await fs.readdir(file)).sort())
        await visit(path.join(relative, child));
      return;
    }
    if (!st.isFile()) throw Error("工程导出仅支持普通文件");
    const archive = relative.split(path.sep).join("/");
    if (seen.has(archive)) return;
    seen.add(archive);
    if (st.size >= limit)
      throw Error("单文件超过 ZIP 大小限制，请单独保留原素材");
    const nameBytes = Buffer.from(archive);
    if (nameBytes.length > 65535) throw Error("工程文件名过长");
    entries.push({ file, nameBytes, size: st.size });
  }
  for (const name of names) await visit(name);
  const bytes = entries.reduce(
    (sum, e) =>
      sum + e.size + 30 + e.nameBytes.length + 16 + 46 + e.nameBytes.length,
    22,
  );
  if (entries.length > 65535 || bytes > Math.min(maxBytes, limit - 1))
    throw Error("工程包超过 4 GB ZIP 限制，请分开导出素材");
  const destination = path.resolve(root, output);
  if (path.dirname(destination) !== root)
    throw Error("工程包必须保存在版本目录");
  const temporary = destination + "." + randomUUID() + ".partial";
  let handle,
    offset = 0;
  const central = [];
  async function write(buffer) {
    active(signal);
    let written = 0;
    while (written < buffer.length) {
      const { bytesWritten } = await handle.write(
        buffer,
        written,
        buffer.length - written,
        offset,
      );
      if (!bytesWritten) throw Error("工程包写入失败");
      written += bytesWritten;
      offset += bytesWritten;
    }
  }
  try {
    handle = await fs.open(temporary, "wx");
    for (const e of entries) {
      const start = offset,
        header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x808, 6);
      header.writeUInt16LE(33, 12);
      header.writeUInt16LE(e.nameBytes.length, 26);
      await write(header);
      await write(e.nameBytes);
      let crc = 0xffffffff,
        size = 0;
      for await (const chunk of createReadStream(e.file, { signal })) {
        size += chunk.length;
        if (size > e.size) throw Error("工程文件在打包期间被修改");
        crc = updateCRC(crc, chunk);
        await write(chunk);
      }
      if (size !== e.size) throw Error("工程文件在打包期间被修改");
      crc = (crc ^ 0xffffffff) >>> 0;
      const desc = Buffer.alloc(16);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc, 4);
      desc.writeUInt32LE(size, 8);
      desc.writeUInt32LE(size, 12);
      await write(desc);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x808, 8);
      c.writeUInt16LE(33, 14);
      c.writeUInt32LE(crc, 16);
      c.writeUInt32LE(size, 20);
      c.writeUInt32LE(size, 24);
      c.writeUInt16LE(e.nameBytes.length, 28);
      c.writeUInt32LE(start, 42);
      central.push(c, e.nameBytes);
    }
    const centralStart = offset;
    for (const chunk of central) await write(chunk);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - centralStart, 12);
    end.writeUInt32LE(centralStart, 16);
    await write(end);
    await handle.sync();
    await handle.close();
    handle = null;
    active(signal);
    await fs.rename(temporary, destination);
    return { file: destination, files: entries.length, bytes: offset };
  } finally {
    await handle?.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
