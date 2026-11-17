# Repository notes for Claude

## MNRF SOP / method-guide format (house format)

Chenglong Xu confirmed on 17 November 2026 that the two AR-PFM guides in `ar_pfm/` are the
reference format for MNRF SOPs and method guides. Use this format for every new MNRF SOP unless
he gives a different one.

Reference documents:

- `ar_pfm/AR-PFM_DimensionIcon_Method_Guide.docx`
- `ar_pfm/AR-PFM_CypherES_Method_Guide.docx`

Generator (reuse it, do not rebuild the styling by hand):

- `ar_pfm/doc_src/docgen.js` — shared helpers (docx-js, `docx` ^9.7.2).
- `ar_pfm/doc_src/icon_guide.js`, `cypher_guide.js` — content files, one per document.
- Build: `node <guide>.js <out.docx>` in `ar_pfm/doc_src` (`npm install` first).
- Output is a real `.docx`. Do not deliver an SOP as markdown or as a Docs artifact.

### Page and styling (as implemented in `docgen.js`)

| Element | Specification |
|---|---|
| Page | A4 portrait; left/right margins 2 cm (1134 DXA); top 1300, bottom 1100 DXA |
| Font | Calibri; body 10.5 pt; table text 9.5 pt |
| Heading 1 | 14 pt bold, #E60028, thin grey bottom rule (#AFAFAF) |
| Heading 2 | 11.5 pt bold, #000054, no rule |
| Title block | Title 20 pt bold #000054; subtitle 13 pt #000054; third line 11 pt (document type — facility) |
| Table header row | #000054 fill, white bold; repeats on each page |
| Table body | Grey borders #CDCDCD; alternate rows #F5F5F5; rows do not split across pages |
| Callout | #F5F5F5 fill, thick left bar (red #E60028 default, orange #FC9147 for platform notes), bold title |
| Code / commands | #EBEBEB fill block |
| Header | Document short title, red bold, left; RMIT logo right (`[RMIT logo]` placeholder unless a logo file is supplied); thick red bottom rule |
| Footer | `Prepared by: C. Xu, MNRF` · centre note (e.g. `DRAFT for review — uncontrolled when printed`) · `Rev x.y · DD Month YYYY · Page X of Y`; thin grey top rule |
| Palette | RMIT only: #E60028, #000054, #FC9147, greys F5F5F5/EBEBEB/E1E1E1/CDCDCD/AFAFAF. Never #5B9BD5 |

### Front matter (page 1)

1. Title block (three lines).
2. Document-control table, columns `Field | Entry`, with these rows: Document; Revision / date;
   Prepared by; Review and approval; Platform assumed; Related documents; Companion files;
   Evidence labels.
3. `Contents` list (Heading 2, then plain lines).
4. Page break before section 1.

### Section skeleton

| No. | Section | Content pattern |
|---|---|---|
| 1 | Purpose, scope and assumed sample class | Purpose paragraph; **Assumed sample class** paragraph; bullets "where the recommendation changes"; out-of-scope paragraph |
| 2 | Read first | Callout plus bold-lead bullets: limits, common misconceptions, what the source literature does not supply |
| 3 | Measurement principle | H2 subsections; numbered equations (centred, label right); option-comparison tables |
| 4 | Safety and prerequisites | Table `Hazard | Controls (hierarchy order) | Residual risk | Governing document`; callout **Escalation triggers** (residual risk ≥ Medium needs Senior Leader sign-off); **Prerequisites** paragraph |
| 5 | Probes, reference samples and hardware | Probe table with part numbers, k, f0, role, price; reference-sample table with expected result; ranked options as steps |
| 6 | Session set-up and calibration | Platform-note callout; numbered steps 6.1, 6.2 …; settings table `Parameter (software label) | Recommended | Rationale` |
| 7 | Sample preparation and mounting | Numbered steps |
| 8 | Acquisition sequence | H2 per phase; steps numbered 8.3.1 …; quick-check table `Check | Pass | If it fails`; time-budget table |
| 9 | Data analysis and acceptance criteria | Files and self-test; processing steps; calibration; table `Metric (file) | Accept | If not` |
| 10 | Artefact diagnosis | One H2 per symptom (A, B, C …); table `Rank | Cause | Discriminating test | Remedy`, most likely cause first |
| 11 | Reporting | The parameters that must be reported |
| 12 | Method-specific section (optional) | For example, how a cited paper's workflow applies at MNRF |
| 13 | References | Numbered list, 9.5 pt, hanging indent |
| App. A | Local parameter map | Table to complete at commissioning; rows marked `[verify]` in the text end here |
| App. B | Acquisition log | Blank log table |
| App. C | Manifest and commands | Code block |

Sections 3 and 12 depend on the method. Omit section 12 when there is no source paper to adapt
(interpretation by Claude, not stated by Chenglong).

### Conventions

- Steps: bold blue step number, hanging indent, one instruction per step. Software parameter names
  in **bold**, spelled exactly as in the software.
- State the platform in the document-control table and in a callout at the start of section 6
  (NanoScope names versus Asylum AR/Igor names).
- Every number carries an evidence tag in blue italics: `[published]`, `[typical]`, `[estimate]`,
  `[derived]`, `[calculation]`, `[measured]`.
- `[verify …]` (orange highlight, bold) marks every item that must be confirmed on the MNRF
  instrument. Each one has a row in Appendix A. A document with open `[verify]` items stays a
  "method guide"; it becomes an SOP only when Appendix A is complete.
- Controls in hierarchy order (Elimination, Substitution, Engineering, Administrative, PPE). PPE is
  never the primary control. Name the governing RMIT HSW procedure for each hazard.
- Language: about 80 % ASD-STE100. Short sentences, active voice, one term per concept.
  Australian spelling, DD Month YYYY, SI units (µ, not u).
- Revision: `Rev 0.x DRAFT` until review and approval are recorded in the document-control table.
