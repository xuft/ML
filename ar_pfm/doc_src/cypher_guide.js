// Content: AR-PFM method guide for the Asylum Research Cypher ES (AR/Igor software).
// Build: node cypher_guide.js <out.docx>   (requires the 'docx' npm package)
const { Paragraph, TextRun, PageBreak, ShadingType, TabStopType } = require('docx');
const g = require('./docgen');
const d = g.builder();
const { body, P, H1, H2, B, STEP, SPACER, EQ, CALLOUT, TABLE } = d;
const W = g.W;
const runs = g.runs;
const CONTENT_W = g.CONTENT_W;
const { RED, BLUE, ORANGE, G1, G2, G4, G5 } = g.C;
const REV = '0.2';
const DATE = '27 September 2026';

// ---- title block
body.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: 'Angle-Resolved Piezoresponse Force Microscopy (AR-PFM)', bold: true, size: 40, color: BLUE })] }));
body.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'In-plane polarisation vector mapping by sample rotation on the Asylum Research Cypher ES', size: 26, color: BLUE })] }));
body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Method guide and step-by-step procedure — Micro Nano Research Facility (MNRF), RMIT University', size: 22, color: '000000' })] }));

TABLE(['Field', 'Entry'], [
  ['Document', 'MNRF AFM method guide — AR-PFM on Cypher ES (assign facility document number)'],
  ['Revision / date', 'Rev 0.2 DRAFT — 27 September 2026'],
  ['Change history', 'Rev 0.1 (27 Sep 2026): first draft.\nRev 0.2 (27 Sep 2026): MNRF has no band-excitation hardware, so §2 and §12 now use DART only; the 300 / 750–850 kHz contact-resonance figures re-attributed to McGilly et al. (not the ASYELEC vendor page); angle sign now detected automatically by the analysis script (8.3.3, 9.2.4).'],
  ['Prepared by', 'Chenglong Xu, Senior Technical Officer, MNRF'],
  ['Review and approval', 'Required before release: [name, role] (technical review); MNRF Facility Manager (approval)'],
  ['Platform assumed', 'Asylum Research Cypher ES, AR software (Igor Pro based), 16.x. Not NanoScope; not Ergo.'],
  ['Companion files', 'ar_pfm_analysis.py (repository xuft/ML, folder ar_pfm) — registration, per-pixel fit, QC, calibration. Document source: ar_pfm/doc_src (regenerate with node cypher_guide.js).'],
  ['Evidence labels', '[published] literature or vendor value; [typical] typical range from practice; [estimate] engineering estimate to be tightened on our instrument; [derived] follows from the stated model; [verify] must be confirmed on our AR build and entered in Appendix A before release.'],
], W(1, 3.2));

H2('Contents');
['1  Purpose, scope and assumed sample class', '2  Read first: what the supplied paper does and does not provide',
  '3  Measurement principle and design choices', '4  Safety and prerequisites', '5  Probes, reference samples and hardware',
  '6  Session set-up and calibration', '7  Sample preparation and mounting', '8  Acquisition sequence',
  '9  Data analysis and acceptance criteria', '10  Artefact diagnosis (ranked causes and discriminating tests)',
  '11  Reporting', '12  Using the Liu et al. (2023) channel-learning workflow with AR-PFM data', '13  References',
  'Appendix A  Local parameter map (to complete at commissioning)', 'Appendix B  Acquisition log', 'Appendix C  Manifest and commands']
  .forEach((t) => body.push(new Paragraph({ spacing: { after: 20 }, indent: { left: 200 }, children: [new TextRun({ text: t, size: 20 })] })));

// ---- 1
body.push(new Paragraph({ children: [new PageBreak()] }));
H1('1  Purpose, scope and assumed sample class');
P('This guide gives the procedure for mapping the in-plane piezoresponse vector (direction and relative magnitude) of ferroelectric and piezoelectric surfaces on the MNRF Cypher ES. The sample is physically rotated relative to the cantilever through N orientations; lateral PFM (LPFM), and preferably vertical PFM (VPFM), is acquired at each; the images are co-registered onto the 0° frame and each pixel is fitted with a first-harmonic model in the rotation angle. The output is an in-plane angle map with a per-pixel uncertainty, a magnitude map, and a set of quality-control maps that separate genuine in-plane response from crosstalk.');
P('**Assumed sample class.** Stiff (Young’s modulus ≳ 50 GPa), insulating ferroelectric thin film, 20–300 nm, on a conducting bottom electrode (e.g., SrRuO_{3}), or a bulk single crystal with a back electrode; ambient or dry-gas atmosphere at room temperature. The recommendations change as follows:');
B('**Compliant samples** (P(VDF-TrFE), bio-piezoelectrics): lateral slip and indentation dominate the torsional signal. Use the lower end of the load range and expect the second-harmonic QC (§9.4) to fail first.');
B('**Leaky or semiconducting films:** electrochemical and electrostatic contributions grow; reduce V_{ac}, keep a dry purge, and run the DC-bias test in §10 before trusting any in-plane contrast.');
B('**Elevated temperature** (ES heater stages: 0–120 °C heater-cooler, up to 250 °C high-temperature heater [published, vendor]): thermal drift after each remount grows; double the settling time and re-verify the set point in nN.');
B('**Liquid environment:** not covered.');
P('Out of scope: switching spectroscopy (separate guide), absolute d_{ij} extraction (requires lateral InvOLS calibration; see Choi et al. 2011), and Bruker Icon/NanoScope workflows.');

// ---- 2
H1('2  Read first: what the supplied paper does and does not provide');
CALLOUT('Premise correction', [
  'Liu et al., npj Comput. Mater. 9, 34 (2023) does **not** describe angle-resolved PFM. It uses band-excitation PFM (BEPFM) imaging and band-excitation piezoresponse spectroscopy on a Cypher, with an ensemble deep-kernel-learning (DKL) loop and an epsilon-greedy policy to find which image channel (BE amplitude, phase, resonance frequency or topography) best predicts hysteresis-loop area. There is no sample rotation, no lateral PFM and no in-plane vector reconstruction in it [published].',
  'The AR-PFM method in this guide follows Park et al. (2010), Kim et al. (2018) and Chu & Yang (2018), within the vector-PFM framework of Kalinin et al. (2006).',
]);
P('Three things from the paper do transfer:');
B('**Probe.** The paper used a BudgetSensors ElectriMulti75-G and calls it “Pt/Ir coated”. The vendor specifies 5 nm Cr + 25 nm Pt on both sides [published, vendor]. Order by part number, not by the paper’s description.');
B('**Band excitation is not available at MNRF.** BE needs an external waveform-generation and digitisation chain with its own acquisition software (Jesse et al. 2007), which MNRF does not have. The paper\u2019s BEPFM images and BE spectroscopy therefore cannot be reproduced as published. On the Cypher ES the equivalent is DART-PFM (Rodriguez et al. 2007), which returns the same four channel types (amplitude, phase, contact-resonance frequency, height); drive-referenced amplitude and Q follow from the DART SHO inversion (Gannepalli et al. 2011). DART switching spectroscopy replaces BE spectroscopy (\u00a712).');
B('**Channel learning.** The DKL channel-ranking idea applies naturally to AR-PFM outputs; §12 sets out how, and why it should be run offline first.');
P('Two premises that commonly go wrong in AR-PFM:');
B('**Changing Scan Angle is not a sample rotation.** Scan Angle rotates the raster; the cantilever keeps its orientation relative to the sample, so the LPFM sensitivity axis is unchanged in the sample frame. Only a physical rotation of the sample changes which in-plane component is measured (the Cypher does not allow the cantilever to be rotated).');
B('**LPFM reports only the in-plane displacement perpendicular to the lever’s long axis.** The component along the lever axis bends (“buckles”) the lever and appears in the vertical channel, mixed with the out-of-plane response. The rotation series separates both, and the buckling term becomes a built-in consistency check (§3.1).');

