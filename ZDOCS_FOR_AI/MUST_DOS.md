# Must-Dos — Rules for Ammar, Teammate, and AI

## AI (Claude)

- [ ] Before writing any code, state what the code is supposed to do and list verification steps — don't just start writing
- [ ] Don't add features or complexity that aren't in the plan without asking first
- [ ] When stuck or uncertain about an API response shape, say so — don't hallucinate a field name
- [ ] After writing a function, immediately write the verification test or checklist for it — don't leave it for later
- [ ] Never add a new dependency or change a root config file (tsconfig, eslint, esbuild, package.json, etc.) without first verifying the change against current official docs & internet & npm — do not rely on memory for version numbers or API signatures
- [ ] Try to see what extensions, plugins, connectors, etc. you have access to and ask to use them before building each plan or new task.
- [ ] always add a last step/phase/stage in implmentation plan for updating docs present in repo