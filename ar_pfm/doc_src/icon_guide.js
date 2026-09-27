// Content: AR-PFM method guide for the Bruker Dimension Icon with NanoScope 6 controller.
// Build: node icon_guide.js <out.docx>   (requires the 'docx' npm package)
const g = require('./docgen');
const d = g.builder();
const { P, H1, H2, B, STEP, EQ, CALLOUT, TABLE, CODE, PAGEBREAK } = d;
const W = g.W;
const { ORANGE } = g.C;
const REV = '0.1';
const DATE = '27 September 2026';

// ---- title block
d.TITLE('Angle-Resolved Piezoresponse Force Microscopy (AR-PFM)',
  'In-plane polarisation vector mapping by sample rotation on the Bruker Dimension Icon (NanoScope 6)',
  'Method guide and step-by-step procedure — Micro Nano Research Facility (MNRF), RMIT University');
TABLE(['Field', 'Entry'], [
  ['Document', 'MNRF AFM method guide — AR-PFM on Dimension Icon (assign facility document number)'],
  ['Revision / date', `Rev ${REV} DRAFT — ${DATE}`],
  ['Prepared by', 'Chenglong Xu, Senior Technical Officer, MNRF'],
  ['Review and approval', 'Required before release: [name, role] (technical review); MNRF Facility Manager (approval)'],
  ['Platform assumed', 'Bruker Dimension Icon, NanoScope 6 controller, NanoScope software 10.x. Parameter names are NanoScope names; Asylum AR/Igor names and menu paths do not apply.'],
  ['Related documents', 'AR-PFM on the Cypher ES — Method Guide (same measurement model and analysis; Asylum-specific procedure)'],
  ['Companion files', 'ar_pfm_analysis.py (repository xuft/ML, folder ar_pfm): reads NanoScope .spm/.000 files directly. Document source: ar_pfm/doc_src (regenerate with node icon_guide.js).'],
  ['Evidence labels', '[published] literature, vendor or Bruker-help value; [typical] typical range from practice; [estimate] engineering estimate to be tightened on our instrument; [derived] follows from the stated model; [calculation] arithmetic from stated inputs; [verify] must be confirmed on our Icon and NanoScope build and entered in Appendix A before release.'],
], W(1, 3.2));
d.CONTENTS(['1  Purpose, scope and assumed sample class', '2  Read first', '3  Measurement principle and detection routes on the Icon',
  '4  Safety and prerequisites', '5  Probes, reference samples and rotation hardware', '6  Session set-up and calibration (NanoScope 10)',
  '7  Sample preparation, mounting and rotation centre', '8  Acquisition sequence', '9  Data analysis and acceptance criteria',
  '10  Artefact diagnosis (ranked causes and discriminating tests)', '11  Reporting',
  '12  Using the Liu et al. (2023) channel-learning workflow on the Icon', '13  References',
  'Appendix A  Local parameter map (NanoScope 10)', 'Appendix B  Acquisition log', 'Appendix C  Manifest and commands']);

// ---- 1
PAGEBREAK();
H1('1  Purpose, scope and assumed sample class');
P('This guide gives the procedure for mapping the in-plane piezoresponse vector (direction and relative magnitude) on the MNRF Dimension Icon. The sample is rotated relative to the cantilever through N orientations. Vertical PFM (VPFM) and lateral PFM (LPFM) are acquired simultaneously at each orientation on two lock-ins, co-registered onto the 0° frame, and each pixel is fitted with a first-harmonic model in the rotation angle. The outputs are an in-plane angle map with per-pixel uncertainty, a magnitude map, and quality-control maps that separate genuine in-plane response from crosstalk.');
P('**Assumed sample class.** Stiff (Young’s modulus ≳ 50 GPa), insulating ferroelectric thin film, 20–300 nm, on a conducting bottom electrode (e.g., SrRuO_{3}), or a bulk single crystal with a back electrode; ambient air at room temperature. The recommendations change as follows:');
B('**Compliant samples** (P(VDF-TrFE), bio-piezoelectrics): lateral slip and indentation dominate the torsional signal. Prefer Route B (force-volume based, §3.5) and expect the second-harmonic QC (§9.4) to fail first in Route A.');
B('**Leaky or semiconducting films:** electrochemical and electrostatic contributions grow; reduce V_{ac} and run the DC-bias test in §10 before trusting any in-plane contrast.');
B('**Humidity-sensitive surfaces:** the Icon acoustic hood is not a sealed environmental cell. Water-meniscus changes over a day-long series are a larger systematic here than on a sealed-cell instrument; log RH and see §5.3.');
B('**Liquid environment and heated stages:** not covered.');
P('Out of scope: switching spectroscopy (separate guide), absolute d_{ij} extraction (requires lateral sensitivity calibration; see Choi et al. 2011), and Asylum Cypher workflows (see the related Cypher ES guide).');

// ---- 2
H1('2  Read first');
CALLOUT('What changes relative to the Cypher ES guide', [
  'The measurement model, orientation sets, calibration against a y-cut LiNbO_{3} reference, analysis script and acceptance criteria are the same. Rotation mechanics, the detection chain and every software label are different. The Icon’s head and laser stay untouched while the sample is rotated, and both lock-ins run at once, so VPFM and LPFM come from the same scan. These are the two practical advantages over the Cypher ES; the lack of a sealed environmental cell is the main disadvantage.',
]);
B('**No band-excitation hardware at MNRF.** The Liu et al. (2023) paper used band-excitation PFM, which needs an external waveform-generation and digitisation chain (Jesse et al. 2007) that MNRF does not have. On the Icon, the nearest equivalent is DataCube CR-PFM (DCUBE-CR-PFM). It ramps the drive frequency through the contact resonance at every pixel of a force-volume map and returns CR-PFM amplitude, resonance frequency, Q and phase on resonance [published, Bruker AN156]. Whether our Icon is licensed for it is to be confirmed [verify].');
B('**Changing Scan Angle is not a sample rotation.** Scan Angle rotates the raster; the lever keeps its orientation relative to the sample, so the LPFM sensitivity axis is unchanged in the sample frame. Only a physical rotation of the sample changes which in-plane component is measured.');
B('**LPFM reports only the in-plane displacement perpendicular to the lever’s long axis.** The component along the lever axis buckles the lever and appears in the vertical channel. The rotation series separates both, and the buckling term becomes a built-in consistency check (§3.1).');
B('**NanoScope help pages cited here describe the NanoScope V controller** (NanoScope 8/9 era). NanoScope 6 with NanoScope 10 keeps the PFM concepts but may rename panels and parameters; every label below that comes from those pages is marked for confirmation in Appendix A.');