// ---- 3
H1('3  Measurement principle and design choices');
H2('3.1  Signal model');
P('Work in the display frame of the 0° image (x right, y up, angles counter-clockwise positive). At pixel p the in-plane surface displacement has magnitude r and direction ψ. Rotating the sample by θ_{k} makes that direction ψ + θ_{k} in the lever frame. With the LPFM sensitivity axis at φ_{L}, the in-phase lock-in signal (X = A cos(φ − φ_{ref})) is');
EQ('L_{k} = g_{k} S_{L} r cos(ψ − φ_{L} + θ_{k}) + c_{L}', '(1)');
P('where S_{L} is the lateral sensitivity, g_{k} a per-remount gain (ideally 1) and c_{L} a rotation-invariant background. Expanding gives L_{k} = a cos θ_{k} + b sin θ_{k} + c, which is linear in (a, b, c) at each pixel. Then r ∝ √(a^{2} + b^{2}) and ψ = h · atan2(−b, a) + φ_{0}, where the handedness h = ±1 and offset φ_{0} are fixed once against a reference of known in-plane polarisation (§9.3) [derived].');
P('The in-phase vertical signal at the same orientation is');
EQ('V_{k} = S_{V} u_{z} + β S_{V} r cos(ψ − φ_{L} ± 90° + θ_{k}) + c_{V}', '(2)');
P('The out-of-plane term u_{z} is rotation invariant and lands in the constant. The buckling term is a first harmonic shifted by ±90° from the LPFM harmonic, because it senses the in-plane component along the lever rather than across it. So the fitted vertical angle minus the fitted lateral angle must cluster at ±90°. If it clusters at 0° or 180° instead, the vertical modulation is lateral-to-vertical optical crosstalk, not buckling [derived]. This single test separates a physical in-plane response from a detector artefact, and it costs nothing if VPFM is recorded at every orientation.');
H2('3.2  What ends up in the background c');
P('Anything fixed in the lever frame that does not depend on the in-plane vector: vertical-to-lateral optical crosstalk (α u_{z}), electrostatic lateral forces from lever and tip geometry, torsional offsets from tip asymmetry and drive feedthrough. The fit removes these, but the c_{L} map is a diagnostic and should be featureless. If it reproduces the VPFM domain pattern, crosstalk is significant. If it reproduces topography, suspect topographic or electrostatic coupling (§10).');
H2('3.3  How many orientations');
TABLE(['Orientation set', 'Resolvable per pixel', 'Residual dof', 'Use'], [
  ['4 (0/90/180/270°)', 'a, b, c', '1', 'Fast vector map. Antipodal pairs cancel c exactly. No meaningful QC.'],
  ['**8 (45° steps) + 0° closure**', 'a, b, c; per-orientation gains; 2nd-harmonic test', '5 (3 with 2nd harmonic)', '**Recommended default.**'],
  ['12 (30° steps) + 0° closure', 'as above', '9', 'Publication grade; same 30° sampling as Park et al. (2010) and Kim et al. (2018).'],
], W(1.3, 1.9, 0.9, 2.4));
P('Angular precision is not the step size. Reading phase contrast at discrete orientations, as in the original AR-PFM analysis, bins angles to ±15° at 30° steps. The harmonic fit returns a continuous angle with σ_{ψ} ≈ (σ/r)·√(2/N) rad for N equally spaced orientations and per-image noise σ [derived]. For example, r/σ = 10 with N = 8 gives ≈ 2.9° [calculation].');
H2('3.4  Scan geometry');
P('Keep **Scan Angle**, **Scan Size** and **Points & Lines** identical at every orientation. The region of interest (ROI) rotates within the image and is re-registered numerically. The scan must contain the ROI at every orientation: Scan Size ≥ √2 × ROI + 2 × relocation uncertainty. With the 30 µm Cypher ES scanner [published, vendor] and ±2 µm relocation [estimate], the largest usable ROI is ≈ (30 − 4)/√2 ≈ 18 µm [calculation]. In practice, use 2–8 µm ROIs with 5–15 µm scans.');
H2('3.5  Detection route');
TABLE(['', 'Route A — off-resonance single frequency (default)', 'Route B — lateral contact resonance (DART)'], [
  ['Drive frequency', '20–80 kHz in a flat, peak-free window [typical]; ≥ 10× below lateral CR, ≥ 3× below vertical CR', 'On the lateral (torsional) contact resonance: 600–900 kHz for ≈ 3 N/m levers [typical]; resonance-enhanced PFM at ≈ 300 kHz (vertical) and 750–850 kHz (lateral) with < 1 V drive is reported by McGilly et al. (arXiv:1912.06629) [published]'],
  ['Signal', 'Quasi-static; low', 'Enhanced by the contact Q (≈ 20–100 [typical])'],
  ['Stability across remounts', 'Amplitude and phase nearly independent of contact stiffness, so g_{k} ≈ 1 and the phase reference is stable', 'CR frequency and Q shift with every re-engage and with orientation; raw DART amplitude is not comparable between orientations'],
  ['Required processing', 'None beyond the X-projection', 'SHO inversion to drive-referenced amplitude and phase (Gannepalli et al. 2011) before fitting. [verify] whether our AR build exports these per pixel.'],
  ['Choose when', 'Contrast-to-noise ≥ 5 at the planned scan settings (§6.6)', 'Route A contrast-to-noise < 5'],
], W(1.2, 2.5, 2.5));

