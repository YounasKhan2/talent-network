# Phase 3G benchmark fixtures

This directory is intentionally metadata-first during 3G-A. Ground-truth expectations live in code and are independent from parser output.

The first golden case is `complex-five-page-synthetic-v1`, based on the synthetic five-page PDF used during Phase 3G architecture discovery. The source document bytes are not required in this repository for 3G-A contract validation; later benchmark stages may add privacy/legal-safe fixture assets where licensing and repository-size policy allow.

Required source truth for the golden case includes 4 work-experience records, 2 education records, 3 projects, 5 certifications, 4 languages, 3 professional links, 3 publications, 2 patents, 4 awards, 1 volunteering record, 3 professional memberships, an interests section, and 3 private-only references.

Benchmark truth must never be inferred from the parser result being evaluated.