// ---- 3
H1('3  Measurement principle and detection routes on the Icon');
H2('3.1  Signal model');
P('In the 0° image frame (x right, y up, angles counter-clockwise), a pixel with in-plane displacement r at direction ψ, after a sample rotation θ_{k}, gives an in-phase LPFM signal');
EQ('L_{k} = g_{k} S_{L} r cos(ψ − φ_{L} + θ_{k}) + c_{L}', '(1)');
P('with lateral sensitivity S_{L}, per-orientation gain g_{k} (ideally 1), sensitivity-axis direction φ_{L} and rotation-invariant background c_{L}. Per pixel, L_{k} = a cos θ_{k} + b sin θ_{k} + c is linear, so r ∝ √(a^{2} + b^{2}) and ψ = h · atan2(−b, a) + φ_{0}. The handedness h and offset φ_{0} are fixed once against a reference of known in-plane polarisation (§9.3) [derived]. The vertical signal at the same orientation,');
EQ('V_{k} = S_{V} u_{z} + β S_{V} r cos(ψ − φ_{L} ± 90° + θ_{k}) + c_{V}', '(2)');
P('carries the rotation-invariant out-of-plane response u_{z} in its constant and a buckling harmonic shifted by ±90° from the lateral one. The fitted vertical angle minus the fitted lateral angle must therefore cluster at ±90°. A cluster at 0° or 180° means lateral-to-vertical optical crosstalk rather than buckling [derived]. On the Icon both channels come from the same scan, so this test costs nothing.');
H2('3.2  Background c');
P('Vertical-to-lateral optical crosstalk (α u_{z}), electrostatic lateral forces, tip-asymmetry torsion and drive feedthrough are fixed in the lever frame and land in c. The c_{L} map should be featureless. If it reproduces the VPFM domain pattern, crosstalk is significant; if it reproduces topography, suspect topographic or electrostatic coupling (§10).');
H2('3.3  Orientation sets and precision');
TABLE(['Orientation set', 'Resolvable per pixel', 'Residual dof', 'Use'], [
  ['4 (0/90/180/270°)', 'a, b, c', '1', 'Fast vector map; antipodal pairs cancel c exactly; no meaningful QC'],
  ['**8 (45° steps) + 0° closure**', 'a, b, c; per-orientation gains; 2nd-harmonic test', '5 (3 with 2nd harmonic)', '**Recommended default**'],
  ['12 (30° steps) + 0° closure', 'as above', '9', 'Publication grade; same 30° sampling as Park et al. (2010) and Kim et al. (2018)'],
], W(1.3, 1.9, 0.9, 2.4));
P('The harmonic fit returns a continuous angle with σ_{ψ} ≈ (σ/r)·√(2/N) rad for N equally spaced orientations and per-image noise σ [derived]; r/σ = 10 with N = 8 gives ≈ 2.9° [calculation].');
H2('3.4  Scan geometry on the Icon');
P('Keep **Scan Angle**, **Scan Size**, **Samples/Line** and **Lines** identical at every orientation; the ROI rotates in the image and is registered numerically. Scan Size ≥ √2 × ROI + 2 × relocation uncertainty. The Icon scanner covers 90 × 90 µm [published, Bruker specifications], and the motorised XY stage is open loop (stepper motors, unencoded) [published, Bruker help]. Taking ±5 µm relocation after fiducial search [estimate], the largest usable ROI is ≈ (90 − 10)/√2 ≈ 56 µm [calculation]. In practice pixel density limits the ROI: 512 samples over a 15 µm scan is 29 nm per pixel, so use 3–10 µm ROIs with 8–20 µm scans for domain work.');
H2('3.5  Detection routes');
TABLE(['', 'Route A — off-resonance, two lock-ins (default)', 'Route B — DCUBE-CR-PFM (per-pixel frequency ramp)'], [
  ['Principle', 'Single drive frequency; lock-in 1 on the vertical detector, lock-in 2 on the horizontal detector; VPFM and LPFM in one contact scan [published, Bruker help: “PFM Vertical and Horizontal Domains”]', 'Force-volume map; at each pixel the drive frequency is ramped through the contact resonance and fitted [published, Bruker AN156]'],
  ['Drive frequency', '10–80 kHz in a flat, peak-free window [typical]; Bruker’s PPLN example uses 17 kHz [published, Bruker help]', 'A span covering the CR; Bruker’s example ramps 250–400 kHz in a 100 ms dwell (vertical) [published]'],
  ['Output used for the fit', 'X = A cos(φ − φ_{ref}) for each lock-in', 'Drive-referenced amplitude (on-resonance amplitude / Q) and phase on resonance'],
  ['Stability across remounts', 'Good: off resonance, amplitude and phase barely depend on contact stiffness', 'Good after the per-pixel fit; raw on-resonance amplitude is not comparable between orientations'],
  ['Lateral channel', 'Yes (Lock-In2 Source: Horizontal) [published]', '[verify] whether DCUBE-CR-PFM can use the horizontal detector. If vertical only, AR analysis still works on the buckling term of equation (2), with β ≈ 0.1–0.3 of the lateral sensitivity [estimate].'],
  ['Wear and friction', 'Contact scanning: friction torsion (trace/retrace) and tip wear over 9–13 images', 'No lateral dragging between pixels, so no scan-direction torsion and less wear [published, Bruker AN156]'],
  ['Time per orientation', '≈ 17 min at 512 lines, 0.5 Hz', '100 ms per pixel: 128 × 128 ≈ 27 min, 256 × 256 ≈ 1.8 h [calculation]'],
  ['Choose when', 'Contrast-to-noise ≥ 5 at the planned settings (6.6)', 'Route A contrast-to-noise < 5, compliant samples, or excessive wear'],
], W(1.15, 2.55, 2.5));
P('**Not recommended for AR fitting:** single-frequency excitation at the contact resonance while scanning. Without resonance tracking, amplitude and phase follow every CR shift (topography, stiffness, orientation, tip wear), which the rotation fit reads as in-plane response. Use it only for qualitative domain imaging, unless our NanoScope 6 configuration provides contact-resonance tracking during scanning [verify]. Resonance-enhanced PFM at ≈ 300 kHz (vertical) and 750–850 kHz (lateral) with < 1 V drive is reported by McGilly et al. (arXiv:1912.06629) [published].');

