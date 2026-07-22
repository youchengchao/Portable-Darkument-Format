# E2E Test Infra: Portable-Darkument-Format S-Tier Workspace

## Test Philosophy
- Opaque-box, requirement-driven validation.
- Derived directly from `ORIGINAL_REQUEST.md`.
- Verifies Manifest V3 compliance, zero-flicker loading, color schemes, diagram protection, position memory resume, TOC, dark highlights & export, focus reading guides, reading analytics, and voluntary supporter framework.

## Feature Inventory & Test Coverage Requirements

| # | Feature | Requirement Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (Real-World) |
|---|---------|-------------------|:----------------:|:-----------------:|:--------------:|:------------------:|
| 1 | Zero-Flicker Dark Engine & Schemes | Spec §2 Module 1 | 5 | 5 | ✓ | ✓ |
| 2 | Diagram & Image Protection | Spec §2 Module 1 | 5 | 5 | ✓ | ✓ |
| 3 | Instant Position Resume (<100ms) | Spec §2 Module 2 | 5 | 5 | ✓ | ✓ |
| 4 | Interactive Dark TOC Navigation | Spec §2 Module 2 | 5 | 5 | ✓ | ✓ |
| 5 | Neon Text Highlighting & Note Export | Spec §2 Module 3 | 5 | 5 | ✓ | ✓ |
| 6 | Bionic Reading & Line Focus Ruler | Spec §2 Module 4 | 5 | 5 | ✓ | ✓ |
| 7 | Auto-Night Schedule | Spec §2 Module 4 | 5 | 5 | ✓ | ✓ |
| 8 | Reading Analytics & Streak Counter | Spec §2 Module 5 | 5 | 5 | ✓ | ✓ |
| 9 | Voluntary Donation & Supporter Framework | Spec §2 Module 6 | 5 | 5 | ✓ | ✓ |

## Minimum Target Thresholds
- Tier 1: 45 Test Cases (5 per feature across 9 features)
- Tier 2: 45 Test Cases (5 boundary/edge cases per feature)
- Tier 3: 15 Cross-feature interaction test cases
- Tier 4: 8 Real-world application workload scenarios
- Total Target: 113 Automated Test Cases

## Test Architecture
- Harness & Mock Engine: `tests/mocks/chrome-api-mock.js`
- Test Runner: Node.js native test runner (`node --test`) for fast unit/integration specs + headless script verification for MV3 extensions.
- Runner command: `npm test` or `node --test tests/unit/*.test.js tests/e2e/*.test.js`
- Entry point output: `TEST_READY.md` when fully verified.
