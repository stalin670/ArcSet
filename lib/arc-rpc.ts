export async function firstSuccessful<TInput, TResult>(
  inputs: readonly TInput[],
  action: (input: TInput) => Promise<TResult>,
): Promise<TResult> {
  let lastError: unknown;
  for (const input of inputs) {
    try {
      return await action(input);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No Arc RPC endpoints are configured.");
}