// ---- 4
H1('4  Safety and prerequisites');
P('This procedure operates under the existing Dimension Icon instrument risk assessment and MNRF induction and introduces no new plant. It adds repeated sample handling close to the head and motorised stage, an optional rotation stage and dry-gas purge, optional FIB-milled fiducials and possibly lead-containing samples. Controls are listed in hierarchy order; PPE is never the primary control.');
TABLE(['Hazard', 'Controls (hierarchy order)', 'Residual risk', 'Governing document'], [
  ['Motorised stage and Z-stage moves while hands are near the chuck (pinch; probe or head collision)',
    'Engineering: raise the head before any manual work (8.3.1); use the software sample-load position rather than reaching under the head [verify command name].\nAdministrative: hands clear of the stage during every motorised move; one operator at the controls.',
    'Low', 'Dimension Icon instrument risk assessment; HSW-PR09 Risk Management'],
  ['Lead-containing films (PZT, PbTiO_{3}): fragments and dust when cleaving or scribing',
    'Substitution: use PPLN/LiNbO_{3} or BiFeO_{3} for training and set-up.\nEngineering: cleave or scribe only in the fume cupboard, over a containment tray.\nAdministrative: SDS and ChemAlert entry before purchase or receipt; label samples; wet-wipe the chuck area after handling.\nPPE: nitrile gloves.',
    'Low', 'RMIT HSW-PR32 Hazardous Substances; HSW-PR32-WI01; pre-purchase form HSW-PR32-TM01'],
  ['Solvents and solvent-based silver paint', 'Substitution: water-based conductive paint where tolerated.\nEngineering: fume cupboard for application and curing.\nAdministrative: minimum quantities at the instrument.\nPPE: gloves, safety glasses.', 'Low', 'HSW-PR32; HSW-PR32-WI01'],
  ['Optional dry N_{2} purge into the acoustic hood: cylinder handling; asphyxiation in a small room',
    'Engineering: cylinder restrained; regulator with flow restriction at the lowest flow that holds RH; ventilation and O_{2} monitoring as required by the room risk assessment.\nAdministrative: gas on only during the series.\nPPE: safety footwear for cylinder moves.',
    'Low where the room risk assessment covers this gas and flow; otherwise **Medium**', 'HSW-PR32; HSW-PR09; room risk assessment'],
  ['FIB fiducial milling (ORION NanoFab)', 'Performed by authorised ORION users under the ORION SOP and risk assessment.', 'As per ORION risk assessment', 'ORION NanoFab SOP/RA'],
], W(1.5, 3.1, 1.0, 1.4));
CALLOUT('Escalation triggers', [
  'Residual risk ≥ Medium requires **Senior Leader sign-off before work starts** (RMIT HSW-PR09 Risk Management). Triggers here: purge gas or flow not covered by the room risk assessment; any high-voltage tip-bias option used outside the manufacturer’s enclosed configuration; handling Pb-containing powders rather than intact films.',
  `Procedure numbers were taken from the RMIT HSW pages on ${DATE} [published]; confirm current titles and revisions on the RMIT Policy Register before release.`,
]);
P('**Prerequisites.** Dimension Icon authorised user; signed off on contact-mode PFM on PPLN; ORION authorisation, or a service request, if fiducials are milled; and the NanoScope parameter map (Appendix A) completed once for our build.');

// ---- 5
H1('5  Probes, reference samples and rotation hardware');
H2('5.1  Probes');
TABLE(['Part number (maker)', 'Coating / tip', 'k (N/m)', 'f_{0} (kHz)', 'Length', 'Role here', 'Price'], [
  ['**SCM-PIT-V2** (Bruker)', 'Pt-Ir, tip side; reflex coating', '3', '75', '225 µm', 'Standard Bruker PFM/SCM probe; set-up and Route A.', 'USD 520 per 10 [published, Bruker probe store list]; ≈ AUD 780–830 at 0.63–0.67 USD/AUD, before freight and GST [estimate]'],
  ['**AD-2.8-AS** (Adama; sold via Bruker)', 'Boron-doped conductive diamond; 10 nm tip radius', '2.8', '65', '225 µm', '**Production rotation series.** Wear resistance over 9–13 contact images.', 'Not publicly listed; obtain quote (5 per pack)'],
  ['**ElectriMulti75-G** (BudgetSensors)', 'Cr 5 nm / Pt 25 nm; < 25 nm tip radius', '3 (1–7)', '75 (60–90)', '225 µm', 'Training, frequency and drive sweeps.', 'USD 240 per 10 [published, vendor list]; ≈ AUD 360–380 [estimate]'],
], W(1.35, 1.2, 0.6, 0.65, 0.65, 1.6, 1.5));
P('Use rectangular levers only (torsional detection), about 3 N/m. Stiffer levers are tolerated by Route B, which avoids lateral dragging [published, Bruker AN156], but they reduce torsional sensitivity, so keep ≈ 3 N/m when LPFM is needed. Metal-coated tips wear over 9–13 contact images at 100–300 nN [estimate]; this shows as a monotonic gain drift in §9.4, hence diamond for the production series. **Probe holder:** PFM needs a holder that makes electrical contact to the probe chip; confirm which holder our Icon uses for PFM and record it in Appendix A [verify].');
CALLOUT('Rule: one probe per series', ['Use a single probe for the entire rotation series including the closure image. A probe change invalidates the gains and phase references, and the series restarts.']);
H2('5.2  Reference samples');
TABLE(['Sample', 'Purpose', 'Expected result'], [
  ['z-cut PPLN (periodically poled LiNbO_{3})', 'VPFM sanity check; LPFM null test; crosstalk α; frequency survey (6.5)', 'VPFM: 180° phase contrast, uniform amplitude except minima at walls. LPFM: ≈ 0 inside domains apart from α × VPFM; wall-localised LPFM contrast is expected [typical].'],
  ['**y-cut LiNbO_{3}, single domain, +z marked by the vendor**', '**In-plane direction reference: sets φ_{0}** (and h, if two non-collinear directions are available)', 'The mirror plane contains the surface normal (y) and z, so by symmetry the in-plane response is strictly along ±z, driven by d_{24} = d_{15} (≈ 69 pm/V, commonly tabulated, e.g., Weis & Gaylord 1985 [published]). L(θ) is a single cosine [derived].'],
  ['x-cut LiNbO_{3}', '**Do not use as a direction reference**', 'No mirror contains the x normal; d_{15} (xz shear) and d_{16} = −2d_{22} (xy shear) tilt the in-plane response off the polar axis [derived from the 3m tensor].'],
  ['In-sample reference (a/c stripes in PbTiO_{3}; 71° stripes in BiFeO_{3})', 'Axis check inside the ROI', 'Stripe direction fixes the axis modulo 180°; the sign needs the y-cut reference.'],
], W(1.6, 1.6, 3.0));
P('Confirm that the vendor’s crystal axes follow the convention with x perpendicular to a mirror plane (d_{11} = 0, d_{22} ≠ 0) before accepting a crystal as “y-cut”. **Recommended arrangement:** co-mount a ≈ 2 × 2 mm y-cut chip on the same rotation plate as the sample, back-contacted with silver paint, so it rotates with the sample and gives a direction and gain check at every orientation. The Icon’s stage travel (≈ 150 × 180 mm [published]) makes this easy.');
H2('5.3  Rotation hardware and environment');
STEP('Option 1', '**Manual rotation stage on the chuck (recommended).** A low-profile stage graduated at ≤ 1°, held by the chuck vacuum or screwed to a plate. The total height including the sample must not exceed the Icon limit of 15 mm [published, Bruker specifications]. Mount the sample on a conductive plate on the stage, with the ROI on the rotation axis within ≈ 0.5 mm [estimate], so the ROI stays in one optical field (180–1465 µm [published, Bruker specifications]) after each rotation. The sample electrode needs a flexible ground lead with slack for 360°, or a slip contact.');
STEP('Option 2', '**Plate rotated by hand on the chuck.** Mount the sample on a round steel disc or glass slide with an index line, place a printed polar template under it, and rotate it on the vacuum chuck. Relocate the ROI with the stage using the rotation centre (§7.4). Manual rotation is good to ±1–2° [estimate]; the analysis uses the measured angle, so this only has to keep the ROI in the scan window and within the ±4° registration search.');
P('**Humidity.** The acoustic hood is not sealed. Place a logging RH/T sensor inside the hood and record it at every orientation. If RH drifts by more than ≈ 5 percentage points over the series [estimate], add a dry-N_{2} purge into the hood (subject to §4) or shorten the series. Open the hood only for rotation.');
H2('5.4  Fiducials (ranked)');
STEP('1', '**FIB-milled marker set (ORION NanoFab), Ne^{+} preferred over Ga^{+}.** Four L-shaped marks (2 × 0.5 µm arms, 50–100 nm deep) at the corners of a 40 µm square centred on the ROI, one corner doubled to break the symmetry, plus a ≥ 20 µm coarse mark within 200 µm for the Icon optics. **Never image the ROI with the ion beam.** Acquire a 0° VPFM/LPFM baseline of the ROI before milling and compare it afterwards.');
STEP('2', '**Tip-written box domains** (±V_{dc} squares ≥ 10 µm from the ROI) on switchable films; visible in VPFM at every orientation, and need a coarse optical mark as well.');
STEP('3', '**Scribe mark ≥ 200 µm away:** coarse location only.');
STEP('4', '**Existing features:** free, but unreliable over a long series.');

