import path from "node:path";

/**
 * 项目根目录：crypto-market-monitor
 *
 * src/config/paths.ts 与 dist/config/paths.js 的深度都是 <root>/apps/server/<x>/config，
 * 因此向上四层即为项目根目录。
 */
export const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
