- First: support CSR then we can support SSR (unless its easier to support both)
- Figure out, do we need a Container type?
- What the heck is createConcurrentRoot? Do we need it?
- WTF is act? Do we need it?

Hints:
- Look through Qwik's existing types.


Dev entry that Qwik has

```tsx
/*
 * WHAT IS THIS FILE?
 *
 * Development entry point using only client-side modules:
 * - Do not use this mode in production!
 * - No SSR
 * - No portion of the application is pre-rendered on the server.
 * - All of the application is running eagerly in the browser.
 * - More code is transferred to the browser than in SSR mode.
 * - Optimizer/Serialization/Deserialization code is not exercised!
 */
import { render, type RenderOptions } from "@builder.io/qwik";
import Root from "./root";

export default function (opts: RenderOptions) {
  return render(document, <Root />, opts);
}
```