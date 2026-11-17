import { spawn } from "node:child_process";

export class CommandError extends Error {
  stdout: string;
  stderr: string;
  exitCode: number | null;

  constructor(
    message: string,
    details: { stdout?: string; stderr?: string; exitCode?: number | null } = {}
  ) {
    super(message);
    this.name = "CommandError";
    this.stdout = details.stdout ?? "";
    this.stderr = details.stderr ?? "";
    this.exitCode = details.exitCode ?? null;
  }
}

function appendOutput(current: string, chunk: Buffer, limit: number) {
  const next = current + chunk.toString("utf8");
  return next.length > limit ? next.slice(-limit) : next;
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    maxOutputCharacters?: number;
    onOutput?: (output: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const outputLimit = options.maxOutputCharacters ?? 64_000;

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason);
      return;
    }
    // The command is an explicitly configured executable, not a project file
    // dependency that Next.js should include in its output trace.
    const child = spawn(/* turbopackIgnore: true */ command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const abort = () => child.kill("SIGKILL");
    options.signal?.addEventListener("abort", abort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk, outputLimit);
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk, outputLimit);
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      reject(
        new CommandError(`Unable to start ${command}: ${error.message}`, {
          stdout,
          stderr
        })
      );
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) {
        reject(options.signal.reason);
      } else if (timedOut) {
        reject(
          new CommandError(`${command} timed out.`, {
            stdout,
            stderr,
            exitCode
          })
        );
      } else if (exitCode !== 0) {
        reject(
          new CommandError(`${command} exited with status ${exitCode}.`, {
            stdout,
            stderr,
            exitCode
          })
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