// ---- 4
H1('4  Safety and prerequisites');
P('This procedure operates under the existing Cypher ES instrument risk assessment and MNRF induction and introduces no new plant. It adds repeated sample handling, an optional dry-gas purge, optional FIB-milled fiducials and possibly lead-containing samples. Controls below are listed in hierarchy order. PPE is never the primary control.');
TABLE(['Hazard', 'Controls (hierarchy order)', 'Residual risk', 'Governing document'], [
  ['Lead-containing films (PZT, PbTiO_{3}): fragments and dust when cleaving or scribing',
    'Substitution: use PPLN/LiNbO_{3} or BiFeO_{3} for training and parameter set-up.\nEngineering: cleave or scribe only in the fume cupboard, over a containment tray.\nAdministrative: SDS reviewed and ChemAlert entry before purchase or receipt; samples labelled; wet-wipe the stage area after handling.\nPPE: nitrile gloves.',
    'Low', 'RMIT HSW-PR32 Hazardous Substances; HSW-PR32-WI01 Storage, Use & Disposal; pre-purchase form HSW-PR32-TM01'],
  ['Solvents (acetone, IPA) and solvent-based silver paint',
    'Substitution: water-based conductive paint where the sample tolerates it.\nEngineering: fume cupboard for application and curing.\nAdministrative: minimum quantities at the bench.\nPPE: gloves, safety glasses.',
    'Low', 'HSW-PR32; HSW-PR32-WI01'],
  ['Compressed N_{2}/Ar for the ES purge: cylinder handling; asphyxiation in a small room',
    'Engineering: cylinder restrained; regulator with flow restriction at the lowest flow that holds RH; room ventilation and O_{2} monitoring as required by the room risk assessment.\nAdministrative: gas on only during the series; cylinder moves by trained staff.\nPPE: safety footwear for cylinder moves.',
    'Low where the room risk assessment covers this gas and flow; otherwise **Medium**', 'HSW-PR32; HSW-PR09 Risk Management; room risk assessment'],
  ['High-voltage tip bias (only if the ±150 V HV module [published, vendor] is used to write reference domains)',
    'Engineering: HV used only in the manufacturer’s enclosed configuration, with no exposed tip-bias conductors.\nAdministrative: HV enabled only by users signed off for it; default V_{dc} = 0 for AR-PFM imaging.',
    'Low in the enclosed configuration; **Medium** if any conductor is exposed', 'HSW-PR09; Cypher ES instrument risk assessment'],
  ['FIB fiducial milling (ORION NanoFab)', 'Performed by authorised ORION users under the ORION SOP and risk assessment; no additional controls here.', 'As per ORION risk assessment', 'ORION NanoFab SOP/RA'],
], W(1.5, 3.1, 1.0, 1.4));
CALLOUT('Escalation triggers', [
  'Residual risk ≥ Medium requires **Senior Leader sign-off before work starts** (RMIT HSW-PR09 Risk Management). In this procedure the triggers are: purge gas or flow not covered by the room risk assessment; HV module used outside the enclosed configuration; handling Pb-containing powders rather than intact films.',
  'Procedure numbers were taken from the RMIT HSW pages on 27 September 2026 [published]; confirm current titles and revisions on the RMIT Policy Register before release.',
]);
P('**Prerequisites.** Cypher ES authorised user; signed off on VPFM on PPLN; ORION authorisation, or a service request, if fiducials are milled; and the local parameter map (Appendix A) completed once for our AR build.');

// ---- 5
H1('5  Probes, reference samples and hardware');
H2('5.1  Probes');
TABLE(['Part number (maker)', 'Coating / tip', 'k (N/m)', 'f_{0} (kHz)', 'Tip radius', 'Role here', 'Price'], [
  ['**AD-2.8-AS** (Adama; sold via Bruker and Oxford Instruments)', 'Boron-doped conductive diamond', '2.8', '65', '10 nm', '**Production rotation series.** Wear resistance over 9–13 re-engages is the dominant systematic.', 'Not publicly listed; obtain quote (5 per pack) [published, vendor]'],
  ['**ASYELEC.01-R2** (Oxford Instruments Asylum)', 'Ti/Ir', 'lot datasheet [verify]', 'lot datasheet', 'lot datasheet', 'Alternative coated probe with Asylum support.', 'Not publicly listed; obtain quote (10 per pack)'],
  ['**ElectriMulti75-G** (BudgetSensors; also Multi75E-G)', 'Cr 5 nm / Pt 25 nm', '3 (1–7)', '75 (60–90)', '< 25 nm', 'Set-up, frequency and drive sweeps, training.', 'USD 240 per 10 [published, vendor list]; ≈ AUD 360–380 per 10 at 0.63–0.67 USD/AUD, before freight and GST [estimate]'],
], W(1.45, 0.9, 0.7, 0.65, 0.6, 1.6, 1.3));
P('All three are rectangular levers, which torsional detection requires; V-shaped levers have poor, geometry-mixed torsional sensitivity. About 3 N/m balances contact stability against torsional sensitivity. Metal-coated tips lose coating over 9–13 contact images at 100–300 nN [estimate], which reads as a monotonic gain drift in §9.4; this is why diamond is recommended for the production series.');
CALLOUT('Rule: one probe per series', ['Use a single probe for the entire rotation series, including the closure image. A probe change invalidates the gains and the phase reference, and the series must be restarted.']);
H2('5.2  Reference samples');
TABLE(['Sample', 'Purpose', 'Expected result'], [
  ['z-cut PPLN (periodically poled LiNbO_{3}, e.g., an Asylum PFM test sample)', 'VPFM sanity check; LPFM null test; crosstalk α', 'VPFM: 180° phase contrast, uniform amplitude except minima at walls. LPFM: ≈ 0 inside domains apart from α × VPFM; wall-localised LPFM contrast is expected [typical].'],
  ['**y-cut LiNbO_{3}, single domain, +z direction marked by the vendor**', '**In-plane direction reference: sets φ_{0}** (and h, if two non-collinear directions are available)', 'By symmetry, the mirror plane contains the surface normal (y) and z, so the in-plane response is strictly along ±z. It is driven by d_{24} = d_{15} (≈ 69 pm/V, commonly tabulated, e.g., Weis & Gaylord 1985 [published]). L(θ) is a single cosine, maximal when z is perpendicular to the lever [derived].'],
  ['x-cut LiNbO_{3}', '**Do not use as a direction reference**', 'No mirror contains the x normal. The field couples through d_{15} (xz shear, along z) and d_{16} = −2d_{22} (xy shear, along y), so the in-plane response is tilted off the polar axis [derived from the 3m tensor].'],
  ['In-sample reference: a/c stripes in PbTiO_{3}, 71° stripes in BiFeO_{3} on miscut substrates', 'Axis check inside the ROI', 'The stripe direction fixes the in-plane axis modulo 180°; the sign still needs the y-cut reference.'],
], W(1.6, 1.6, 3.0));
P('Crystal-axis naming differs between vendors. Confirm that the vendor uses the convention with x perpendicular to a mirror plane (d_{11} = 0, d_{22} ≠ 0) before accepting a crystal as “y-cut”.');
P('**Recommended arrangement:** co-mount a ≈ 2 × 2 mm y-cut LiNbO_{3} chip on the same disc as the sample, back-contacted with silver paint. It then rotates with the sample, sees the same probe, phase offset and remount, and gives an independent gain and direction check at every orientation. This requires both to sit within the sample-positioning travel of our ES configuration [verify]. Otherwise, run a separate 4-orientation reference series at the start of the session.');
H2('5.3  Mounting and rotation hardware');
B('Cypher sample discs; maximum sample size 15 mm diameter, 7 mm thick [published, vendor/facility listing; confirm for our ES stage].');
B('Angular index: a printed or laser-engraved polar protractor with 1° graduations, used under a stereo microscope, and a scribed index line on the disc. Manual rotation is good to ±1–2° [estimate]. The analysis measures the actual angle from registration, so mechanical accuracy only has to keep the ROI in the scan window and within the registration search range (default ±4°).');
B('Rigid mounting: thin cyanoacrylate or conductive epoxy. Avoid double-sided tape; creep between remounts shows up as drift and registration error.');
B('Electrical path: silver paint from the exposed bottom electrode to the disc; measure resistance after every remount.');
B('Dry N_{2} purge through the ES gas ports, held constant across the series. Relative humidity changes the water meniscus, the lateral contact mechanics and electrostatic screening. Target RH < 10% [estimate]; record RH if the ES sensor allows.');
H2('5.4  Fiducials (ranked)');
STEP('1', '**FIB-milled marker set (ORION NanoFab), Ne^{+} preferred over Ga^{+}** (no Ga implantation; Ne still causes subsurface damage). Suggested pattern: four L-shaped marks with 2 × 0.5 µm arms, 50–100 nm deep, at the corners of a 30 µm square centred on the ROI, with one corner doubled to break the four-fold symmetry. Add a coarse ≥ 50 µm arrow ≥ 100 µm away for the optical view. **Never image the ROI with the ion beam**, and navigate by stage coordinates from optical images. Acquire a 0° VPFM/LPFM baseline of the ROI before milling and compare it afterwards, because ion-induced charging can pole domains.');
STEP('2', '**Tip-written box domains** (±V_{dc} squares ≥ 10 µm from the ROI) on switchable films. They are non-destructive and visible in VPFM at every orientation, but need a coarse optical mark as well.');
STEP('3', '**Scribe mark ≥ 200 µm away**: coarse location only.');
STEP('4', '**Existing features** (particulates, electrode edges): free, but unreliable over a two-day series.');
P('The asymmetric pattern also answers a question the analysis needs: whether the AR image display is mirrored relative to the physical top view (step 8.3.3).');

