export function isEditorBusy(error: unknown): boolean {
  return error instanceof Error && /timed out/i.test(error.message);
}

const busyReadAttempts = 40;
const busyReadPauseMs = 2000;

/** Reads are safe to repeat; a busy editor (a page just created, a large paste) answers them late, so ask again rather than stop the run. */
export async function whileEditorBusy<T>(
  read: () => Promise<T>,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (!isEditorBusy(error) || attempt >= busyReadAttempts) {
        throw error;
      }
      await sleep(busyReadPauseMs);
    }
  }
}
