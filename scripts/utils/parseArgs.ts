/**
 * Parse CLI arguments of the form --key value or --flag into a Map.
 * --key value  → Map entry: "key" → "value"
 * --flag       → Map entry: "flag" → true
 */
export const parseArgs = (argv: string[]): Map<string, string | boolean> => {
  const result = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result.set(key, next);
        i++;
      } else {
        result.set(key, true);
      }
    }
  }
  return result;
};