// ---- 6
H1('6  Session set-up and calibration');
CALLOUT('Platform note — AR (Igor Pro) software on the Cypher ES', [
  'The newest AR release visible on the public Asylum download index is 16.05.193 [published; not confirmed as current at 27 September 2026]. Oxford Instruments also ships the Ergo software for Cypher; it is not covered here. Record the installed AR version in Appendix B.',
  'Parameter names in bold are the AR Master Panel labels. Items marked [verify] vary between builds (ARC2 versus Cypher controller, AR 14–16) and must be confirmed on our instrument and entered in Appendix A before this guide is released as an SOP.',
], ORANGE);
STEP('6.1', 'Cypher ES powered and thermally stable for ≥ 1 h [typical]; ES enclosure closed; purge gas on at the flow that will be used for the whole series.');
STEP('6.2', 'Load the probe. Place the laser spot near the free end **on the lever centreline**: the torsion signal depends on spot position across the lever width, and the centreline minimises flexural–torsional mixing. Maximise SUM, then zero Deflection and Lateral with the Cypher’s motorised photodetector positioning [verify panel name]. Record SUM, Deflection and Lateral, and save a snapshot of the laser-spot view. You will need these if the spot has to be restored after a sample exchange.');
STEP('6.3', 'Thermal tab: capture a thermal spectrum of the free lever and fit the first flexural mode for spring constant k, or use GetReal. Record k, f_{0} and Q.');
STEP('6.4', 'InvOLS: force curve on a hard reference (sapphire or the PPLN); take the Deflection InvOLS from the contact slope. Record it. Do not recalibrate mid-series unless the laser spot has been moved (§8.3, step 8.3.6).');
STEP('6.5', '**Contact frequency sweep** on PPLN (Tune tab, drive on the tip, 1 V, 10 kHz–1.2 MHz), first with the lock-in on vertical deflection and then on lateral (§6.7). Identify vertical CR1 (≈ 250–400 kHz for ≈ 3 N/m levers on oxides [typical]) and the lateral CR (≈ 600–900 kHz [typical]). Mark spurious peaks from the holder or sample mount. These are the ones that change after every remount, so keep f_{drive} away from them.');
STEP('6.6', '**Route decision** (§3.5). At the planned V_{ac}, time constant and scan rate, image a patch of the actual sample at 0° and compute contrast-to-noise: the difference in mean X between two domains of opposite in-plane component, divided by twice the RMS of X within one domain. ≥ 5 means Route A. Otherwise use Route B, or lengthen the time constant and slow the scan.');
STEP('6.7', '**Route the lateral signal to the lock-in** [verify]. The lock-in input must be switched from vertical deflection to the lateral (left–right) photodetector signal. In AR this is done in the Crosspoint panel, or through a lateral/vector PFM template in Mode Master on some builds; selector and option names differ between builds. Confirm with Oxford Instruments applications support and record the result in Appendix A. If the build supports two lock-ins with different inputs at the same frequency, acquire VPFM and LPFM simultaneously; otherwise acquire them sequentially at each orientation. **Routing test:** on z-cut PPLN, LPFM should show wall-localised contrast only. Full domain contrast means the input is still vertical, or crosstalk is severe (6.9).');
STEP('6.8', '**Background (feedthrough) check.** With the drive on, withdraw the tip and read the lock-in amplitude at f_{drive}. This is electrical feedthrough plus long-range electrostatics. It should be ≤ 10% of the LPFM contrast expected on the sample [estimate]; if not, move f_{drive}.');
STEP('6.9', '**Crosstalk α on z-cut PPLN.** α = (LPFM X contrast between domains) / (VPFM X contrast between domains), both in photodetector volts. |α| < 0.05 is acceptable [estimate]. Above ≈ 0.1, re-centre the spot across the lever width and re-zero before proceeding. Record α.');
STEP('6.10', '**Drive amplitude.** Step **Drive Amplitude** (0.25, 0.5, 1, 2, 3 V) on a test area outside the ROI and plot X contrast against drive. Choose V_{ac} in the linear region and at ≤ ⅓ of the local switching onset, taken from SS-PFM or from new domains appearing in a before/after VPFM image [estimate]. Thin films of 50–100 nm (coercive voltages typically 1–5 V [typical]): 0.5–1.5 V for Route A, 0.1–0.5 V for Route B. Bulk crystals: 2–5 V. Keep the DC tip bias at 0 V and the sample electrode grounded. [verify] whether AR’s Drive Amplitude is zero-to-peak or RMS in PFM mode; check with an oscilloscope if the configuration exposes a tip-bias monitor.');
STEP('6.11', '**Load.** F = k × InvOLS × ΔV_{defl}. Target 100–300 nN for ≈ 3 N/m levers on oxide films [typical]. Example: k = 2.8 N/m, InvOLS = 60 nm/V, ΔV = 1.0 V gives 168 nN [calculation]. Use the same **Set Point** ΔV, relative to the zeroed free-lever deflection, at every orientation. Too low gives lateral slip, noisy LPFM and a larger electrostatic share; too high gives wear and flexoelectric or stress contributions.');
STEP('6.12', '**Lock-in phase reference.** After fixing f_{drive}, set the phase once on the reference sample so that the response lies in X, and record the phase offset. **Do not press Center Phase (Tune tab) again for the rest of the series.** The analysis script refuses to fit through a 180° flip (negative gain) but cannot repair one.');
STEP('6.13', '**Scan-direction choice.** Friction-induced static torsion reverses between trace and retrace and contaminates LPFM; Kim et al. (2023) report LPFM trace/retrace discrepancies that scale with scan angle and with the lever’s lateral tilt [published]. On the sample (not PPLN), acquire LPFM at the two **Scan Angle** values that put the fast axis parallel and perpendicular to the lever, and compare trace against retrace X. Keep the orientation with the smaller discrepancy. The parallel orientation minimises static torsion and is expected to win [derived]; confirm which Scan Angle value that is on our system [verify]. Keep it for the whole series, and always save both trace and retrace.');
H2('6.14  Scan settings');
TABLE(['Parameter (AR label)', 'Recommended', 'Rationale'], [
  ['**Scan Size**', '√2 × ROI + 4 µm (e.g., 10 µm for a 4 µm ROI) [calculation]', 'ROI contained at every orientation (§3.4)'],
  ['**Points & Lines**', '256 (survey), 512 (final)', 'Pixel ≤ ⅓ of the narrowest domain'],
  ['**Scan Rate**', '0.3–0.8 Hz at 512 points', 'Pixel dwell ≥ 3–5 lock-in time constants'],
  ['**Scan Angle**', 'Fixed for the series (6.13)', 'Sensitivity axis fixed to the lever'],
  ['**Integral Gain**', 'As for contact imaging, just below oscillation', 'Stable load over domain-wall topography'],
  ['**Set Point**', '6.11', 'Constant load in nN'],
  ['**Drive Amplitude**', '6.10', 'Linear, non-switching'],
  ['**Drive Frequency**', 'Route A: 20–80 kHz; Route B: lateral CR', '§3.5, 6.5'],
  ['Lock-in time constant / bandwidth [verify label]', '0.3–0.5 ms at 0.5 Hz, 512 points, 40–80 kHz', 'Dwell per direction = 1/(2 × 512 × 0.5 Hz) = 1.95 ms; ≥ 20 drive cycles per time constant [calculation]'],
  ['Saved channels', 'Height, Deflection, Amplitude, Phase, Lateral — trace and retrace. DART: add the second amplitude/phase pair and Frequency [verify names with the channels command].', 'Height drives registration; trace/retrace drives QC'],
], W(1.6, 2.2, 2.4));

