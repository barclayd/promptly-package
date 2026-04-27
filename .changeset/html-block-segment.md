---
'@promptlycms/prompts': minor
---

Add `html_block` segment type for raw-HTML blocks authored in the Promptly composer. Variable references inside HTML blocks are interpolated normally; embedded prompt references are passed through opaquely. Codegen extracts variable names from html_block content.
