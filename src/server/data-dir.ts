import { join } from "node:path";

/**
 * Where the local stores keep their files.
 *
 * `.data` next to the server, unless `LOADREADY_DATA_DIR` says otherwise.
 *
 * The override exists because the unit tests were writing into the real store.
 * A test that published a policy left it published, and the next end-to-end run
 * found every pilot blocked behind an acceptance the test had created — the
 * suites were quietly corrupting each other's state and mine, through the
 * working directory.
 *
 * `tests/setup.ts` points this at a temporary directory, so a test can write
 * whatever it likes and nothing of the developer's survives it.
 */
export function dataDir(): string {
  return process.env.LOADREADY_DATA_DIR || join(process.cwd(), ".data");
}

export function dataFile(name: string): string {
  return join(dataDir(), name);
}
