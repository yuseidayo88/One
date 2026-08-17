import path from "node:path";

/** ログイン済みセッションの保存先（auth.setup.ts が作成する） */
export const STORAGE_STATE = path.join(process.cwd(), ".auth", "storage-state.json");
