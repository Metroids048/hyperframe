import path from "node:path";
import { fileURLToPath } from "node:url";
// Load before media modules resolve their executable paths. Existing exported
// environment variables retain precedence; never log the file contents.
try {
  process.loadEnvFile(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../config/edit.local.env",
    ),
  );
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error(
      "本地剪辑配置无法读取，请检查 config/edit.local.env 的格式",
    );
}