// ---- 7
H1('7  Sample preparation and mounting');
STEP('7.1', 'Clean with dry N_{2}. Use solvent only if the film tolerates it (§4).');
STEP('7.2', 'Expose the bottom electrode (corner scratch or pre-patterned contact) and connect it to the disc with silver paint. Cure per the paint datasheet in the fume cupboard; solvent-based paints need ≥ 30 min [typical], and residual solvent changes the mounting stiffness.');
STEP('7.3', 'Mount rigidly with the ROI within ≈ 1 mm of the disc centre [estimate], so that rotations do not carry it beyond the stage and optics field. Align a crystallographic edge with the disc index line, and photograph it on the protractor under the stereo microscope. This photograph defines ψ = 0 of the sample frame relative to the crystal axes.');
STEP('7.4', 'If co-mounting the y-cut LiNbO_{3} reference (§5.2), photograph its +z mark against the same index line.');
STEP('7.5', 'Measure the resistance from the electrode to the disc and record it.');
STEP('7.6', 'Acquire a 0° baseline of the ROI if fiducials are to be milled; then mill or write the fiducials (§5.4) and repeat the baseline.');
STEP('7.7', 'Label the disc with the sample ID and index mark.');

// ---- 8
H1('8  Acquisition sequence');
H2('8.1  Before the first orientation');
STEP('8.1.1', 'Complete §6 with the production probe and record k, InvOLS, f_{drive}, V_{ac}, Set Point, phase offset, Scan Angle, α and the AR version in Appendix B.');
STEP('8.1.2', 'Approach and engage at the ROI. Wait until Z drift is < 2 nm/min [estimate].');
H2('8.2  Orientation 0°');
STEP('8.2.1', 'Survey scan (Scan Size 20–25 µm, 256 points) to find the fiducials. Set **X Offset**/**Y Offset** to centre the ROI.');
STEP('8.2.2', 'Acquire VPFM and LPFM at the final settings, trace and retrace. File-naming convention: SAMPLE_ARPFM_A000_L_0000.ibw and SAMPLE_ARPFM_A000_V_0000.ibw (the angle is always three digits).');
STEP('8.2.3', 'If co-mounted, move to the y-cut reference and acquire LPFM and VPFM with the same settings, then return to the ROI.');
STEP('8.2.4', 'Run the quick checks (§8.5) and complete the log line.');
H2('8.3  Rotation step (repeat for each θ_{k})');
STEP('8.3.1', 'Withdraw and retract to the sample-exchange position, following the Cypher ES sample-exchange procedure. Keep the purge running.');
STEP('8.3.2', 'Remove the disc. Under the stereo microscope, reseat it on the stage rotated by Δθ (e.g., 45°) relative to the stage reference mark, and check the index against the protractor template. [verify] that the ES stage lets the disc be reseated at any angle. If it keys the disc orientation, rotation means re-gluing onto a fresh disc, which adds cure time and drift.');
STEP('8.3.3', '**Angle sign.** Always log the physical rotation, counter-clockwise viewed from above as positive. The analysis script tests both signs at the first rotated orientation and reports the result as angle_sign in ar_pfm_qc.json (\u00a79.2.4). angle_sign = \u22121 means the image array is mirrored relative to the top view; report \u03c8 in the physical frame with --handedness \u22121, or fix h with two reference directions (\u00a79.3). Cross-check once against the asymmetric fiducial pattern after step 8.3.9 and record the result in Appendix A; it is fixed for the instrument.');
STEP('8.3.4', 'Re-check electrical continuity from the electrode to ground.');
STEP('8.3.5', 'Reinstall the disc, close the ES, restore the purge, and allow ≥ 20–30 min thermal settling [estimate], monitoring deflection and Z drift.');
STEP('8.3.6', 'If the cantilever holder was not removed, **do not realign the laser**; re-zero Deflection and Lateral only, and check that SUM is within ±5% of the logged value [estimate]. If our ES sample exchange requires removing the holder [verify], restore the spot to the recorded position using the snapshot, re-measure InvOLS on a hard area, and rely on --fit-gains and the co-mounted reference to absorb the sensitivity change.');
STEP('8.3.7', 'Approach and engage with the same **Set Point** ΔV relative to the new free-lever deflection.');
STEP('8.3.8', 'Frequency check. Route A: a single-frequency read at f_{drive} should show a phase within ±5° of the logged value; **do not re-centre the phase**. Route B: re-acquire the lateral CR with DART and log the new frequency.');
STEP('8.3.9', 'Survey scan. Find the fiducials, which are now rotated by θ_{k} in the image, and set X/Y Offset so that the ROI centre is at the scan centre. **Do not change Scan Angle.**');
STEP('8.3.10', 'Acquire VPFM and LPFM with identical parameters, named with the angle (A045, A090, …).');
STEP('8.3.11', 'Reference-chip scans if co-mounted; quick checks (§8.5); log line.');
H2('8.4  Closure');
STEP('8.4.1', 'After the last orientation, return to 0° and repeat the acquisition (file tag A360; manifest role “closure”). The closure image measures tip wear and sensitivity drift over the series.');
H2('8.5  Quick checks at the instrument (every orientation)');
TABLE(['Check', 'Pass', 'If it fails'], [
  ['VPFM domain pattern against 0° (allowing for rotation)', 'Same configuration; no new or lost domains', 'Tip-induced switching or relaxation. Reduce V_{ac} or load. Changed areas are invalid for the series.'],
  ['LPFM trace against retrace', 'Same contrast', 'Friction torsion; revisit 6.13'],
  ['Phase at f_{drive}', 'Within ±5° of the logged value', 'Check routing and frequency. Do not re-centre.'],
  ['SUM', 'Within ±5% of the logged value', 'Laser spot moved; 8.3.6'],
  ['Fiducials and ROI inside the frame with margin', 'Yes', 'Adjust offsets and re-scan'],
], W(2, 1.8, 2.4));
H2('8.6  Time budget');
TABLE(['Activity (per orientation)', 'Time'], [
  ['Remount and continuity check', '≈ 10 min'],
  ['Thermal settling', '20–30 min'],
  ['Engage, frequency check, survey, re-centre', '15–20 min'],
  ['VPFM + LPFM, sequential, 512 lines at 0.5 Hz (17 min each)', '≈ 35 min'],
  ['Reference chip (optional)', '≈ 15 min'],
  ['**Total**', '**≈ 1.5–1.8 h per orientation; 8 orientations + closure ≈ 14–16 h** [estimate]'],
], W(3.6, 2.6));
P('Plan the series over two consecutive days with the same probe. Overnight, leave the tip withdrawn and the sample in the dry purge.');