// ---- 6
H1('6  Session set-up and calibration (NanoScope 10)');
CALLOUT('Platform note — NanoScope 6 controller and NanoScope 10 software', [
  'NanoScope 6: three digital lock-ins, 16-bit ADCs at 50 MHz and 10 MHz, eight 20-bit ADCs at 500 kHz, eight simultaneous data channels [published, Bruker]. Bruker documents the NanoScope 6 with NanoScope 10.0 R1 software [published]; record the installed version in Appendix B.',
  'PFM labels below (the PFM Vertical and Horizontal Domains experiment, the LS PR parameters, the Generic Lock-in panel, Lock-In2 Source, Generic Sweep) come from Bruker’s NanoScope help for the NanoScope V controller [published]. Confirm each one in NanoScope 10 and enter it in Appendix A before release [verify].',
], ORANGE);
STEP('6.1', 'Icon powered and thermally stable for ≥ 1 h [typical]; hood closed; RH/T logger running inside the hood.');
STEP('6.2', 'Fit the probe in the PFM-capable holder (5.1). Place the laser near the free end **on the lever centreline**, since off-centre spots mix flexural and torsional signals. Maximise SUM, then bring the vertical and horizontal deflection readings near zero with the detector adjustment. Record SUM, vertical and horizontal deflection, and save a screenshot. **Do not touch the laser or detector adjustments again for the rest of the series:** the Icon head is not disturbed by rotating the sample, and a constant spot is what keeps g_{k} ≈ 1.');
STEP('6.3', 'Deflection sensitivity from a force ramp on sapphire, and spring constant from a thermal tune [verify menu locations in NanoScope 10]. Record both.');
STEP('6.4', 'Load the **PFM Vertical and Horizontal Domains** experiment, which uses the Generic Lock-in interface to run two lock-ins simultaneously [published, Bruker help]. Check that lock-in 1 **Input** is the Vertical Photo-detector and that **Lock-In2 Source** is Horizontal [published, Bruker help]; both lock-ins share the drive. The Generic Lock-in **Input** options listed by Bruker are Vertical Photo-detector, Horizontal Photo-detector, Application Module and Front Panel [published].');
STEP('6.5', '**Frequency survey** on PPLN in contact: **Generic Sweep** (RealTime menu) with the tip offset at zero [published, Bruker help], 10 kHz–1.2 MHz, once with each detector as input. Identify the vertical CR (≈ 250–400 kHz for ≈ 3 N/m levers on oxides [typical]) and the lateral CR (≈ 600–900 kHz [typical]). Mark spurious peaks from the holder, chuck or rotation stage; the rotation stage adds mechanical resonances of its own, so repeat this survey with the stage fitted.');
STEP('6.6', '**Route decision** (§3.5). At the planned drive, bandwidth and scan rate, image a patch of the actual sample at 0°. Compute contrast-to-noise: the difference in mean lateral X between two domains of opposite in-plane component, divided by twice the RMS of X within one domain. ≥ 5 means Route A; otherwise Route B, or a narrower bandwidth with a slower scan.');
STEP('6.7', '**Drive routing.** Confirm whether the AC drive is applied to the tip or to the sample [verify], using the parameter panel and, if accessible, an oscilloscope. The routing sets the sign of the phase (a 180° flip) and therefore the calibration offset. Never change it within a series or between the sample and reference measurements.');
STEP('6.8', '**Background (feedthrough) check.** With the drive on, withdraw the tip and read both lock-in amplitudes at f_{drive}; this is electrical feedthrough plus long-range electrostatics. It should be ≤ 10% of the expected LPFM contrast [estimate]; otherwise move f_{drive}.');
STEP('6.9', '**Crosstalk α on z-cut PPLN.** From the simultaneous scan, α = (LPFM X contrast between domains) / (VPFM X contrast between domains). |α| < 0.05 is acceptable [estimate]. Above ≈ 0.1, re-centre the laser across the lever width and repeat 6.2 before the series starts; this is the last point at which the laser may be moved.');
STEP('6.10', '**Drive amplitude** (**LS PR Drive Amplitude**). Bruker’s PPLN example uses 10 V at 17 kHz [published, Bruker help]; that is for a bulk crystal. For 50–100 nm films (coercive voltages typically 1–5 V [typical]), step the drive (0.25, 0.5, 1, 2 V) on a test area outside the ROI. Choose V_{ac} in the linear range and at ≤ ⅓ of the switching onset, taken from SS-PFM or from new domains in a before/after VPFM image [estimate]. Keep the DC offset at 0 V. [verify] whether the drive amplitude is zero-to-peak or RMS.');
STEP('6.11', '**Load** (**Deflection Setpoint**). F = k × deflection sensitivity × ΔV, where ΔV is the setpoint minus the free-lever vertical deflection. Target 100–300 nN for ≈ 3 N/m levers on oxides [typical]. Example: k = 3 N/m, 60 nm/V, ΔV = 1.0 V gives 180 nN [calculation]. The free deflection drifts slightly over a series, so before each engage read it and set the setpoint to free deflection + ΔV (8.3.6).');
STEP('6.12', '**Phase references.** In the Generic Lock-in panel, **Phase Offset** has +90°, −90° and Zero buttons [published, Bruker help]. Set each lock-in’s offset once, lock-in 1 on PPLN (VPFM) and lock-in 2 on the y-cut reference (LPFM), and record both values. **Do not press Zero, and do not reload the experiment, for the rest of the series:** reloading can restore stored offsets. The analysis aborts on a 180° flip (negative gain) but cannot repair it.');
STEP('6.13', '**Lock-in bandwidth** (**LS PR Lock-in BW**; Bruker’s PPLN example uses 0.3 kHz [published]). At 0.5 Hz and 512 samples, the pixel dwell per direction is 1/(2 × 512 × 0.5 Hz) = 1.95 ms. A bandwidth of 0.3–0.5 kHz gives a time constant of ≈ 0.3–0.5 ms, i.e. 4–6 time constants per pixel for a first-order response [calculation; confirm filter order, verify].');
STEP('6.14', '**Scan-direction choice.** Friction-induced static torsion reverses between trace and retrace and contaminates LPFM; Kim et al. (2023) report LPFM trace/retrace discrepancies that scale with scan angle and with the lever’s lateral tilt [published]. Acquire LPFM at the two **Scan Angle** values that put the fast axis parallel and perpendicular to the lever, and compare trace against retrace X. Keep the orientation with the smaller discrepancy; parallel is expected to win [derived]. Record which Scan Angle value that is on our Icon [verify], and keep it for the whole series. Save trace and retrace.');
H2('6.15  Scan settings (Route A)');
TABLE(['Parameter (NanoScope label)', 'Recommended', 'Rationale'], [
  ['**Scan Size**', '√2 × ROI + 10 µm (e.g., 16 µm for a 4 µm ROI) [calculation]', 'ROI contained at every orientation with open-loop stage relocation'],
  ['**Samples/Line**, **Lines**', '256 (survey), 512 (final)', 'Pixel ≤ ⅓ of the narrowest domain'],
  ['**Scan Rate**', '0.3–0.8 Hz at 512 samples', 'Pixel dwell ≥ 3–5 lock-in time constants'],
  ['**Scan Angle**', 'Fixed for the series (6.14)', 'Sensitivity axis fixed to the lever'],
  ['**X Offset**, **Y Offset**', 'Re-centre the ROI at each orientation', 'Scanner offsets, not stage moves, for the final centring'],
  ['**Deflection Setpoint**, **Integral Gain**, **Proportional Gain**', '6.11; gains just below oscillation', 'Constant load; stable tracking'],
  ['**LS PR Drive Amplitude**, **LS PR Drive Frequency** [verify labels]', '6.10; 10–80 kHz in a flat window', 'Linear, non-switching; off resonance'],
  ['**LS PR Lock-in BW** [verify label]', '0.3–0.5 kHz at 0.5 Hz, 512 samples', '6.13'],
  ['**Phase Offset** (lock-in 1 and lock-in 2)', 'Set once (6.12)', 'Constant X-projection'],
  ['Captured channels', 'Height Sensor; Deflection; amplitude and phase of lock-in 1 and lock-in 2; trace and retrace [verify names with the channels command]', 'Height Sensor drives registration; both directions drive QC'],
], W(1.9, 2.1, 2.2));
P('**Route B (DCUBE-CR-PFM) settings** [verify availability, lateral support and export]: a frequency ramp spanning the CR by about ±30%, dwell 50–100 ms, 128 × 128 pixels, trigger force equal to the Route A load, and the same Scan Size and Scan Angle at every orientation. Export the fitted per-pixel maps (on-resonance amplitude, Q, phase, frequency) as images for the analysis (§9.1).');

