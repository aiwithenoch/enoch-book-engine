# Enoch Book Engine provenance

Enoch Book Engine is an independently maintained derivative of
[paper-engine](https://github.com/hassancs91/paper-engine) by Hasan Aboul Hasan.

The original `LICENSE` file, including its MIT copyright notice for Hasan Aboul Hasan,
is retained unchanged. This repository does not claim the upstream work as original.

The Enoch-specific work in this repository includes the Enoch branding, the reusable
`enoch-book-engine` authoring skill, the `verify-book.mjs` workflow, and the
`visual-check.mjs` screenshot/diagram QA gate. The gate requires an agent to open the
generated page screenshots, with extra attention to pages containing diagrams, before
the verification command can be acknowledged.
