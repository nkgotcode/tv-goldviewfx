<!--
Sync Impact Report
- Version change: TEMPLATE -> 1.0.0
- Modified principles:
  - Principle 1 placeholder -> I. Code Quality & Maintainability
  - Principle 2 placeholder -> II. Testing & Regression Safety
  - Principle 3 placeholder -> III. User Experience Consistency
  - Principle 4 placeholder -> IV. Performance & Resource Efficiency
  - Principle 5 placeholder -> V. Security & Data Protection
- Added sections: None
- Removed sections: None
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
  - ⚠ .specify/templates/commands/*.md (directory missing)
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): original adoption date not recorded
-->

# tv-goldviewfx Constitution

## Core Principles

### I. Code Quality & Maintainability
Code changes MUST be clear, minimal, and consistent with existing style and
architecture. New public behavior MUST include error handling and
documentation for flags, outputs, or schemas. Rationale: maintainable code
reduces defect rates and onboarding time.

### II. Testing & Regression Safety
Every change MUST include automated tests that cover new or changed behavior.
Bug fixes MUST add a regression test that fails before the fix. Exceptions
require a written rationale in the spec and a follow-up task to add tests.
Rationale: tests are the primary guardrail against regressions.

### III. User Experience Consistency
User-facing behavior (CLI flags, output formats, schemas, messages) MUST follow
established patterns or include a documented migration and compatibility plan.
UX or copy changes MUST use project terminology and acceptance scenarios.
Rationale: consistency preserves trust and reduces support overhead.

### IV. Performance & Resource Efficiency
Changes MUST meet defined performance budgets and avoid unbounded concurrency or
memory growth. Any change that could impact runtime or IO MUST include baseline
measurements and a validation plan; regressions over 20% require approval and a
mitigation plan. Rationale: predictable performance keeps ingestion reliable.

### V. Security & Data Protection
Inputs MUST be validated and queries MUST be parameterized. Secrets MUST never
be committed or logged, and external access MUST use least-privilege
credentials. Dependencies MUST be reviewed for known vulnerabilities, and
sensitive data MUST be redacted from logs and outputs. Rationale: security
protects users and preserves operational integrity.

## Non-Functional Standards

- Performance budgets MUST be documented in each feature spec, including
  baseline capture when no prior measurement exists.
- Network access MUST respect configured concurrency and delay controls; new
  external calls MUST include timeouts and retry/backoff behavior.
- Data handling MUST avoid loading unbounded datasets into memory; stream or
  paginate when volume can grow.
- SQL changes MUST include index considerations for expected access patterns.
- Security reviews MUST verify secret handling, data redaction, and least
  privilege for credentials and database roles.

## Development Workflow & Quality Gates

- Every change MUST include: lint/format pass, type check where applicable, and
  required tests per the Testing principle.
- Specs and plans MUST document UX consistency impacts, performance budgets, and
  security considerations before implementation begins.
- Code reviews MUST confirm constitution compliance; exceptions require explicit
  approval and documented follow-up tasks.

## Governance

- This constitution supersedes other project practices; conflicting guidance
  MUST be reconciled via amendment.
- Amendment process: propose change, document rationale and migration impact,
  update templates, and record a version bump in this file.
- Versioning policy: MAJOR for removals or weakened principles, MINOR for new
  principles or materially expanded constraints, PATCH for clarifications.
- Compliance review: every spec/plan MUST include a Constitution Check; PRs
  must verify compliance or record approved exceptions.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date not recorded | **Last Amended**: 2026-01-10
