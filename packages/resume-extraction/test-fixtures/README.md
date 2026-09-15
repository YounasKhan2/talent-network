# Native extraction runtime fixtures

Phase 3D-B uses two small, repository-local binary fixtures that are generated on the developer machine for runtime verification:

- `synthetic-resume.pdf`
- `synthetic-resume.docx`

The files contain only fictional candidate data. They are intentionally not generated from a real candidate resume.

Use `scripts/generate-native-resume-fixtures.py` from the repository root, then run the `@talent-network/resume-extraction` tests. The generated files are deterministic enough for contractual extraction assertions; tests intentionally avoid byte-for-byte checks and parser-specific whitespace details.

The PDF fixture proves real PDF.js extraction and truthful page numbering. The DOCX fixture proves real Mammoth extraction and protects the rule that DOCX pagination is not fabricated (`pageNumber: null`).