// ---- 7
H1('7  Sample preparation, mounting and rotation centre');
STEP('7.1', 'Clean with dry N_{2}; use solvent only if the film tolerates it (§4).');
STEP('7.2', 'Expose the bottom electrode and connect it to the conductive plate with silver paint; cure per the datasheet in the fume cupboard (≥ 30 min for solvent-based paints [typical]). Attach the flexible ground lead with slack for a full turn.');
STEP('7.3', 'Mount rigidly (thin cyanoacrylate or conductive epoxy, not tape) with the ROI on the rotation axis (Option 1) or near the plate centre (Option 2). Align a crystallographic edge to the index line and photograph it against the graduation. This defines ψ = 0 relative to the crystal axes. Co-mount the y-cut LiNbO_{3} reference and photograph its +z mark.');
STEP('7.4', '**Rotation centre in stage coordinates** (Option 2, and to check Option 1). Record the stage coordinates of one fiducial at 0° (p_{0}), rotate by 180° and record the same fiducial again (p_{180}). The centre is c = (p_{0} + p_{180})/2, whatever the rotation sense. After the first 90° step, record p_{90} and confirm the sense: p_{θ} = c + R(±θ)(p_{0} − c), where R is the 2-D rotation matrix and the sign is whichever reproduces p_{90}. From then on, drive the stage directly to p_{θ} and finish with the optics. Record c and the sense in Appendix A.');
STEP('7.5', 'Measure the resistance from the electrode to ground and record it; repeat after every rotation.');
STEP('7.6', 'Acquire the 0° baseline of the ROI, then mill or write fiducials (§5.4), then repeat the baseline.');

// ---- 8
H1('8  Acquisition sequence');
H2('8.1  Before the first orientation');
STEP('8.1.1', 'Complete §6 with the production probe and record in Appendix B: k, deflection sensitivity, f_{drive}, V_{ac}, ΔV and nN, both phase offsets, Scan Angle, α, drive routing and the NanoScope version.');
STEP('8.1.2', 'Engage at the ROI and wait until Z drift is < 2 nm/min [estimate].');
H2('8.2  Orientation 0°');
STEP('8.2.1', 'Survey scan (Scan Size 40–60 µm, 256 samples) to find the fiducials; set **X Offset**/**Y Offset** to centre the ROI. Record the stage coordinates.');
STEP('8.2.2', 'Acquire the simultaneous VPFM + LPFM image, trace and retrace. File-naming convention: SAMPLE_ARPFM_A000_0000.spm (the angle is always three digits; one file holds both lock-ins).');
STEP('8.2.3', 'Move to the co-mounted y-cut reference, acquire with the same settings, and return.');
STEP('8.2.4', 'Run the quick checks (§8.5) and complete the log line, including RH/T.');
H2('8.3  Rotation step (repeat for each θ_{k})');
STEP('8.3.1', 'Withdraw, then raise the head with the Z stage by at least the facility minimum clearance for manual work under the head [verify value]. Leave the laser and detector untouched.');
STEP('8.3.2', 'Move the stage to the load position if the rotation stage cannot be reached safely [verify command name]. Never rotate the sample directly under a lowered probe.');
STEP('8.3.3', 'Rotate by Δθ (e.g., 45°) counter-clockwise viewed from above, using the stage graduation (Option 1) or the template (Option 2). Lock the stage and check that the ground lead is not under tension. **Log the physical angle.** The analysis script works out automatically whether the image array is mirrored relative to that sense and reports angle_sign (§9.2).');
STEP('8.3.4', 'Re-check electrical continuity from the electrode to ground.');
STEP('8.3.5', 'Drive the stage to the predicted ROI position p_{θ} (7.4), focus the optics, and locate the coarse fiducial.');
STEP('8.3.6', 'Close the hood and allow 10–20 min thermal settling [estimate]. Check that SUM and the vertical and horizontal deflection are within ±5% of the logged values without adjusting anything [estimate]. Read the free vertical deflection and set **Deflection Setpoint** = free deflection + ΔV.');
STEP('8.3.7', 'Engage. At f_{drive}, both lock-in phases should be within ±5° of the logged values; **do not press Zero**.');
STEP('8.3.8', 'Survey scan: find the fine fiducials, which are now rotated by θ_{k} in the image, and centre the ROI with X/Y Offset. **Do not change Scan Angle.**');
STEP('8.3.9', 'Acquire the simultaneous VPFM + LPFM image with identical parameters, named with the angle (A045, A090, …); then the reference chip; then the quick checks (§8.5) and the log line.');
H2('8.4  Closure');
STEP('8.4.1', 'After the last orientation, return to 0° and repeat (file tag A360; manifest role “closure”). The closure image measures tip wear and sensitivity drift over the series.');
H2('8.5  Quick checks (every orientation)');
TABLE(['Check', 'Pass', 'If it fails'], [
  ['VPFM domain pattern against 0° (allowing for rotation)', 'Same configuration; no new or lost domains', 'Tip-induced switching or relaxation. Reduce V_{ac} or load; changed areas are invalid.'],
  ['LPFM trace against retrace', 'Same contrast', 'Friction torsion; revisit 6.14, or use Route B'],
  ['Phase at f_{drive}, both lock-ins', 'Within ±5° of the logged values', 'Check routing, frequency and whether the experiment was reloaded. Do not re-zero.'],
  ['SUM, vertical and horizontal deflection', 'Within ±5% of the logged values', 'Head or probe disturbed; the gain for this orientation will differ (§10 D)'],
  ['RH and T', 'Within ±5 percentage points and ±1 °C of the 0° values [estimate]', 'Purge, or accept and flag; §10 D'],
  ['Fiducials and ROI inside the frame with margin', 'Yes', 'Adjust offsets and re-scan'],
], W(2, 1.9, 2.3));
H2('8.6  Time budget');
TABLE(['Activity (per orientation)', 'Route A', 'Route B (128 × 128, 100 ms)'], [
  ['Raise head, rotate, continuity, stage move', '5–10 min', '5–10 min'],
  ['Thermal settling', '10–20 min', '10–20 min'],
  ['Engage, phase check, survey, centre', '10–15 min', '10–15 min'],
  ['Acquisition (VPFM + LPFM simultaneous)', '≈ 17 min (512 lines, 0.5 Hz)', '≈ 27 min + force-volume overhead [calculation]'],
  ['Reference chip', '≈ 10 min', '≈ 10 min (Route A is sufficient for the reference)'],
  ['**Total, 8 orientations + closure**', '**≈ 8–11 h** [estimate]', '**≈ 10–14 h** [estimate]'],
], W(2.6, 1.7, 1.9));