// ---- 9
H1('9  Data analysis and acceptance criteria');
H2('9.1  Files and installation');
P('The script reads Asylum .ibw files directly (via the igor2 package) or .npz exports. Install with: pip install numpy scipy pandas matplotlib igor2. Then run the self-test: python ar_pfm_analysis.py selftest. It must print “SELFTEST PASSED”.');
P('On synthetic data (8 orientations, ±1.5° rotation errors, ±5 px shifts, ±10% gains, α = 0.05, β = 0.25, 3% noise), the self-test recovers ψ with 0.4° median error, rotation to ≤ 0.04° and gains to ≤ 1% [measured, this implementation]. This validates the mathematics and the registration only. The .ibw reader has not yet been run on a Cypher file. Check it on the first real file with the channels command, which lists the channel labels and scan-geometry note keys, before trusting any output.');
H2('9.2  Processing steps');
STEP('9.2.1', '**Manifest.** Write a CSV with columns angle_deg, lpfm_file, vpfm_file, role (Appendix C). Angles are the physical rotations, counter-clockwise viewed from above positive (8.3.3). The first row must be 0°, and the repeat of 0° is marked “closure”.');
STEP('9.2.2', '**Consistency.** The script aborts if Scan Size, points, lines or Scan Angle differ between files, or if any frame is incomplete; it warns on drive or set-point mismatches.');
STEP('9.2.3', '**Projection.** X = A cos(φ − φ_{ref}), using one phase reference per detection channel for the whole series (--lat-phase-ref, --vert-phase-ref). If none is given, it is estimated from the data (modulo 180°) with a warning. That is acceptable for exploration but not for absolute ψ.');
STEP('9.2.4', '**Registration.** Each file’s Height channel is registered to the 0° Height: a rotation search about −θ_{nominal} (±--max-angle-dev), phase correlation for translation, then joint sub-pixel refinement on normalised cross-correlation. The measured angle, not the nominal one, enters the fit. With --angle-sign auto (default), both signs are tried at the first rotated orientation and the better one is kept and reported. For featureless topography, pass the VPFM amplitude channel as --height.');
STEP('9.2.5', '**Fit.** Per-pixel least squares of equation (1). --fit-gains adds a per-orientation gain by alternating least squares, normalised to a geometric mean of 1. A negative gain aborts the run, because it means the phase reference flipped. With ≥ 6 orientations the second-harmonic ratio is also computed.');
STEP('9.2.6', '**Vertical consistency** (equation 2): the mode of (ψ_{V,raw} − ψ_{L,raw}) is reported and labelled buckling-consistent or crosstalk-like.');
H2('9.3  Calibration of ψ');
STEP('9.3.1', 'Run the series (co-mounted or separate) on the y-cut LiNbO_{3} reference with the same probe, f_{drive} and phase reference.');
STEP('9.3.2', 'Choose a single-domain ROI (row0 row1 col0 col1 in the maps array) and run: python ar_pfm_analysis.py calibrate results/ar_pfm_maps.npz --roi r0 r1 c0 c1 --psi <known +z angle> --handedness <±1 from 8.3.3>. With two non-collinear known directions (e.g., two ferroelastic variants), give two --roi/--psi pairs and h is determined as well.');
STEP('9.3.3', 'Re-run with --handedness and --angle-offset set to the returned values. Store them with the probe and frequency in Appendix A; they stay valid for that probe, f_{drive} and phase reference.');
H2('9.4  Outputs and acceptance criteria');
P('Outputs: ar_pfm_maps.npz (magnitude, ψ, σ_{ψ}, c_{L}, R^{2}, second-harmonic ratio, vertical maps, mask, measured angles, gains), ar_pfm_per_angle.csv, ar_pfm_qc.json and ar_pfm_summary.png. The thresholds below are initial estimates, to be tightened after the first three series on the y-cut reference.');
TABLE(['Metric (file)', 'Accept', 'If not'], [
  ['ncc_lpfm per orientation (csv)', '≥ 0.8 [estimate]', 'Registration unreliable: fiducial visibility, drift; try --line-flatten or VPFM amplitude as the registration channel'],
  ['angle_measured_deg against nominal (csv)', 'Within the search window, not at its edge', 'Sign convention (8.3.3) or mis-entered angle'],
  ['median_r2_strong (json)', '≥ 0.8 [estimate]', 'Non-vector response or a sample/tip change; §10 B'],
  ['median_h2_ratio_strong (json)', '≤ 0.2 [estimate]', 'cos 2θ content; §10 C'],
  ['lat_gains (json)', '0.85–1.15 [estimate]', 'Sensitivity changed between remounts; §10 D'],
  ['closure slope and pearson_r (json)', '0.85–1.15 and ≥ 0.9 [estimate]', 'Tip wear or drift across the series'],
  ['delta_vl_mode_deg (json)', '±90° ± 25°', 'Optical crosstalk, not buckling; §10 A'],
  ['offset_c_corr_with_vpfm (json)', '|r| ≤ 0.3 [estimate]', 'Crosstalk α significant; magnitudes suspect'],
  ['lpfm_Y_over_X_rms (csv)', '≤ 0.3 [estimate]', 'Wrong phase reference, or Route B data without SHO inversion'],
  ['lpfm_trace_retrace_rel_diff (csv)', '≤ 0.2 [estimate]', 'Friction torsion; revisit 6.13'],
], W(2.1, 1.5, 2.6));

