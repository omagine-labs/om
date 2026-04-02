/**
 * Global setup that runs once before all test files
 * Used to suppress dotenv promotional messages
 */

// Suppress dotenv promotional messages globally
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: any, ...args: any[]): boolean => {
  const str = chunk.toString();
  // Filter out dotenv promotional messages
  if (str.includes('[dotenv@') || str.includes('dotenvx.com')) {
    return true;
  }
  return originalStdoutWrite(chunk, ...args);
}) as typeof process.stdout.write;

export default function globalSetup() {
  // Setup runs at module load time via the stdout override above
  return () => {
    // Teardown - restore original stdout.write
    process.stdout.write = originalStdoutWrite;
  };
}
