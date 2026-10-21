import { exitAfterRun } from "../exit-after-run";
import { run } from "../run";

/** Runs the command line as `bin.ts` does and then leaves a timer running, which would keep a process alive for good. */
exitAfterRun(
  await run(
    process.argv.slice(2),
    { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) },
    process.env,
  ),
);
setInterval(() => undefined, 1000);