// ---- 10
H1('10  Artefact diagnosis (ranked causes and discriminating tests)');
const DIAG = (sym, rows) => { H2(sym); TABLE(['Rank', 'Cause', 'Discriminating test', 'Remedy'], rows, W(0.45, 1.7, 2.3, 1.75)); };
DIAG('A  The ψ map follows the VPFM (out-of-plane) domain pattern', [
  ['1', 'Vertical-to-lateral optical crosstalk', 'c_{L} correlates with VPFM (offset_c_corr_with_vpfm); on z-cut PPLN, domain interiors show LPFM ∝ VPFM', 'Re-centre the spot across the lever width; re-zero; re-measure α'],
  ['2', 'Electrostatic lateral force from the bound-charge pattern', 'Repeat one orientation at V_{dc} = ±1 V: an electrostatic component changes linearly with V_{dc}. KPFM shows the same pattern.', 'Higher load, dry purge, V_{dc} at the contact potential'],
  ['3', 'Genuine coupling of in-plane and out-of-plane components (e.g., 71°/109° variants)', 'In those regions Δψ_{VL} clusters at ±90°, R^{2} is high and the second harmonic is small', 'None; this is the result'],
]);
DIAG('B  Low R^{2} everywhere, or a noisy ψ', [
  ['1', 'Insufficient contrast-to-noise (Route A, weak in-plane d)', 'σ_{ψ} map large; 0° contrast-to-noise < 5', 'Longer time constant or slower scan; higher V_{ac} within the linear range; Route B'],
  ['2', 'Phase reference changed between remounts', 'Script aborts on a negative gain, or lpfm_Y_over_X_rms jumps at one orientation', 'Re-acquire that orientation at the logged phase'],
  ['3', 'Sample changed during the series (switching, relaxation, charge injection)', 'Registered VPFM differs between orientations', 'Reduce V_{ac} or load; exclude the changed region'],
  ['4', 'Registration error', 'ncc < 0.8; residual maps show features that follow domain walls', 'Longer settling; better fiducials; --line-flatten'],
]);
DIAG('C  Large cos 2θ component (second-harmonic ratio > 0.2)', [
  ['1', 'Anisotropic tip contact or lateral slip that depends on orientation relative to friction', 'Also high on the y-cut reference; decreases as load increases', 'More load; new probe; fast axis parallel to the lever'],
  ['2', 'Scan-direction-dependent torsion', 'lpfm_trace_retrace_rel_diff high', '6.13'],
  ['3', 'Genuine: mixed variants within the tip footprint at ferroelastic walls', 'Confined to walls', 'None; mask walls in the statistics'],
]);
DIAG('D  Closure fails, or gains drift monotonically', [
  ['1', 'Tip wear (metal-coated tips)', 'Gains fall with acquisition order rather than with angle; VPFM amplitude falls too; tip shows wear in SEM or ORION afterwards', 'Diamond probe; lower load; fewer survey scans'],
  ['2', 'Laser spot moved at a remount', 'SUM or lateral-zero step at the orientation where the gain jumps', 'Do not remove the holder; restore the spot'],
  ['3', 'Humidity change', 'RH log; purge interrupted', 'Continuous purge; log RH'],
]);
DIAG('E  Registration fails (angle at the edge of the search window)', [
  ['1', 'Angle sign forced to the wrong value', '--angle-sign given as +1 or \u22121 and registration fails at every orientation', 'Re-run with --angle-sign auto; check angle_sign in qc.json'],
  ['2', 'Mechanical rotation error > 4°', 'Protractor photograph', '--max-angle-dev 8'],
  ['3', 'Featureless topography', 'Low ncc at every orientation', 'Register on VPFM amplitude (--height channel name)'],
]);

// ---- 11
H1('11  Reporting');
P('For methods sections, report: the probe part number and measured k; f_{drive} and the route; V_{ac} with its convention (zero-to-peak or RMS); load in nN; the number of orientations with nominal and measured angles; the registration method; the fit model (first harmonic, with or without gains); the reference sample and the calibration values h and φ_{0}; the acceptance metrics from §9.4; the AR software version; and the atmosphere (gas, RH).');

// ---- 12
H1('12  Using the Liu et al. (2023) channel-learning workflow with AR-PFM data');
P('**What the paper did** [published]: ensemble DKL with 20 × 20 pixel image patches, a three-layer fully connected network and 20 ensemble members. It seeded with 0.25% of points, then ran 20 warm-up steps and 200 exploration steps with ε annealed from 0.4 to 0.1; a second run used 480 steps with ε from 0.9 to 0.01. Each iteration took ≈ 30 s on one V100 GPU against ≈ 300 s on CPU, with data streamed from the instrument PC to a GPU server using the mlsocket package. The targets were the areas of the BE polarisation and frequency hysteresis loops. Code: github.com/yongtaoliu/Ensemble-DKL.');
P('**Mapping to our instrument (no BE hardware at MNRF).** BE amplitude, phase and resonance frequency map to DART drive-referenced amplitude, phase and contact-resonance frequency (SHO inversion, Gannepalli et al. 2011). BE spectroscopy maps to DART switching spectroscopy, which gives both targets the paper used: the piezoresponse loop and the CR-frequency loop [verify availability and export on our build]. DART tracks the resonance with two frequencies rather than fitting a full band, so it is less robust than BE where Q changes strongly across the loop; check that tracking holds (no frequency jumps) before trusting frequency-loop areas. AR-PFM adds candidate channels: |L|, ψ (encoded as cos ψ and sin ψ to avoid the wrap), c_{L}, the vertical constant c_{V} (true out-of-plane response), and topography.');
P('**Run it offline first.** Acquire the AR-PFM maps, then a coarse switching-spectroscopy grid (e.g., 20 × 20 points over the ROI at 0°), and run ensemble DKL retrospectively to rank channels by predictive uncertainty. This answers “which structural channel predicts switching” without any instrument control. Build the live loop only if the offline ranking is informative. The live loop needs programmatic tip positioning and spectroscopy triggering from Python through AR/Igor, plus a GPU; the paper’s timing implies ≈ 100 min of compute for 200 steps on one V100 [calculation].');
P('**Caveat.** The paper’s loop assumes that imaging channels are cheap and spectroscopy is expensive. With AR-PFM the reverse holds: the maps cost ≈ 15 h. The active-learning gain is therefore in choosing where to spend spectroscopy, not in choosing which channels to acquire.');

