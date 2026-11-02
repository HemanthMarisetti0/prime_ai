import { execFile } from 'node:child_process';

const TIMEOUT_MS = 20_000;

/**
 * Runs a PowerShell script built from fixed, trusted snippets (never raw user text)
 * and resolves with its standard output.
 */
export function runPowerShell(script: string, timeoutMs = TIMEOUT_MS): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(new Error((stderr || error.message).trim().slice(0, 300)));
        else resolve(stdout.trim());
      },
    );
  });
}
