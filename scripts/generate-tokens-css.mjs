// Writes apps/web/app/tokens.css from the shared design tokens.
// Usage: pnpm tokens:write
import { writeFileSync } from "node:fs";
import { tokensToTailwindCss } from "../packages/shared/src/tokens/css.ts";

const target = new URL("../apps/web/app/tokens.css", import.meta.url);
writeFileSync(target, tokensToTailwindCss());
console.log("Wrote apps/web/app/tokens.css");