// ---- 13
H1('13  References');
[
  'Y. Liu, R. K. Vasudevan, K. P. Kelley, H. Funakubo, M. Ziatdinov, S. V. Kalinin, “Learning the right channel in multimodal imaging: automated experiment in piezoresponse force microscopy”, npj Comput. Mater. 9, 34 (2023). doi:10.1038/s41524-023-00985-x',
  'M. Park, S. Hong, et al., “Three-dimensional ferroelectric domain imaging of epitaxial BiFeO_{3} thin films using angle-resolved piezoresponse force microscopy”, Appl. Phys. Lett. 97, 112907 (2010).',
  'B. Kim, F. P. Barrows, Y. Sharma, R. S. Katiyar, C. Phatak, A. K. Petford-Long, S. Jeon, S. Hong, “Ferroelectric domain studies of patterned (001) BiFeO_{3} by angle-resolved piezoresponse force microscopy”, Sci. Rep. 8 (2018). doi:10.1038/s41598-017-18482-9',
  'K. Chu, C.-H. Yang, “High-resolution angle-resolved lateral piezoresponse force microscopy: visualization of in-plane piezoresponse vectors”, Rev. Sci. Instrum. 89, 123704 (2018).',
  'J. Kim, S. Cho, J. Yeom, S. Eom, S. Hong, “Revisiting contrast mechanism of lateral piezoresponse force microscopy”, J. Appl. Phys. 134, 214104 (2023). doi:10.1063/5.0177164',
  'S. V. Kalinin, B. J. Rodriguez, S. Jesse, J. Shin, A. P. Baddorf, P. Gupta, et al., “Vector piezoresponse force microscopy”, Microsc. Microanal. 12, 206–220 (2006). doi:10.1017/S1431927606060156',
  'H. Choi, S. Hong, K. No, “Quantitative measurement of in-plane cantilever torsion for calibrating lateral piezoresponse force microscopy”, Rev. Sci. Instrum. 82, 113706 (2011).',
  'B. J. Rodriguez, C. Callahan, S. V. Kalinin, R. Proksch, “Dual-frequency resonance-tracking atomic force microscopy”, Nanotechnology 18, 475504 (2007).',
  'A. Gannepalli, D. G. Yablon, A. H. Tsou, R. Proksch, “Mapping nanoscale elasticity and dissipation using dual frequency contact resonance AFM”, Nanotechnology 22, 355705 (2011). doi:10.1088/0957-4484/22/35/355705',
  'S. Jesse, S. V. Kalinin, R. Proksch, A. P. Baddorf, B. J. Rodriguez, “The band excitation method in scanning probe microscopy for rapid mapping of energy dissipation on the nanoscale”, Nanotechnology 18, 435503 (2007).',
  'R. S. Weis, T. K. Gaylord, “Lithium niobate: summary of physical properties and crystal structure”, Appl. Phys. A 37, 191–203 (1985). doi:10.1007/BF00614817',
  'L. J. McGilly, A. Kerelsky, et al., \u201cSeeing moir\u00e9 superlattices\u201d, arXiv:1912.06629 (2019).',
  'Vendor data: BudgetSensors ElectriMulti75-G (Multi75E-G) product page and USD brochure; Oxford Instruments e-store pages for ASYELEC.01-R2 and AD-2.8-AS; Oxford Instruments Cypher ES product pages. RMIT HSW-PR32 and HSW-PR09 (rmit.edu.au). All accessed 27 September 2026.',
].forEach((r, i) => body.push(new Paragraph({
  spacing: { after: 70, line: 256 }, indent: { left: 460, hanging: 460 },
  tabStops: [{ type: TabStopType.LEFT, position: 460 }],
  children: [new TextRun({ text: `${i + 1}.`, bold: true, color: BLUE, size: 19 }), new TextRun({ text: '\t', size: 19 }), ...runs(r, { size: 19 })],
})));

// ---- Appendices
body.push(new Paragraph({ children: [new PageBreak()] }));
H1('Appendix A  Local parameter map (to complete at commissioning)');
P('Complete once for the MNRF Cypher ES and AR build, with Oxford Instruments applications support where needed. Until every row is confirmed, this document remains a method guide, not an SOP.');
TABLE(['Function', 'Expected AR location / label', 'Confirmed on MNRF Cypher ES', 'Value / note'], [
  ['AR software version', 'Igor Help / AR About', '', ''],
  ['Lock-in input to lateral', 'Crosspoint panel or Mode Master template [verify]', '', ''],
  ['Simultaneous VPFM + LPFM (two lock-ins, two inputs)', '[verify]', '', ''],
  ['Drive Amplitude convention (zero-to-peak / RMS)', 'Main tab, Drive Amplitude [verify]', '', ''],
  ['Lock-in time constant / bandwidth label', '[verify]', '', ''],
  ['Phase offset field; Center Phase', 'Tune tab', '', ''],
  ['DART on the lateral input; SHO export', 'Mode Master, DART [verify]', '', ''],
  ['Scan Angle giving fast axis parallel to the lever', 'Main tab, Scan Angle (6.13)', '', ''],
  ['Motorised Deflection/Lateral zero', 'Cypher photodetector control [verify]', '', ''],
  ['Sample exchange requires holder removal?', 'ES sample-exchange procedure [verify]', '', ''],
  ['Disc can be reseated at any angle?', 'ES stage [verify]', '', ''],
  ['Sample-positioning travel (co-mounted reference)', '[verify]', '', ''],
  ['Image array mirrored relative to top view?', 'angle_sign in ar_pfm_qc.json; fiducial cross-check, 8.3.3', '', ''],
  ['Saved channel names (Trace/Retrace; DART)', 'ar_pfm_analysis.py channels <file>', '', ''],
  ['Calibration h, φ_{0} (per probe, f_{drive}, phase)', 'calibrate command (§9.3)', '', ''],
], W(2.1, 1.9, 1.2, 1.0));
H1('Appendix B  Acquisition log');
P('Session header: date, operator, AR version, probe part and lot, k, f_{0}, InvOLS, f_{drive}, route, V_{ac}, Set Point (V and nN), phase offset, Scan Angle, Scan Size, Points & Lines, Scan Rate, α, gas and flow.');
TABLE(['Nominal angle', 'Time', 'Files (L / V)', 'SUM (V)', 'Defl / Lat zero', 'Set Point ΔV', 'f_{drive} or CR (kHz)', 'Phase at f (°)', 'T / RH', 'Notes'],
  ['0', '45', '90', '135', '180', '225', '270', '315', '360 (closure)'].map((a) => [a, '', '', '', '', '', '', '', '', '']),
  W(0.8, 0.6, 1.3, 0.6, 0.8, 0.7, 0.8, 0.7, 0.6, 1.0));
H1('Appendix C  Manifest and commands');
P('manifest.csv (paths relative to the manifest):');
['angle_deg,lpfm_file,vpfm_file,role', '0,S1_ARPFM_A000_L_0000.ibw,S1_ARPFM_A000_V_0000.ibw,fit', '45,S1_ARPFM_A045_L_0000.ibw,S1_ARPFM_A045_V_0000.ibw,fit',
  '… (90 to 315 in 45° steps) …', '360,S1_ARPFM_A360_L_0000.ibw,S1_ARPFM_A360_V_0000.ibw,closure']
  .forEach((l) => body.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: G2, color: 'auto' }, spacing: { after: 0 }, indent: { left: 200 }, children: [new TextRun({ text: l, size: 19 })] })));
SPACER();
P('Commands (from the ar_pfm folder):');
['python ar_pfm_analysis.py selftest',
  'python ar_pfm_analysis.py channels S1_ARPFM_A000_L_0000.ibw',
  'python ar_pfm_analysis.py run manifest.csv --out results --lat-amp AmplitudeRetrace --lat-phase PhaseRetrace --vert-amp AmplitudeRetrace --vert-phase PhaseRetrace --lat-phase-ref <deg> --vert-phase-ref <deg> --fit-gains',
  'python ar_pfm_analysis.py calibrate results/ar_pfm_maps.npz --roi r0 r1 c0 c1 --psi <deg> --handedness <±1>',
  'python ar_pfm_analysis.py run manifest.csv --out results ... --handedness <h> --angle-offset <φ_0>']
  .forEach((l) => body.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: G2, color: 'auto' }, spacing: { after: 0 }, indent: { left: 200 }, children: [new TextRun({ text: l, size: 19 })] })));
SPACER();
P('When VPFM and LPFM are in separate files, the channel names can be the same (the vpfm_file column selects the file). When both are in one file (simultaneous acquisition), give the VPFM channel names explicitly.');


g.write(d, {
  headerTitle: 'Angle-Resolved PFM on the Cypher ES \u2014 Method Guide',
  docTitle: 'AR-PFM on the Cypher ES \u2014 Method Guide',
  rev: REV, date: DATE, preparedBy: 'C. Xu, MNRF',
  centreNote: 'DRAFT for review \u2014 uncontrolled when printed',
}, process.argv[2] || 'AR-PFM_CypherES_Method_Guide.docx');