// ---- 9
H1('9  Data analysis and acceptance criteria');
H2('9.1  Files, installation and self-test');
P('The script reads NanoScope image files (.spm, .000, .001, …) directly, with no conversion. Channels are named “<NanoScope channel name> <Trace|Retrace>”, e.g., “Height Sensor Retrace”. Install with pip install numpy scipy pandas matplotlib, then run python ar_pfm_analysis.py selftest, which must print “SELFTEST PASSED”.');
P('The self-test writes a synthetic NanoScope-format series with a deliberately mirrored image frame and recovers ψ with 0.4° median error, rotation to ≤ 0.04°, gains to ≤ 1% and the mirror (angle_sign = −1) [measured, this implementation]. This checks the parser against its own reading of the format, not against a real Icon file. On the first real file: (i) run the channels command and confirm the channel list and scan geometry; (ii) the script aborts if a phase channel is not in degrees (|φ| > 400°), which catches scaling errors; (iii) compare the displayed orientation with an asymmetric fiducial once. DataCube hyperspectral files are not parsed: for Route B, export the fitted per-pixel maps as images and use those [verify export route].');
H2('9.2  Processing steps');
STEP('9.2.1', '**Manifest** (Appendix C): angle_deg, lpfm_file, vpfm_file (leave blank, since both lock-ins are in one file), role. Angles are physical, counter-clockwise viewed from above positive; the first row is 0°; the repeat of 0° is “closure”.');
STEP('9.2.2', '**Consistency.** The script aborts if Scan Size, samples, lines or Scan Angle differ between files, or if a data block is truncated or malformed.');
STEP('9.2.3', '**Projection.** X = A cos(φ − φ_{ref}), with one reference per lock-in for the whole series (--lat-phase-ref, --vert-phase-ref). If none is given it is estimated (modulo 180°) with a warning; that is not acceptable for absolute ψ.');
STEP('9.2.4', '**Registration** on Height Sensor: rotation search about the nominal angle (±--max-angle-dev), phase correlation for translation, joint sub-pixel refinement; the measured angle enters the fit. With --angle-sign auto, both senses are tried at the first rotated orientation and the result is reported as angle_sign. Because VPFM and LPFM share a file, they share one transform.');
STEP('9.2.5', '**Fit.** Equation (1) per pixel. --fit-gains adds per-orientation gains (geometric mean 1). A negative gain aborts the run, because it means a phase reference flipped. With ≥ 6 orientations the second-harmonic ratio is computed.');
STEP('9.2.6', '**Vertical consistency** (equation 2): the mode of ψ_{V,raw} − ψ_{L,raw} is reported and labelled buckling-consistent or crosstalk-like.');
H2('9.3  Calibration of ψ');
STEP('9.3.1', 'From the co-mounted y-cut LiNbO_{3} series (same probe, f_{drive} and phase offsets), choose a single-domain ROI and run the calibrate command with the known +z angle (Appendix C). If angle_sign = −1, pass --handedness −1. With two non-collinear known directions, give two ROI/angle pairs and h is determined as well.');
STEP('9.3.2', 'Re-run with the returned --handedness and --angle-offset, and store them with the probe, f_{drive}, drive routing and phase offsets in Appendix A.');
H2('9.4  Outputs and acceptance criteria');
P('Outputs: ar_pfm_maps.npz, ar_pfm_per_angle.csv, ar_pfm_qc.json and ar_pfm_summary.png. Thresholds are initial estimates, to be tightened after the first three series on the y-cut reference.');
TABLE(['Metric (file)', 'Accept', 'If not'], [
  ['angle_sign (json)', 'Stable for the instrument; matches the fiducial check', 'Featureless registration channel; see §10 E'],
  ['ncc_lpfm per orientation (csv)', '≥ 0.8 [estimate]', 'Registration unreliable: drift, fiducials; try --line-flatten or VPFM amplitude as the registration channel'],
  ['median_r2_strong (json)', '≥ 0.8 [estimate]', '§10 B'],
  ['median_h2_ratio_strong (json)', '≤ 0.2 [estimate]', '§10 C'],
  ['lat_gains (json)', '0.85–1.15 [estimate]', '§10 D'],
  ['closure slope and pearson_r (json)', '0.85–1.15 and ≥ 0.9 [estimate]', 'Tip wear, drift or humidity change across the series'],
  ['delta_vl_mode_deg (json)', '±90° ± 25°', 'Optical crosstalk, not buckling; §10 A'],
  ['offset_c_corr_with_vpfm (json)', '|r| ≤ 0.3 [estimate]', 'Crosstalk α significant; magnitudes suspect'],
  ['lpfm_Y_over_X_rms (csv)', '≤ 0.3 [estimate]', 'Wrong phase reference, or on-resonance data without a fit'],
  ['lpfm_trace_retrace_rel_diff (csv)', '≤ 0.2 [estimate]', 'Friction torsion; 6.14 or Route B'],
], W(2.1, 1.6, 2.5));

