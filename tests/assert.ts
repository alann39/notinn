import { AssertionError } from "node:assert";
import { isDeepStrictEqual } from "node:util";

type ErrorConstructor<T extends Error = Error> = new (...args: never[]) => T;

function fail(message: string): never {
  throw new AssertionError({ message });
}

export function assert(
  condition: unknown,
  message = "Expected condition to be truthy",
): asserts condition {
  if (!condition) fail(message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(message ?? `Values are not equal: ${Deno.inspect(actual)} !== ${Deno.inspect(expected)}`);
  }
}

export function assertNotEquals<T>(actual: T, expected: T, message?: string): void {
  if (isDeepStrictEqual(actual, expected)) {
    fail(message ?? `Values are unexpectedly equal: ${Deno.inspect(actual)}`);
  }
}

function assertErrorType<T extends Error>(
  thrown: unknown,
  ErrorClass: ErrorConstructor<T> | undefined,
  messageIncludes: string | undefined,
): T {
  if (!(thrown instanceof Error)) fail("Expected an Error to be thrown");
  if (ErrorClass !== undefined && !(thrown instanceof ErrorClass)) {
    fail(`Expected ${ErrorClass.name}, received ${thrown.constructor.name}`);
  }
  if (messageIncludes !== undefined && !thrown.message.includes(messageIncludes)) {
    fail(`Expected error message to include ${JSON.stringify(messageIncludes)}`);
  }
  return thrown as T;
}

export function assertThrows<T extends Error = Error>(
  fn: () => unknown,
  ErrorClass?: ErrorConstructor<T>,
  messageIncludes?: string,
  message?: string,
): T {
  try {
    fn();
  } catch (thrown) {
    return assertErrorType(thrown, ErrorClass, messageIncludes);
  }
  fail(message ?? "Expected function to throw");
}

export async function assertRejects<T extends Error = Error>(
  fn: () => Promise<unknown>,
  ErrorClass?: ErrorConstructor<T>,
  messageIncludes?: string,
  message?: string,
): Promise<T> {
  try {
    await fn();
  } catch (thrown) {
    return assertErrorType(thrown, ErrorClass, messageIncludes);
  }
  fail(message ?? "Expected promise to reject");
}
