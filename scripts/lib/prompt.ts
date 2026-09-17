/**
 * Ask before doing something that affects a live Telegram bot.
 *
 * Registering or removing a webhook changes where a real user's messages are
 * delivered. Getting it wrong is not a local mistake: messages go to the wrong
 * place, or stop arriving entirely, and the only symptom is silence.
 *
 * So these scripts do not act on a bare invocation. In an interactive terminal
 * they ask. Outside one they refuse unless `--yes` was passed, because the
 * common way to run a destructive command by accident is from another script.
 */

const CONFIRMATION_FLAG = "--yes";

/** Whether the caller pre-approved the action. */
export function hasConfirmationFlag(args: readonly string[]): boolean {
  return args.includes(CONFIRMATION_FLAG);
}

/**
 * Require confirmation before continuing.
 *
 * Returns normally when the action may proceed and throws otherwise, so callers
 * read as a guard clause rather than a branch.
 */
export async function requireConfirmation(
  args: readonly string[],
  question: string,
): Promise<void> {
  if (hasConfirmationFlag(args)) return;

  if (!Deno.stdin.isTerminal()) {
    throw new Error(
      `Refusing to continue without confirmation. Re-run with ${CONFIRMATION_FLAG} to approve.`,
    );
  }

  const answer = await readLine(`${question} [y/N] `);
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new Error("Cancelled.");
  }
}

async function readLine(prompt: string): Promise<string> {
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  const buffer = new Uint8Array(256);
  const read = await Deno.stdin.read(buffer);
  if (read === null) return "";

  return new TextDecoder().decode(buffer.subarray(0, read));
}