// ---- 10
H1('10  Artefact diagnosis (ranked causes and discriminating tests)');
const DIAG = (sym, rows) => { H2(sym); TABLE(['Rank', 'Cause', 'Discriminating test', 'Remedy'], rows, W(0.45, 1.7, 2.3, 1.75)); };
DIAG('A  The ψ map follows the VPFM (out-of-plane) domain pattern', [
  ['1', 'Vertical-to-lateral optical crosstalk', 'c_{L} correlates with VPFM; on z-cut PPLN, domain interiors show LPFM ∝ VPFM', 'Re-centre the laser across the lever width before the series (6.9)'],
  ['2', 'Electrostatic lateral force from the bound-charge pattern', 'Repeat one orientation at a DC offset of ±1 V: an electrostatic component changes linearly with it. KPFM shows the same pattern.', 'Higher load; DC offset at the contact potential; dry purge'],
  ['3', 'Genuine in-plane / out-of-plane coupling (e.g., 71°/109° variants)', 'Δψ_{VL} clusters at ±90° there; R^{2} high; second harmonic small', 'None; this is the result'],
]);
DIAG('B  Low R^{2} everywhere, or a noisy ψ', [
  ['1', 'Insufficient contrast-to-noise (Route A)', 'σ_{ψ} large; 0° contrast-to-noise < 5', 'Narrower bandwidth with a slower scan; higher V_{ac} within the linear range; Route B'],
  ['2', 'Phase offset changed (Zero pressed, or experiment reloaded)', 'Negative-gain abort, or lpfm_Y_over_X_rms jumps at one orientation', 'Re-acquire that orientation with the logged offsets'],
  ['3', 'Humidity drift (unsealed hood)', 'RH log tracks the residuals by acquisition order', 'Purge; shorter series; closure check'],
  ['4', 'Sample changed during the series', 'Registered VPFM differs between orientations', 'Reduce V_{ac} or load; exclude the changed region'],
  ['5', 'Registration error', 'ncc < 0.8; residuals follow domain walls', 'Longer settling; better fiducials; --line-flatten'],
]);
DIAG('C  Large cos 2θ component (second-harmonic ratio > 0.2)', [
  ['1', 'Orientation-dependent lateral slip or anisotropic tip contact', 'Also high on the y-cut reference; falls as load increases', 'More load; new probe; Route B'],
  ['2', 'Scan-direction-dependent torsion', 'lpfm_trace_retrace_rel_diff high', '6.14; Route B'],
  ['3', 'Genuine: mixed variants within the tip footprint at walls', 'Confined to walls', 'Mask walls in the statistics'],
]);
DIAG('D  Closure fails, or gains drift', [
  ['1', 'Tip wear', 'Gains fall with acquisition order rather than angle; VPFM amplitude falls too', 'Diamond probe; lower load; fewer surveys; Route B'],
  ['2', 'Sample moved on the rotation stage, or the ground lead tugged it', 'Gain step together with an unexpected registration shift; the continuity reading changes', 'Re-mount rigidly; add slack to the lead'],
  ['3', 'Humidity or temperature change', 'RH/T log', 'Purge; keep the hood closed'],
  ['4', 'Laser or detector disturbed', 'SUM, vertical or horizontal deflection step at that orientation', 'Series compromised from that step; restart, or rely on --fit-gains and the reference chip'],
]);
DIAG('E  Registration fails, or angle_sign is ambiguous', [
  ['1', 'Featureless topography', 'Low ncc everywhere; the ambiguity warning', 'Register on VPFM amplitude (--height with that channel name); add fiducials'],
  ['2', 'Rotation error > search window', 'Graduation or template photograph', '--max-angle-dev 8'],
  ['3', 'ROI outside the scan after open-loop relocation', 'Fiducials off-frame in the survey', 'Larger survey; recompute p_{θ} (7.4)'],
]);

// ---- 11
H1('11  Reporting');
P('Report: probe part number and measured k; route and f_{drive}; V_{ac} with its convention; drive routing; load in nN; lock-in bandwidth; number of orientations with nominal and measured angles; angle_sign; registration method; fit model; reference sample and calibration values h and φ_{0}; the acceptance metrics from §9.4; NanoScope software version; RH/T range over the series.');

// ---- 12
H1('12  Using the Liu et al. (2023) channel-learning workflow on the Icon');
P('**What the paper did** [published]: ensemble deep kernel learning (20 ensemble members, 3-layer network, 20 × 20 pixel patches, 0.25% seed points, 20 warm-up and 200 exploration steps with ε annealed 0.4 → 0.1). BE amplitude, phase, resonance frequency and topography were ranked by how well each predicts the areas of the BE polarisation and frequency hysteresis loops. It ran on a Cypher with band-excitation hardware and a GPU server; code at github.com/yongtaoliu/Ensemble-DKL.');
P('**On our Icon (no BE hardware).** DCUBE-CR-PFM supplies the same per-pixel quantities as BE imaging (on-resonance amplitude, frequency, Q, phase) [published, Bruker AN156; verify licence]. Bruker’s SS-PFM supplies the hysteresis loops [published, Bruker; verify licence and whether the frequency loop is available]. AR-PFM adds candidate channels: |L|, ψ (as cos ψ and sin ψ), c_{L}, the vertical constant c_{V} and topography.');
P('**Run it offline first.** Acquire the AR-PFM maps, then a coarse SS-PFM grid (e.g., 20 × 20 points at 0°), and run ensemble DKL retrospectively to rank channels. Build a live loop only if the offline ranking is informative; that needs programmatic control of NanoScope positioning and spectroscopy, which is a separate project. **Caveat:** the paper assumes imaging is cheap and spectroscopy expensive. With AR-PFM the maps cost 8–14 h, so the active-learning gain is in choosing where to spend spectroscopy, not which channels to acquire.');

