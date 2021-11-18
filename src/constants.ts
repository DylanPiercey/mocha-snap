import { argv, env, cwd as getCwd } from "process";

export const cwd = getCwd();
export const snapDir = "__snapshots__";
export const update = env.UPDATE_SNAPSHOTS || argv.includes("--update");
