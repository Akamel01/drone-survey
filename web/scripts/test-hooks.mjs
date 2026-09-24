// Lets `node --test` load the planner's route handlers as they are: they
// import "@/lib/x" (the tsconfig alias) and a few relative paths without an
// extension, both of which Next resolves and Node does not.
import { registerHooks } from "node:module";

const root = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, next) {
    const spec = specifier.startsWith("@/") ? new URL(specifier.slice(2), root).href : specifier;
    try {
      return next(spec, context);
    } catch (err) {
      if (/^[./]|^file:/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, context);
      throw err;
    }
  },
});