// ---- 13
H1('13  References');
d.REFS([
  'Y. Liu, R. K. Vasudevan, K. P. Kelley, H. Funakubo, M. Ziatdinov, S. V. Kalinin, “Learning the right channel in multimodal imaging: automated experiment in piezoresponse force microscopy”, npj Comput. Mater. 9, 34 (2023). doi:10.1038/s41524-023-00985-x',
  'M. Park, S. Hong, et al., “Three-dimensional ferroelectric domain imaging of epitaxial BiFeO_{3} thin films using angle-resolved piezoresponse force microscopy”, Appl. Phys. Lett. 97, 112907 (2010).',
  'B. Kim, F. P. Barrows, Y. Sharma, R. S. Katiyar, C. Phatak, A. K. Petford-Long, S. Jeon, S. Hong, “Ferroelectric domain studies of patterned (001) BiFeO_{3} by angle-resolved piezoresponse force microscopy”, Sci. Rep. 8 (2018). doi:10.1038/s41598-017-18482-9',
  'K. Chu, C.-H. Yang, “High-resolution angle-resolved lateral piezoresponse force microscopy: visualization of in-plane piezoresponse vectors”, Rev. Sci. Instrum. 89, 123704 (2018).',
  'J. Kim, S. Cho, J. Yeom, S. Eom, S. Hong, “Revisiting contrast mechanism of lateral piezoresponse force microscopy”, J. Appl. Phys. 134, 214104 (2023). doi:10.1063/5.0177164',
  'S. V. Kalinin, B. J. Rodriguez, S. Jesse, J. Shin, A. P. Baddorf, P. Gupta, et al., “Vector piezoresponse force microscopy”, Microsc. Microanal. 12, 206–220 (2006). doi:10.1017/S1431927606060156',
  'H. Choi, S. Hong, K. No, “Quantitative measurement of in-plane cantilever torsion for calibrating lateral piezoresponse force microscopy”, Rev. Sci. Instrum. 82, 113706 (2011).',
  'S. Jesse, S. V. Kalinin, R. Proksch, A. P. Baddorf, B. J. Rodriguez, “The band excitation method in scanning probe microscopy for rapid mapping of energy dissipation on the nanoscale”, Nanotechnology 18, 435503 (2007).',
  'L. J. McGilly, A. Kerelsky, et al., “Seeing moiré superlattices”, arXiv:1912.06629 (2019).',
  'R. S. Weis, T. K. Gaylord, “Lithium niobate: summary of physical properties and crystal structure”, Appl. Phys. A 37, 191–203 (1985). doi:10.1007/BF00614817',
  'Bruker NanoScope help (NanoScope V controller), PFM chapter: “PFM Vertical and Horizontal Domains Operation”, “Check Vertical and Horizontal Domain PFM Parameters”, “Set Up the Generic Lock-In Interface”, “PFM Near Contact Resonance”; and “NanoScope V Controller Lock-In”, “Stage System”, “System Specifications”. Copies hosted by KTH Nanolab.',
  'Bruker Application Note AN156, “Characterizing Ferroelectric Materials with SS-PFM and DCUBE PFM”; Bruker DataCube Modes product page; Bruker NanoScope 6 Controller product page and brochure.',
  `Vendor data: Bruker AFM Probes (SCM-PIT-V2, AD-2.8-AS); BudgetSensors ElectriMulti75-G. RMIT HSW-PR32 and HSW-PR09 (rmit.edu.au). All web sources accessed ${DATE}.`,
]);

// ---- Appendices
PAGEBREAK();
H1('Appendix A  Local parameter map (NanoScope 10)');
P('Complete once for the MNRF Icon with NanoScope 6, with Bruker applications support where needed. Until every row is confirmed, this document remains a method guide, not an SOP.');
TABLE(['Function', 'Expected location / label (NanoScope V help)', 'Confirmed in NanoScope 10', 'Value / note'], [
  ['NanoScope software version', 'Help / About', '', ''],
  ['Two-lock-in PFM experiment', '“PFM Vertical and Horizontal Domains” (Generic Lock-in)', '', ''],
  ['Lock-in 1 input', 'Generic Lock-in: Input = Vertical Photo-detector', '', ''],
  ['Lock-in 2 input', 'Lock-In2 Source = Horizontal', '', ''],
  ['Drive amplitude and its convention (0-pk / RMS)', 'LS PR Drive Amplitude', '', ''],
  ['Drive frequency', 'LS PR Drive Frequency', '', ''],
  ['Lock-in bandwidth and filter order', 'LS PR Lock-in BW', '', ''],
  ['Phase offsets (lock-in 1, 2); Zero button', 'Generic Lock-in: Phase Offset (+90 / −90 / Zero)', '', ''],
  ['Drive routing (tip / sample)', '[verify]', '', ''],
  ['Frequency survey', 'RealTime menu: Generic Sweep', '', ''],
  ['CR tracking during contact scanning (NanoScope 6)?', '[verify]', '', ''],
  ['DCUBE-CR-PFM licence; horizontal-detector support; map export', '[verify]', '', ''],
  ['PFM probe holder part', '[verify]', '', ''],
  ['Scan Angle giving fast axis parallel to the lever', 'Scan Angle (6.14)', '', ''],
  ['Minimum head clearance for manual rotation; load-position command', '[verify]', '', ''],
  ['Rotation centre c and stage sense', '7.4', '', ''],
  ['angle_sign (image array mirrored?)', 'ar_pfm_qc.json; fiducial check', '', ''],
  ['Saved channel names', 'ar_pfm_analysis.py channels <file>', '', ''],
  ['Calibration h, φ_{0} (per probe, f_{drive}, routing, offsets)', 'calibrate command (§9.3)', '', ''],
], W(2.0, 2.0, 1.2, 1.0));
H1('Appendix B  Acquisition log');
P('Session header: date, operator, NanoScope version, probe part and lot, k, deflection sensitivity, f_{drive}, route, V_{ac}, ΔV (V and nN), drive routing, phase offsets (lock-in 1 and 2), lock-in bandwidth, Scan Angle, Scan Size, Samples/Line, Lines, Scan Rate, α, rotation centre c.');
TABLE(['Nominal angle', 'Time', 'File', 'Stage X, Y', 'SUM / Vert / Horiz', 'Free defl. / setpoint', 'Phase 1 / 2 at f (°)', 'RH / T', 'Continuity (Ω)', 'Notes'],
  ['0', '45', '90', '135', '180', '225', '270', '315', '360 (closure)'].map((a) => [a, '', '', '', '', '', '', '', '', '']),
  W(0.75, 0.55, 1.1, 0.8, 0.9, 0.8, 0.8, 0.6, 0.7, 0.9));
H1('Appendix C  Manifest and commands');
P('manifest.csv (paths relative to the manifest; vpfm_file blank because both lock-ins are in one file):');
CODE(['angle_deg,lpfm_file,vpfm_file,role', '0,S1_ARPFM_A000_0000.spm,,fit', '45,S1_ARPFM_A045_0000.spm,,fit', '… (90 to 315 in 45° steps) …', '360,S1_ARPFM_A360_0000.spm,,closure']);
P('Commands (from the ar_pfm folder). Channel names are placeholders; take the real ones from the channels command:');
CODE([
  'python ar_pfm_analysis.py selftest',
  'python ar_pfm_analysis.py channels S1_ARPFM_A000_0000.spm',
  'python ar_pfm_analysis.py run manifest.csv --out results --height "Height Sensor Retrace" --lat-amp "<lock-in 2 amplitude> Retrace" --lat-phase "<lock-in 2 phase> Retrace" --vert-amp "<lock-in 1 amplitude> Retrace" --vert-phase "<lock-in 1 phase> Retrace" --lat-phase-ref <deg> --vert-phase-ref <deg> --fit-gains',
  'python ar_pfm_analysis.py calibrate results/ar_pfm_maps.npz --roi r0 r1 c0 c1 --psi <deg> --handedness <±1>',
  'python ar_pfm_analysis.py run manifest.csv --out results ... --handedness <h> --angle-offset <φ_0>',
]);

g.write(d, {
  headerTitle: 'Angle-Resolved PFM on the Dimension Icon — Method Guide',
  docTitle: 'AR-PFM on the Dimension Icon — Method Guide',
  rev: REV, date: DATE, preparedBy: 'C. Xu, MNRF',
  centreNote: 'DRAFT for review — uncontrolled when printed',
}, process.argv[2] || 'AR-PFM_DimensionIcon_Method_Guide.docx');
