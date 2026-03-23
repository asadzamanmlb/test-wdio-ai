---
name: fix-tests-add-skills
description: When fixing a failing test, add or update skills in .cursor/skills/ so the fix can be reused for other scenarios. Use when fixing automated tests, step definitions, Cucumber scenarios, or when the user asks to capture fixes as skills.
---

# Add Skills When Fixing Tests

## Rule

**After fixing a failing test, add or update skills** in `.cursor/skills/` so the fix can be reused for other scenarios.

## What to Capture

When you fix a test, extract reusable knowledge:

| Fix type | Where to capture | Example |
|----------|------------------|---------|
| Duplicate / override step | webtv-test-automate | "Remove stub, add comment pointing to platform file" |
| Reused step implementation | webtv-test-automate | "Extract shared function, add alias pattern in same file" |
| New page object / selector | webtv-test-automate or page-object-patterns | Selector patterns, fallbacks |
| Domain-specific flow | New or existing skill | e.g. Hide Spoilers → Settings > General |
| Waits / navigation | wdio-waits-and-flows | Timeout values, waitUntil patterns |
| Cucumber syntax | cucumber-step-definitions | Regex vs string pattern, special chars; "is not defined" when step has () — use regex |
| Agent says "Unfixable" but real error is Not implemented | webtv-test-automate | Extract failReason from stdout when Cucumber JSON report missing; try multiple report filenames |

## Workflow

1. **Fix the test** — Make the change that fixes the failure
2. **Identify reusable pattern** — Is this fix applicable to other scenarios?
3. **Update or create skill** — Add to existing skill (e.g. webtv-test-automate) or create new if domain-specific
4. **Be concise** — Skills should be short; add only what future scenarios need

## Existing Skills to Update

- `webtv-test-automate` — Step defs, Media Center, duplicate steps, Hide Spoilers, reuse patterns
- `cucumber-step-definitions` — Step syntax, patterns, Xray mapping
- `page-object-patterns` — MLB WebTV, Okta locators
- `wdio-waits-and-flows` — Waits, Okta, redirects

## When to Create a New Skill

Create a new skill when:
- The fix is a distinct domain (e.g. "Hide Spoilers flows") not covered by existing skills
- The pattern will apply across many scenarios

Otherwise, add to the most relevant existing skill.
