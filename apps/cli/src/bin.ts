#!/usr/bin/env node
import { armHardExit, exitAfterRun } from "./exit-after-run";
import { run } from "./run";

exitAfterRun(
  await run(
    process.argv.slice(2),
    {
      out: (text) => process.stdout.write(text),
      err: (text) => process.stderr.write(text),
    },
    process.env,
    process.cwd(),
    { onStopping: () => armHardExit(30_000) },
  ),
);
