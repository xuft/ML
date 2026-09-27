#!/usr/bin/env python3
"""Angle-resolved PFM (AR-PFM) reconstruction for Asylum Cypher and Bruker Icon data.

The sample is physically rotated by a set of angles theta_k relative to the
cantilever, and lateral PFM (LPFM, and optionally vertical PFM, VPFM) images are
acquired at each orientation with an unchanged Scan Angle. This script:

1. loads the images (Asylum .ibw via ``igor2``, Bruker NanoScope .spm/.000,
   or .npz exports),
2. projects amplitude/phase onto a fixed lock-in reference phase (X signal),
3. registers every image back onto the 0 deg frame (rotation + translation,
   refined from the Height channel, so the *measured* rotation is used),
4. fits, per pixel, L(theta) = a cos(theta) + b sin(theta) + c
   (optionally with a per-orientation gain g_k and a 2nd-harmonic check),
5. returns the in-plane response magnitude, in-plane angle, the rotation-
   invariant background c, fit quality, and the VPFM buckling consistency check.

Angle convention: image-array frame (row 0 at the top), x to the right, y up,
angles counter-clockwise from +x. Manifest angles are the physical rotations
(counter-clockwise viewed from above); with ``--angle-sign auto`` the script
detects whether the image array is mirrored relative to that sense and reports
it as ``angle_sign`` (-1: mirrored; report psi with handedness -1). psi_raw is the fitted in-plane angle before
calibration; psi = handedness * psi_raw + angle_offset, with both constants
obtained from a reference of known in-plane polarisation (``calibrate``).

Sub-commands
------------
channels   list channel labels and note keys in a data file
run        full reconstruction from a manifest CSV
calibrate  derive handedness / angle offset from reference ROIs
selftest   synthetic end-to-end test (npz path, and NanoScope path with a
           mirrored frame; the .ibw reader is not covered)

Manifest CSV columns: ``angle_deg, lpfm_file`` and optionally ``vpfm_file``
(blank if VPFM was acquired in the same file or not at all) and ``role``
(``fit`` default, or ``closure`` for the repeat of the 0 deg orientation).
Paths are relative to the manifest.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import ndimage, optimize  # noqa: E402

LOG = logging.getLogger("ar_pfm")

# Scan-geometry keys that must agree across all files (Asylum note names; the
# NanoScope reader maps its header onto the same names).
GEOMETRY_KEYS = ("ScanSize", "ScanPoints", "ScanLines", "ScanAngle")
# Keys that should agree; a mismatch is reported but not fatal.
SOFT_KEYS = ("DriveFrequency", "DriveAmplitude", "SetPoint", "ScanRate")


class ARPFMError(RuntimeError):
    """Raised for malformed input or a failed consistency check."""


# --------------------------------------------------------------------------- I/O
@dataclass
class ScanFile:
    """One image file: channels in display orientation plus the parsed note."""

    path: Path
    channels: dict[str, np.ndarray]
    note: dict[str, str] = field(default_factory=dict)

    def get(self, name: str) -> np.ndarray:
        """Return a channel, failing loudly with the available names."""
        if name not in self.channels:
            raise ARPFMError(
                f"{self.path.name}: channel '{name}' not found. "
                f"Available: {sorted(self.channels)}"
            )
        return self.channels[name]


def _parse_note(raw: bytes | str) -> dict[str, str]:
    """Parse an Asylum wave note ('Key: value' lines, CR separated)."""
    text = raw.decode("latin-1") if isinstance(raw, bytes) else raw
    note: dict[str, str] = {}
    for line in text.replace("\r\n", "\r").replace("\n", "\r").split("\r"):
        if ":" in line:
            key, _, value = line.partition(":")
            note[key.strip()] = value.strip()
    return note


def load_ibw(path: Path) -> ScanFile:
    """Load an Asylum Research image .ibw (points x lines x channels)."""
    try:
        from igor2 import binarywave
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise ARPFMError("Reading .ibw requires 'pip install igor2'") from exc

    wave = binarywave.load(str(path))["wave"]
    data = np.asarray(wave["wData"], dtype=float)
    if data.ndim != 3:
        raise ARPFMError(
            f"{path.name}: expected a 3-D image wave (points, lines, channels), "
            f"got shape {data.shape}. Is this a force curve or a single channel?"
        )
    n_ch = data.shape[2]
    labels_all = wave.get("labels") or []
    if len(labels_all) < 3:
        raise ARPFMError(f"{path.name}: no channel labels in dimension 2")
    labels = [
        lab.replace(b"\x00", b"").decode("latin-1").strip() for lab in labels_all[2]
    ]
    if len(labels) == n_ch + 1:
        labels = labels[1:]  # first entry labels the dimension as a whole
    if len(labels) != n_ch or any(not lab for lab in labels):
        raise ARPFMError(
            f"{path.name}: {n_ch} channels but labels {labels}; file malformed"
        )
    channels = {
        lab: np.flipud(data[:, :, i].T) for i, lab in enumerate(labels)
    }  # Igor stores line 0 at the bottom; flip to display orientation
    return ScanFile(path, channels, _parse_note(wave.get("note", b"")))


_NS_ZSCALE = re.compile(
    r"^\S+\s+(?:\[([^\]]+)\]\s+)?\(\s*(-?[\d.eE+-]+)[^)]*\)\s+(-?[\d.eE+-]+)\s*(\S*)"
)
_NS_SOFT = re.compile(r"^\S+\s+(-?[\d.eE+-]+)\s*(\S*)")
_NS_NAME = re.compile(r'^\S+\s+\[([^\]]*)\]\s+"([^"]*)"')


def _ns_sections(path: Path) -> list[tuple[str, dict[str, str]]]:
    """Parse a NanoScope text header into (section name, {key: value}) pairs."""
    with open(path, "rb") as fh:
        if not fh.read(64).lstrip().startswith(b"\\*File list"):
            raise ARPFMError(f"{path.name}: not a NanoScope file (no '\\*File list' header)")
        fh.seek(0)
        sections: list[tuple[str, dict[str, str]]] = []
        while True:
            line = fh.readline()
            if not line:
                raise ARPFMError(f"{path.name}: header has no '\\*File list end'; truncated?")
            text = line.decode("latin-1").rstrip("\r\n").lstrip("\\")
            if text.startswith("*"):
                if text.strip() == "*File list end":
                    return sections
                sections.append((text[1:].strip(), {}))
            elif sections and ":" in text:
                key, sep, value = text.partition(": ")
                if not sep:
                    key, value = text.rstrip(":"), ""
                sections[-1][1].setdefault(key.strip(), value.strip())


def load_nanoscope(path: Path) -> ScanFile:
    """Load a Bruker NanoScope image file (.spm, .000, .001, ...).

    Scaling follows the common NanoScope convention (also used by pySPM):
    value = raw * (Z-scale full-scale value / 2^(8 * bytes per pixel)) *
    soft scale ('@Sens. ...' in the scanner or scan list). Lines are flipped so
    the last stored line is row 0, assuming line 0 is the bottom of the
    NanoScope display [verify on a known asymmetric feature]; a mirrored result
    is caught by --angle-sign auto.
    """
    sections = _ns_sections(path)
    size = path.stat().st_size
    globals_: dict[str, str] = {}
    for name, kv in sections:
        if name != "Ciao image list":
            for key, value in kv.items():
                globals_.setdefault(key, value)
    channels: dict[str, np.ndarray] = {}
    first_image: dict[str, str] | None = None
    for name, kv in sections:
        if name != "Ciao image list" or "@2:Image Data" not in kv:
            continue
        m = _NS_NAME.match(kv["@2:Image Data"])
        if not m:
            raise ARPFMError(f"{path.name}: cannot parse image name '{kv['@2:Image Data']}'")
        label = f"{m.group(2)} {kv.get('Line Direction', '')}".strip()
        try:
            n_lines, n_samps = int(kv["Number of lines"]), int(kv["Samps/line"])
            offset, length = int(kv["Data offset"]), int(kv["Data length"])
        except KeyError as exc:
            raise ARPFMError(f"{path.name}: image '{label}' lacks header key {exc}") from exc
        bpp = int(kv.get("Bytes/pixel", length // max(n_lines * n_samps, 1)))
        if bpp not in (2, 4) or length != n_lines * n_samps * bpp:
            raise ARPFMError(
                f"{path.name}: '{label}' data length {length} != {n_lines}x{n_samps}x{bpp}"
            )
        if offset + length > size:
            raise ARPFMError(f"{path.name}: '{label}' data block beyond end of file (truncated?)")
        zm = _NS_ZSCALE.match(kv.get("@2:Z scale", ""))
        if not zm:
            raise ARPFMError(f"{path.name}: cannot parse Z scale for '{label}'")
        soft_key, lsb, full = zm.group(1), float(zm.group(2)), float(zm.group(3))
        hard = full / 2 ** (8 * bpp)
        if not (np.isclose(lsb, hard, rtol=0.02) or np.isclose(lsb, full / 65536, rtol=0.02)):
            LOG.warning("%s: '%s' V/LSB %.3g inconsistent with full scale %.3g V at %d B/px",
                        path.name, label, lsb, full, bpp)
        soft = 1.0
        if soft_key:
            sv = globals_.get("@" + soft_key)
            sm = _NS_SOFT.match(sv or "")
            if not sm:
                raise ARPFMError(f"{path.name}: soft scale '@{soft_key}' for '{label}' not found")
            soft = float(sm.group(1))
        with open(path, "rb") as fh:
            fh.seek(offset)
            raw = np.frombuffer(fh.read(length), dtype={2: "<i2", 4: "<i4"}[bpp])
        img = np.flipud(raw.astype(float).reshape(n_lines, n_samps)) * hard * soft
        if label in channels:
            n = 2
            while f"{label} #{n}" in channels:
                n += 1
            LOG.warning("%s: duplicate channel '%s' stored as '%s #%d'", path.name, label, label, n)
            label = f"{label} #{n}"
        channels[label] = img
        first_image = first_image or kv
    if not channels:
        raise ARPFMError(f"{path.name}: no image layers found")
    note = {
        "ScanSize": globals_.get("Scan Size", first_image.get("Scan Size")),
        "ScanPoints": first_image.get("Samps/line"),
        "ScanLines": first_image.get("Number of lines"),
        "ScanAngle": globals_.get("Rotate Ang."),
        "ScanRate": globals_.get("Scan Rate", globals_.get("Scan rate")),
    }
    return ScanFile(path, channels, {k: v for k, v in note.items() if v is not None})


def load_npz(path: Path) -> ScanFile:
    """Load an .npz export: one 2-D array per channel, optional '__note__' JSON."""
    with np.load(path, allow_pickle=False) as npz:
        note: dict[str, str] = {}
        channels: dict[str, np.ndarray] = {}
        for key in npz.files:
            if key == "__note__":
                note = {k: str(v) for k, v in json.loads(str(npz[key])).items()}
            else:
                arr = np.asarray(npz[key], dtype=float)
                if arr.ndim != 2:
                    raise ARPFMError(f"{path.name}: channel {key} is not 2-D")
                channels[key] = arr
    if not channels:
        raise ARPFMError(f"{path.name}: no channels")
    return ScanFile(path, channels, note)


def load_scan(path: Path) -> ScanFile:
    """Dispatch on file suffix and validate that every channel is finite."""
    if not path.is_file():
        raise ARPFMError(f"File not found: {path}")
    suffix = path.suffix.lower()
    if suffix == ".ibw":
        scan = load_ibw(path)
    elif suffix == ".spm" or re.fullmatch(r"\.\d{3}", suffix):
        scan = load_nanoscope(path)
    elif suffix == ".npz":
        scan = load_npz(path)
    else:
        raise ARPFMError(f"{path.name}: unsupported format '{suffix}'")
    shapes = {arr.shape for arr in scan.channels.values()}
    if len(shapes) != 1:
        raise ARPFMError(f"{path.name}: channels differ in shape {shapes}")
    for name, arr in scan.channels.items():
        if not np.all(np.isfinite(arr)):
            raise ARPFMError(
                f"{path.name}: channel {name} has non-finite values "
                "(incomplete frame?). Re-acquire or crop before analysis."
            )
    return scan


def check_consistency(scans: list[ScanFile]) -> None:
    """Fail on scan-geometry mismatch across files; warn on soft mismatches."""
    ref = scans[0]
    for key in GEOMETRY_KEYS + SOFT_KEYS:
        values = {s.path.name: s.note.get(key) for s in scans}
        present = {k: v for k, v in values.items() if v is not None}
        if not present:
            LOG.warning("Note key '%s' absent in all files; not checked", key)
            continue
        if len(present) != len(values):
            LOG.warning("Note key '%s' missing in some files: %s", key, values)
        distinct = set(present.values())
        if len(distinct) > 1:
            msg = f"Inconsistent '{key}' across files: {present}"
            if key in GEOMETRY_KEYS:
                raise ARPFMError(msg + " (scan geometry must be identical)")
            LOG.warning(msg)
    shape = next(iter(ref.channels.values())).shape
    for s in scans[1:]:
        other = next(iter(s.channels.values())).shape
        if other != shape:
            raise ARPFMError(f"{s.path.name}: image shape {other} != {shape}")


# ------------------------------------------------------------------ signal model
def complex_signal(amp: np.ndarray, phase_deg: np.ndarray) -> np.ndarray:
    """Lock-in output as a complex number A exp(i phi)."""
    if np.any(amp < 0):
        raise ARPFMError("Negative amplitude values: wrong channel selected?")
    if np.nanmax(np.abs(phase_deg)) > 400:
        raise ARPFMError(
            "Phase values exceed 360 deg in magnitude: the phase channel is not in "
            "degrees (wrong channel, or unscaled NanoScope data)."
        )
    return amp * np.exp(1j * np.deg2rad(phase_deg))


def estimate_phase_ref(z_list: list[np.ndarray]) -> float:
    """Principal-axis phase (deg) of the pooled lock-in signal, modulo 180 deg."""
    z = np.concatenate([zz.ravel() for zz in z_list])
    return float(np.rad2deg(0.5 * np.angle(np.sum(z**2))))


def project(z: np.ndarray, phase_ref_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Rotate the lock-in signal so that the response lies in X; return (X, Y)."""
    zr = z * np.exp(-1j * np.deg2rad(phase_ref_deg))
    return zr.real, zr.imag


# ------------------------------------------------------------------ registration
def level_height(img: np.ndarray, line_flatten: bool = False) -> np.ndarray:
    """Plane fit and isotropic high-pass, optionally line-offset removal; standardised.

    Line-wise flattening is off by default: it is not rotation-invariant, and
    straight stripe domains that happen to lie along the fast-scan axis at one
    orientation are erased there but not in the 0 deg frame. Enable it only if
    scan-line offset jumps defeat the registration.
    """
    rows, cols = np.indices(img.shape)
    design = np.column_stack([np.ones(img.size), rows.ravel(), cols.ravel()])
    coef, *_ = np.linalg.lstsq(design, img.ravel(), rcond=None)
    out = img - (design @ coef).reshape(img.shape)
    out = out - ndimage.gaussian_filter(out, max(img.shape) / 16, mode="nearest")
    if line_flatten:
        out = out - np.median(out, axis=1, keepdims=True)
    std = out.std()
    if std == 0:
        raise ARPFMError("Registration channel is flat; choose another channel")
    return (out - out.mean()) / std


def rotate(img: np.ndarray, angle_deg: float) -> np.ndarray:
    """Rotate about the image centre (CCW positive in display); NaN outside."""
    return ndimage.rotate(
        img, angle_deg, reshape=False, order=1, mode="constant", cval=np.nan
    )


def shift(img: np.ndarray, dyx: tuple[float, float]) -> np.ndarray:
    """Sub-pixel translation with NaN fill."""
    return ndimage.shift(img, dyx, order=1, mode="constant", cval=np.nan)


def _disc_window(shape: tuple[int, int], frac: float = 0.42) -> np.ndarray:
    """Rotation-invariant apodisation: flat disc with a cosine edge, 0 outside.

    Keeps the NaN corners of a rotated frame (and their straight edges, which
    otherwise dominate the whitened cross-power spectrum) out of the estimate.
    """
    rows, cols = np.indices(shape)
    r = np.hypot(rows - (shape[0] - 1) / 2, cols - (shape[1] - 1) / 2) / min(shape)
    edge = 0.06
    t = np.clip((r - (frac - edge)) / edge, 0.0, 1.0)
    return 0.5 + 0.5 * np.cos(np.pi * t)


def _phase_corr(ref: np.ndarray, mov: np.ndarray) -> tuple[float, float]:
    """Translation (dy, dx) that maps ``mov`` onto ``ref`` (NaN treated as 0)."""
    win = _disc_window(ref.shape)
    fa = np.fft.fft2(np.nan_to_num(ref) * win)
    fb = np.fft.fft2(np.nan_to_num(mov) * win)
    cross = fa * np.conj(fb)
    corr = np.fft.ifft2(cross / (np.abs(cross) + 1e-12)).real
    peak = np.unravel_index(np.argmax(corr), corr.shape)
    out = []
    for axis, p in enumerate(peak):
        n = corr.shape[axis]
        idx_m = list(peak)
        idx_p = list(peak)
        idx_m[axis] = (p - 1) % n
        idx_p[axis] = (p + 1) % n
        c0, cm, cp = corr[peak], corr[tuple(idx_m)], corr[tuple(idx_p)]
        denom = cm - 2 * c0 + cp
        frac = 0.5 * (cm - cp) / denom if denom != 0 else 0.0
        val = p + frac
        out.append(val - n if val > n / 2 else val)
    return out[0], out[1]


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    """Normalised cross-correlation over the pixels valid in both images."""
    valid = np.isfinite(a) & np.isfinite(b)
    if valid.sum() < 0.2 * a.size:
        return -1.0
    x, y = a[valid] - a[valid].mean(), b[valid] - b[valid].mean()
    return float((x * y).sum() / np.sqrt((x * x).sum() * (y * y).sum()))


@dataclass
class Transform:
    """Rotation (deg, applied first) and translation (dy, dx) back to 0 deg frame."""

    rotation_deg: float
    dyx: tuple[float, float]
    ncc: float

    def apply(self, img: np.ndarray) -> np.ndarray:
        """Map an image acquired at this orientation onto the reference frame."""
        return shift(rotate(img, self.rotation_deg), self.dyx)


def register(
    ref: np.ndarray, mov: np.ndarray, nominal_deg: float, max_dev_deg: float,
    quiet: bool = False,
) -> Transform:
    """Find rotation near -nominal and translation mapping ``mov`` onto ``ref``."""

    def evaluate(rot: float) -> Transform:
        r = rotate(mov, rot)
        dyx = _phase_corr(ref, r)
        return Transform(rot, dyx, _ncc(ref, shift(r, dyx)))

    base = -nominal_deg
    coarse = [evaluate(base + d) for d in np.arange(-max_dev_deg, max_dev_deg + 1e-9, 0.5)]
    best = max(coarse, key=lambda t: t.ncc)
    fine = [evaluate(best.rotation_deg + d) for d in np.arange(-0.5, 0.5 + 1e-9, 0.1)]
    best = max(fine, key=lambda t: t.ncc)

    # Joint sub-pixel / sub-0.1 deg refinement of (rotation, dy, dx) on NCC.
    def cost(p: np.ndarray) -> float:
        return -_ncc(ref, shift(rotate(mov, p[0]), (p[1], p[2])))

    res = optimize.minimize(
        cost, np.array([best.rotation_deg, *best.dyx]), method="Nelder-Mead",
        options={"xatol": 0.01, "fatol": 1e-5, "initial_simplex": np.array([
            [best.rotation_deg, *best.dyx],
            [best.rotation_deg + 0.1, *best.dyx],
            [best.rotation_deg, best.dyx[0] + 0.5, best.dyx[1]],
            [best.rotation_deg, best.dyx[0], best.dyx[1] + 0.5],
        ])},
    )
    if -res.fun > best.ncc:
        best = Transform(float(res.x[0]), (float(res.x[1]), float(res.x[2])), float(-res.fun))
    if abs(best.rotation_deg - base) > max_dev_deg - 0.25 and not quiet:
        LOG.warning(
            "Best rotation %.2f deg is at the edge of the search window around "
            "%.1f deg; increase --max-angle-dev or check the nominal angle",
            -best.rotation_deg, nominal_deg,
        )
    return best


# --------------------------------------------------------------------- fitting
@dataclass
class HarmonicFit:
    """Per-pixel first-harmonic fit results (1-D arrays over valid pixels)."""

    a: np.ndarray
    b: np.ndarray
    c: np.ndarray
    r2: np.ndarray
    resid_rms: np.ndarray
    gains: np.ndarray
    h2_ratio: np.ndarray | None

    @property
    def magnitude(self) -> np.ndarray:
        """In-plane response magnitude (signal units)."""
        return np.hypot(self.a, self.b)

    @property
    def psi_raw_deg(self) -> np.ndarray:
        """Uncalibrated in-plane angle, deg in (-180, 180]."""
        return np.rad2deg(np.arctan2(-self.b, self.a))


def fit_harmonic(
    stack: np.ndarray, theta_deg: np.ndarray, fit_gains: bool, n_iter: int = 30
) -> HarmonicFit:
    """Fit s_k = g_k (a cos t_k + b sin t_k) + c to a (K, P) stack.

    With ``fit_gains`` a per-orientation gain g_k (geometric mean 1) is estimated
    by alternating least squares, absorbing remount-to-remount sensitivity changes.
    The unrotated 0 deg frame escapes interpolation, so its gain can read a few
    per cent high for sharp domain walls sampled with few pixels.
    """
    k_n = stack.shape[0]
    if k_n < 3:
        raise ARPFMError("At least three distinct orientations are required")
    th = np.deg2rad(theta_deg)
    gains = np.ones(k_n)
    for _ in range(n_iter if fit_gains else 1):
        design = np.column_stack([gains * np.cos(th), gains * np.sin(th), np.ones(k_n)])
        coef, *_ = np.linalg.lstsq(design, stack, rcond=None)
        if not fit_gains:
            break
        model = np.outer(np.cos(th), coef[0]) + np.outer(np.sin(th), coef[1])
        new = np.ones(k_n)
        for k in range(k_n):
            denom = np.sum(model[k] ** 2)
            if denom < 1e-3 * np.mean(np.sum(model**2, axis=1)):
                LOG.warning(
                    "Gain at %.1f deg is unconstrained (in-plane vectors nearly "
                    "orthogonal to the sensitivity axis); fixed at 1", theta_deg[k]
                )
                continue
            new[k] = np.sum((stack[k] - coef[2]) * model[k]) / denom
        if np.any(new <= 0):
            raise ARPFMError(
                f"Negative/zero gain at {theta_deg[new <= 0]} deg: the lock-in phase "
                "reference flipped between remounts (Center Phase pressed?) or the "
                "angle list is wrong. Fix the phase, do not fit through it."
            )
        new /= np.exp(np.mean(np.log(new)))  # geometric mean 1: no frame privileged
        if np.max(np.abs(new - gains)) < 1e-5:
            gains = new
            break
        gains = new
    design = np.column_stack([gains * np.cos(th), gains * np.sin(th), np.ones(k_n)])
    coef, *_ = np.linalg.lstsq(design, stack, rcond=None)
    pred = design @ coef
    ss_res = np.sum((stack - pred) ** 2, axis=0)
    ss_tot = np.sum((stack - stack.mean(axis=0)) ** 2, axis=0)
    dof = max(k_n - 3, 1)  # gains are shared by all pixels; negligible per pixel
    r2 =1 - ss_res / np.where(ss_tot > 0, ss_tot, np.nan)

    h2 = None
    if k_n >= 6:
        d2 = np.column_stack([design, np.cos(2 * th), np.sin(2 * th)])
        coef2, *_ = np.linalg.lstsq(d2, stack, rcond=None)
        h2 = np.hypot(coef2[3], coef2[4]) / np.maximum(np.hypot(coef2[0], coef2[1]), 1e-30)
    return HarmonicFit(coef[0], coef[1], coef[2], r2, np.sqrt(ss_res / dof), gains, h2)


def wrap_deg(x: np.ndarray | float) -> np.ndarray | float:
    """Wrap angles to (-180, 180]."""
    return -((-np.asarray(x) + 180.0) % 360.0 - 180.0)


def circular_mode(angles_deg: np.ndarray, weights: np.ndarray | None = None) -> float:
    """Mode of a circular distribution from a 5-deg weighted histogram."""
    hist, edges = np.histogram(wrap_deg(angles_deg), bins=72, range=(-180, 180), weights=weights)
    hist = ndimage.uniform_filter1d(hist.astype(float), 3, mode="wrap")
    i = int(np.argmax(hist))
    return float(0.5 * (edges[i] + edges[i + 1]))


# ------------------------------------------------------------------ pipeline
@dataclass
class Options:
    """Channel names and analysis settings for ``run``."""

    lat_amp: str
    lat_phase: str
    vert_amp: str | None
    vert_phase: str | None
    height: str
    lat_phase_ref: float | None
    vert_phase_ref: float | None
    handedness: int
    angle_offset: float
    fit_gains: bool
    max_angle_dev: float
    signal_floor: float
    line_flatten: bool = False
    angle_sign: int = 0  # 0 = auto-detect, +1 / -1 forced


def read_manifest(path: Path) -> pd.DataFrame:
    """Read and validate the acquisition manifest."""
    df = pd.read_csv(path, dtype={"lpfm_file": str, "vpfm_file": str, "role": str})
    missing = {"angle_deg", "lpfm_file"} - set(df.columns)
    if missing:
        raise ARPFMError(f"Manifest lacks columns {missing}")
    if "role" not in df.columns:
        df["role"] = "fit"
    df["role"] = df["role"].fillna("fit").str.strip().str.lower()
    bad = set(df["role"]) - {"fit", "closure"}
    if bad:
        raise ARPFMError(f"Unknown role(s) {bad}; use 'fit' or 'closure'")
    if "vpfm_file" not in df.columns:
        df["vpfm_file"] = ""
    df["vpfm_file"] = df["vpfm_file"].fillna("").str.strip()
    fit = df[df["role"] == "fit"]
    mod = np.round(np.mod(fit["angle_deg"].to_numpy(float), 360.0), 3)
    if len(set(mod)) != len(mod):
        raise ARPFMError("Duplicate fit orientations (mod 360); mark repeats as 'closure'")
    if len(fit) < 3:
        raise ARPFMError("Need >= 3 fit orientations")
    if len(fit) < 4:
        LOG.warning("Only 3 orientations: no residual degrees of freedom for QC")
    if not np.isclose(fit["angle_deg"].iloc[0] % 360, 0):
        raise ARPFMError("First fit row must be the 0 deg reference orientation")
    base = path.parent
    df["lpfm_path"] = [base / p for p in df["lpfm_file"]]
    df["vpfm_path"] = [base / p if p else None for p in df["vpfm_file"]]
    return df


def run(manifest: Path, out: Path, opt: Options) -> dict:
    """Full reconstruction; writes maps, per-angle table, QC JSON and a figure."""
    out.mkdir(parents=True, exist_ok=True)
    df = read_manifest(manifest)
    lat_scans = [load_scan(p) for p in df["lpfm_path"]]
    vert_scans: list[ScanFile | None] = []
    for row, lat in zip(df.itertuples(), lat_scans):
        if row.vpfm_path is not None:
            vert_scans.append(load_scan(row.vpfm_path))
        elif opt.vert_amp and opt.vert_amp in lat.channels and opt.vert_amp != opt.lat_amp:
            vert_scans.append(lat)  # simultaneous V + L acquisition
        else:
            vert_scans.append(None)
    use_vert = opt.vert_amp is not None and all(v is not None for v in vert_scans)
    if opt.vert_amp is not None and not use_vert:
        raise ARPFMError("VPFM channels requested but missing for some orientations")
    check_consistency(lat_scans + ([v for v in vert_scans if v] if use_vert else []))

    # Lock-in projection with one phase reference per detection channel.
    z_lat = [complex_signal(s.get(opt.lat_amp), s.get(opt.lat_phase)) for s in lat_scans]
    lat_ref = opt.lat_phase_ref
    if lat_ref is None:
        lat_ref = estimate_phase_ref(z_lat)
        LOG.warning(
            "LPFM phase reference auto-estimated as %.1f deg (180 deg ambiguous). "
            "Absolute psi needs --lat-phase-ref from the reference sample.", lat_ref
        )
    z_vert: list[np.ndarray] = []
    vert_ref = opt.vert_phase_ref
    if use_vert:
        z_vert = [complex_signal(s.get(opt.vert_amp), s.get(opt.vert_phase)) for s in vert_scans]
        if vert_ref is None:
            vert_ref = estimate_phase_ref(z_vert)
            LOG.warning("VPFM phase reference auto-estimated as %.1f deg", vert_ref)

    # Registration on the Height channel of every file against the 0 deg LPFM file.
    ref_h = level_height(lat_scans[0].get(opt.height), opt.line_flatten)
    sign = detect_angle_sign(df, lat_scans, ref_h, opt)
    records = []
    lat_x, lat_y, vert_x = [], [], []
    for i, row in enumerate(df.itertuples()):
        nominal = sign * float(row.angle_deg)
        t_lat = register(
            ref_h, level_height(lat_scans[i].get(opt.height), opt.line_flatten),
            nominal, opt.max_angle_dev,
        )
        x, y = project(z_lat[i], lat_ref)
        lat_x.append(t_lat.apply(x))
        lat_y.append(t_lat.apply(y))
        rec = {
            "angle_nominal_deg": nominal,
            "role": row.role,
            "angle_measured_deg": -t_lat.rotation_deg,
            "dy_px": t_lat.dyx[0],
            "dx_px": t_lat.dyx[1],
            "ncc_lpfm": t_lat.ncc,
            "lpfm_Y_over_X_rms": float(np.sqrt(np.mean(y**2) / np.mean(x**2))),
        }
        rec.update(trace_retrace_check(lat_scans[i], opt, lat_ref))
        if use_vert:
            vs = vert_scans[i]
            t_v = t_lat if vs is lat_scans[i] else register(
                ref_h, level_height(vs.get(opt.height), opt.line_flatten), nominal, opt.max_angle_dev
            )
            vx, _ = project(z_vert[i], vert_ref)
            vert_x.append(t_v.apply(vx))
            rec["ncc_vpfm"] = t_v.ncc
            rec["angle_measured_vpfm_deg"] = -t_v.rotation_deg
        records.append(rec)
        LOG.info(
            "%6.1f deg (%s): measured %.2f deg, shift (%.1f, %.1f) px, NCC %.3f",
            nominal, row.role, rec["angle_measured_deg"], *t_lat.dyx, t_lat.ncc,
        )
    per_angle = pd.DataFrame(records)
    per_angle.to_csv(out / "ar_pfm_per_angle.csv", index=False)
    if per_angle["ncc_lpfm"].min() < 0.5:
        LOG.warning("Registration NCC < 0.5 for some orientations; inspect before trusting maps")

    fit_idx = np.flatnonzero((df["role"] == "fit").to_numpy())
    all_maps = lat_x + vert_x
    mask = np.all([np.isfinite(m) for m in all_maps], axis=0)
    mask = ndimage.binary_erosion(mask, iterations=2)
    if mask.sum() < 100:
        raise ARPFMError("Common valid area < 100 px: scan size too small for the rotations")
    theta = per_angle["angle_measured_deg"].to_numpy()[fit_idx]

    lat_stack = np.stack([lat_x[i][mask] for i in fit_idx])
    lat_fit = fit_harmonic(lat_stack, theta, opt.fit_gains)
    psi_raw = lat_fit.psi_raw_deg
    psi = wrap_deg(opt.handedness * psi_raw + opt.angle_offset)
    noise = lat_fit.resid_rms
    sigma_psi = np.rad2deg(noise / np.maximum(lat_fit.magnitude, 1e-30) * np.sqrt(2 / len(fit_idx)))
    strong = lat_fit.magnitude > opt.signal_floor * np.median(noise)

    def to_map(v: np.ndarray) -> np.ndarray:
        m = np.full(mask.shape, np.nan)
        m[mask] = v
        return m

    maps = {
        "mask": mask,
        "lat_magnitude": to_map(lat_fit.magnitude),
        "psi_raw_deg": to_map(psi_raw),
        "psi_deg": to_map(psi),
        "sigma_psi_deg": to_map(sigma_psi),
        "lat_offset_c": to_map(lat_fit.c),
        "lat_r2": to_map(lat_fit.r2),
        "strong": to_map(strong.astype(float)),
        "height_ref": np.where(mask, lat_scans[0].get(opt.height), np.nan),
        "theta_measured_deg": theta,
        "lat_gains": lat_fit.gains,
    }
    if lat_fit.h2_ratio is not None:
        maps["lat_h2_ratio"] = to_map(lat_fit.h2_ratio)

    qc: dict = {
        "angle_sign": sign,
        "n_orientations": int(len(fit_idx)),
        "lat_phase_ref_deg": lat_ref,
        "valid_pixels": int(mask.sum()),
        "strong_fraction": float(strong.mean()),
        "median_r2_strong": float(np.nanmedian(lat_fit.r2[strong])) if strong.any() else None,
        "median_sigma_psi_deg_strong": float(np.median(sigma_psi[strong])) if strong.any() else None,
        "lat_gains": dict(zip(map(float, theta), map(float, lat_fit.gains))),
        "offset_c_corr_with_vpfm": None,
    }
    if lat_fit.h2_ratio is not None and strong.any():
        qc["median_h2_ratio_strong"] = float(np.median(lat_fit.h2_ratio[strong]))

    if use_vert:
        v_stack = np.stack([vert_x[i][mask] for i in fit_idx])
        v_fit = fit_harmonic(v_stack, theta, fit_gains=False)
        delta = wrap_deg(v_fit.psi_raw_deg - psi_raw)
        maps.update(
            vert_offset_c=to_map(v_fit.c),
            vert_h1_magnitude=to_map(v_fit.magnitude),
            delta_vl_deg=to_map(delta),
            vert_ref_x=vert_x[0],
        )
        both = strong & (v_fit.magnitude > opt.signal_floor * np.median(v_fit.resid_rms))
        qc["vpfm_phase_ref_deg"] = vert_ref
        if both.sum() > 50:
            mode = circular_mode(delta[both], lat_fit.magnitude[both])
            qc["delta_vl_mode_deg"] = mode
            qc["delta_vl_within_25deg_of_mode"] = float(np.mean(np.abs(wrap_deg(delta[both] - mode)) < 25))
            qc["delta_vl_interpretation"] = (
                "buckling-consistent (~ +/-90 deg)" if abs(abs(mode) - 90) < 25
                else "NOT buckling-like: suspect lateral->vertical optical crosstalk"
            )
        else:
            qc["delta_vl_mode_deg"] = None
        c_v = v_fit.c
        qc["offset_c_corr_with_vpfm"] = float(np.corrcoef(lat_fit.c, c_v)[0, 1])

    closure_idx = np.flatnonzero((df["role"] == "closure").to_numpy())
    qc["closure"] = []
    for i in closure_idx:
        ref0 = lat_x[fit_idx[0]][mask]
        rep = lat_x[i][mask]
        slope = float(np.sum(ref0 * rep) / np.sum(ref0 * ref0))
        qc["closure"].append(
            {"angle_deg": float(df["angle_deg"].iloc[i]), "slope": slope,
             "pearson_r": float(np.corrcoef(ref0, rep)[0, 1])}
        )

    np.savez_compressed(out / "ar_pfm_maps.npz", **maps)
    (out / "ar_pfm_qc.json").write_text(json.dumps(qc, indent=2))
    plot_summary(maps, qc, out / "ar_pfm_summary.png")
    return qc


def detect_angle_sign(df: pd.DataFrame, scans: list[ScanFile], ref_h: np.ndarray,
                      opt: Options) -> int:
    """Return +1 if the image array rotates with the manifest sense, -1 if mirrored.

    Tries both signs at the first orientation that is not 0 or 180 deg.
    """
    if opt.angle_sign in (-1, 1):
        return opt.angle_sign
    angles = df["angle_deg"].to_numpy(float)
    cand = [i for i, a in enumerate(angles) if not np.isclose(np.mod(a, 180.0), 0.0)]
    if not cand:
        LOG.info("All orientations are 0/180 deg: angle sign irrelevant, using +1")
        return 1
    i = cand[0]
    mov = level_height(scans[i].get(opt.height), opt.line_flatten)
    scores = {s: register(ref_h, mov, s * angles[i], opt.max_angle_dev, quiet=True).ncc
              for s in (1, -1)}
    sign = max(scores, key=scores.get)
    if abs(scores[1] - scores[-1]) < 0.05:
        LOG.warning("Angle sign ambiguous at %.0f deg (NCC +: %.3f, -: %.3f); featureless "
                    "registration channel? Using %+d", angles[i], scores[1], scores[-1], sign)
    else:
        LOG.info("Angle sign %+d (NCC +: %.3f, -: %.3f)%s", sign, scores[1], scores[-1],
                 "; image array mirrored relative to the physical rotation sense"
                 if sign < 0 else "")
    return sign


def trace_retrace_check(scan: ScanFile, opt: Options, phase_ref: float) -> dict:
    """Normalised LPFM trace/retrace difference, if both directions were saved."""
    if not opt.lat_amp.endswith("Retrace"):
        return {}
    amp_t = opt.lat_amp[: -len("Retrace")] + "Trace"
    ph_t = opt.lat_phase[: -len("Retrace")] + "Trace" if opt.lat_phase.endswith("Retrace") else None
    if amp_t not in scan.channels or ph_t not in scan.channels:
        return {}
    xr, _ = project(complex_signal(scan.get(opt.lat_amp), scan.get(opt.lat_phase)), phase_ref)
    xt, _ = project(complex_signal(scan.get(amp_t), scan.get(ph_t)), phase_ref)
    return {"lpfm_trace_retrace_rel_diff": float(np.linalg.norm(xt - xr) / np.linalg.norm(xr))}


# --------------------------------------------------------------------- figure
def plot_summary(maps: dict, qc: dict, path: Path) -> None:
    """Six-panel summary: height, |L|, psi (brightness = |L|), c, R^2, histogram."""
    fig, axes = plt.subplots(2, 3, figsize=(13, 8.2), constrained_layout=True)
    mag = maps["lat_magnitude"]
    vmax = np.nanpercentile(mag, 99)
    panels = [
        ("Height (0° frame)", maps["height_ref"], "gray", None),
        ("In-plane magnitude |L| (signal units)", mag, "Blues", (0, vmax)),
        ("Rotation-invariant background c", maps["lat_offset_c"], "RdBu_r", "sym"),
        ("Fit R² (first harmonic)", maps["lat_r2"], "Greys_r", (0, 1)),
    ]
    order = [(0, 0), (0, 1), (1, 0), (1, 1)]
    for (title, img, cmap, lim), (r, c) in zip(panels, order):
        ax = axes[r, c]
        if lim == "sym":
            v = np.nanpercentile(np.abs(img), 99)
            lim = (-v, v)
        kw = {"vmin": lim[0], "vmax": lim[1]} if lim else {}
        im = ax.imshow(img, cmap=cmap, **kw)
        ax.set_title(title, fontsize=10)
        ax.set_axis_off()
        fig.colorbar(im, ax=ax, shrink=0.8)

    ax = axes[0, 2]
    hsv = plt.get_cmap("hsv")((np.nan_to_num(maps["psi_deg"]) % 360) / 360)
    bright = np.clip(np.nan_to_num(mag) / vmax, 0, 1)
    rgb = hsv[..., :3] * bright[..., None]
    rgb[~maps["mask"]] = 1.0
    ax.imshow(rgb)
    ax.set_title("In-plane angle ψ (hue), |L| (brightness)", fontsize=10)
    ax.set_axis_off()
    inset = ax.inset_axes([0.78, 0.78, 0.2, 0.2], projection="polar")
    t = np.linspace(0, 2 * np.pi, 361)
    inset.scatter(t, np.ones_like(t), c=plt.get_cmap("hsv")(t / (2 * np.pi)), s=6)
    inset.set_axis_off()

    ax = axes[1, 2]
    strong = maps["strong"] > 0.5
    psi = maps["psi_deg"][strong]
    ax.hist(psi, bins=72, range=(-180, 180), weights=mag[strong], color="#3d6fb6")
    ax.set_xlabel("ψ (deg), weighted by |L|")
    ax.set_xticks(range(-180, 181, 45))
    ax.set_yticks([])
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.set_title(
        f"N = {qc['n_orientations']} orientations; median R² = "
        f"{qc['median_r2_strong']:.2f}" if qc["median_r2_strong"] is not None
        else "No pixels above signal floor", fontsize=10,
    )
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ----------------------------------------------------------------- calibration
def calibrate(maps_path: Path, rois: list[tuple[int, int, int, int]], psi_true: list[float],
              handedness: int | None) -> dict:
    """Handedness and offset from reference ROIs (row0, row1, col0, col1) of known psi."""
    with np.load(maps_path) as m:
        psi_raw, mag = m["psi_raw_deg"], m["lat_magnitude"]
    raw = []
    for (r0, r1, c0, c1) in rois:
        p = psi_raw[r0:r1, c0:c1].ravel()
        w = mag[r0:r1, c0:c1].ravel()
        ok = np.isfinite(p) & np.isfinite(w)
        if ok.sum() < 20:
            raise ARPFMError(f"ROI {(r0, r1, c0, c1)} has < 20 valid pixels")
        z = np.sum(w[ok] * np.exp(1j * np.deg2rad(p[ok])))
        spread = 1 - np.abs(z) / np.sum(w[ok])
        if spread > 0.3:
            LOG.warning("ROI %s angular spread high (1-R = %.2f); not a single domain?", (r0, r1, c0, c1), spread)
        raw.append(float(np.rad2deg(np.angle(z))))
    if len(rois) >= 2:
        d_raw = wrap_deg(raw[1] - raw[0])
        d_true = wrap_deg(psi_true[1] - psi_true[0])
        if min(abs(d_true), 180 - abs(d_true)) < 30:
            raise ARPFMError("Reference directions must be non-collinear (differ by 30-150 deg)")
        h = 1 if np.sign(d_raw) == np.sign(d_true) else -1
        if abs(abs(d_raw) - abs(d_true)) > 25:
            raise ARPFMError(
                f"ROI angle difference {d_raw:.1f} deg vs expected {d_true:.1f} deg: "
                "inconsistent reference or bad reconstruction"
            )
        if handedness is not None and handedness != h:
            LOG.warning("Supplied handedness %d contradicts ROIs (%d); using ROIs", handedness, h)
    else:
        if handedness is None:
            raise ARPFMError("One ROI fixes only the offset: supply --handedness")
        h = handedness
    offsets = [wrap_deg(t - h * r) for t, r in zip(psi_true, raw)]
    offset = float(np.rad2deg(np.angle(np.mean(np.exp(1j * np.deg2rad(offsets))))))
    return {"handedness": h, "angle_offset_deg": offset, "roi_psi_raw_deg": raw,
            "per_roi_offsets_deg": [float(o) for o in offsets]}


# -------------------------------------------------------------------- selftest
def _write_fake_nanoscope(path: Path, images: dict[str, tuple[np.ndarray, str, str]],
                          scan: dict[str, str]) -> None:
    """Write a minimal NanoScope-format file (self-test only; int32 Retrace layers).

    ``images`` maps channel name -> (array in display orientation, soft-scale key,
    soft-scale unit). Mirrors the layout parsed by :func:`load_nanoscope`.
    """
    n_lines, n_samps = next(iter(images.values()))[0].shape
    data_offset, block = 40960, n_lines * n_samps * 4
    head = ["\\*File list", "\\Version: 0x09400202", f"\\Data length: {data_offset}",
            "\\*Ciao scan list"] + [f"\\{k}: {v}" for k, v in scan.items()] + ["\\*Scanner list"]
    blobs, layers = [], []
    for i, (name, (img, soft_key, unit)) in enumerate(images.items()):
        full = max(4.0 * float(np.max(np.abs(img))), 1e-6)
        head.append(f"\\@{soft_key}: V 1.000000 {unit}/V")
        raw = np.round(np.flipud(img) / (full / 2**32)).astype("<i4")
        blobs.append(raw.tobytes())
        layers += ["\\*Ciao image list", f"\\Data offset: {data_offset + i * block}",
                   f"\\Data length: {block}", "\\Bytes/pixel: 4", f"\\Samps/line: {n_samps}",
                   f"\\Number of lines: {n_lines}", "\\Line Direction: Retrace",
                   f'\\@2:Image Data: S [{name.split()[0]}] "{name}"',
                   f"\\@2:Z scale: V [{soft_key}] ({full / 2**32:.9g} V/LSB) {full:.9g} V"]
    text = "\r\n".join(head + layers + ["\\*File list end"]) + "\r\n"
    header = text.encode("latin-1")
    if len(header) > data_offset:
        raise ARPFMError("self-test header too long")
    path.write_bytes(header + b"\0" * (data_offset - len(header)) + b"".join(blobs))


def _selftest_case(out: Path, fmt: str, mirror: bool, seed: int) -> bool:
    """One synthetic 8-orientation series with known psi; checks recovery."""
    rng = np.random.default_rng(seed)
    out.mkdir(parents=True, exist_ok=True)
    n, big = 160, 240
    yy, xx = np.mgrid[0:big, 0:big]
    # Four in-plane variants in a two-level stripe/checker pattern.
    variant = ((xx + yy) // 30 % 2) * 2 + ((xx - yy + big) // 45 % 2)
    psi_true_big = np.array([45.0, 135.0, 225.0, 315.0])[variant]
    uz_big = np.where((xx // 40) % 2 == 0, 1.0, -1.0)
    topo_big = ndimage.gaussian_filter(rng.normal(size=(big, big)), 4) * 5
    topo_big += 0.3 * (variant - 1.5)
    phi_inst_l, phi_inst_v = 37.0, -12.0
    s_l, beta, alpha = 1.0, 0.25, 0.05
    angles = [0, 45, 90, 135, 180, 225, 270, 315, 360]
    rows = []
    truth_rot, truth_gain = {}, {}
    crop = slice((big - n) // 2, (big + n) // 2)
    store = np.fliplr if mirror else (lambda a: a)  # mirrored image array vs physical frame
    for ang in angles:
        err = 0.0 if ang == 0 else rng.uniform(-1.5, 1.5)
        rot = ang + err
        gain = 1.0 if ang in (0, 360) else rng.uniform(0.9, 1.1)
        dyx = (0.0, 0.0) if ang == 0 else tuple(rng.uniform(-5, 5, 2))
        truth_rot[ang], truth_gain[ang] = rot, gain

        def lab(img: np.ndarray, order: int = 1) -> np.ndarray:
            r = ndimage.rotate(img, rot, reshape=False, order=order, mode="nearest")
            return ndimage.shift(r, dyx, order=order, mode="nearest")[crop, crop]

        psi_lab = lab(psi_true_big, order=0) + rot  # vectors rotate with the sample
        uz = lab(uz_big, order=0)
        topo = lab(topo_big) + rng.normal(scale=0.05, size=(n, n))
        lat = gain * s_l * np.cos(np.deg2rad(psi_lab - 90.0)) + alpha * uz  # axis along +y
        vert = uz + beta * np.cos(np.deg2rad(psi_lab - 0.0))  # buckling along lever (+x)
        noise = lambda: rng.normal(scale=0.03, size=(n, n)) + 1j * rng.normal(scale=0.03, size=(n, n))  # noqa: E731
        zl = lat * np.exp(1j * np.deg2rad(phi_inst_l)) + noise()
        zv = vert * np.exp(1j * np.deg2rad(phi_inst_v)) + noise()
        maps = {"h": store(topo), "la": store(np.abs(zl)), "lp": store(np.rad2deg(np.angle(zl))),
                "va": store(np.abs(zv)), "vp": store(np.rad2deg(np.angle(zv)))}
        if fmt == "npz":
            name = f"synthetic_A{ang:03d}.npz"
            note = json.dumps({"ScanSize": "5e-06", "ScanPoints": str(n), "ScanLines": str(n),
                               "ScanAngle": "90", "DriveFrequency": "50000"})
            np.savez(out / name, HeightRetrace=maps["h"], AmplitudeRetrace=maps["la"],
                     PhaseRetrace=maps["lp"], VAmplitudeRetrace=maps["va"],
                     VPhaseRetrace=maps["vp"], __note__=np.array(note))
        else:
            name = f"synthetic_A{ang:03d}.spm"
            _write_fake_nanoscope(out / name, {
                "Height Sensor": (maps["h"], "Sens. ZsensSens", "nm"),
                "Amplitude": (maps["va"], "Sens. Amplitude", "mV"),
                "Phase": (maps["vp"], "Sens. Phase", "\u00ba"),
                "Amplitude 2": (maps["la"], "Sens. Amplitude2", "mV"),
                "Phase 2": (maps["lp"], "Sens. Phase2", "\u00ba"),
            }, {"Scan Size": "5 5 ~m", "Rotate Ang.": "90", "Scan Rate": "0.5003"})
        rows.append({"angle_deg": ang, "lpfm_file": name, "vpfm_file": "",
                     "role": "closure" if ang == 360 else "fit"})
    pd.DataFrame(rows).to_csv(out / "manifest.csv", index=False)

    names = (("AmplitudeRetrace", "PhaseRetrace", "VAmplitudeRetrace", "VPhaseRetrace",
              "HeightRetrace") if fmt == "npz" else
             ("Amplitude 2 Retrace", "Phase 2 Retrace", "Amplitude Retrace", "Phase Retrace",
              "Height Sensor Retrace"))
    # Mirroring x maps psi -> 180 - psi, so the physical frame needs h = -1 (offset unchanged).
    opt = Options(*names, phi_inst_l, phi_inst_v, handedness=-1 if mirror else 1,
                  angle_offset=90.0, fit_gains=True, max_angle_dev=4.0, signal_floor=3.0)
    qc = run(out / "manifest.csv", out / "result", opt)
    with np.load(out / "result" / "ar_pfm_maps.npz") as m:
        psi, mask, theta, gains = m["psi_deg"], m["mask"], m["theta_measured_deg"], m["lat_gains"]
    truth = store(psi_true_big[crop, crop])  # physical psi, stored at array positions
    # Exclude pixels within 3 px of a variant boundary (interpolation mixes vectors).
    edge = ndimage.maximum_filter(truth, 7) != ndimage.minimum_filter(truth, 7)
    sel = mask & ~edge
    err = np.abs(wrap_deg(psi[sel] - truth[sel]))
    expected_sign = -1 if mirror else 1
    rot_err = np.abs(theta - expected_sign * np.array([truth_rot[a] for a in angles[:-1]]))
    g_true = np.array([truth_gain[a] for a in angles[:-1]])
    # Compare interpolated orientations only; normalise both to their geometric mean.
    g_fit, g_ref = gains[1:], g_true[1:]
    gain_err = np.abs(g_fit / np.exp(np.mean(np.log(g_fit))) - g_ref / np.exp(np.mean(np.log(g_ref))))
    checks = {
        "angle sign detected": qc["angle_sign"] == expected_sign,
        "median psi error < 3 deg": float(np.median(err)) < 3,
        "95th pct psi error < 10 deg": float(np.percentile(err, 95)) < 10,
        "rotation error < 0.3 deg": float(rot_err.max()) < 0.3,
        "gain error < 0.03": float(gain_err.max()) < 0.03,
        "delta V-L mode near +/-90": qc.get("delta_vl_mode_deg") is not None
        and abs(abs(qc["delta_vl_mode_deg"]) - 90) < 10,
        "closure slope 0.9-1.1": 0.9 < qc["closure"][0]["slope"] < 1.1,
    }
    LOG.info("[%s%s] psi error median %.2f deg, p95 %.2f deg; max rotation error %.3f deg; "
             "max gain error %.3f", fmt, ", mirrored" if mirror else "", np.median(err),
             np.percentile(err, 95), rot_err.max(), gain_err.max())
    for name, ok in checks.items():
        LOG.info("  %-30s %s", name, "PASS" if ok else "FAIL")
    return all(checks.values())


def selftest(out: Path, seed: int = 1) -> bool:
    """Synthetic end-to-end tests: npz (unmirrored) and NanoScope (mirrored frame)."""
    ok_npz = _selftest_case(out / "npz", "npz", mirror=False, seed=seed)
    ok_ns = _selftest_case(out / "nanoscope", "nanoscope", mirror=True, seed=seed)
    return ok_npz and ok_ns


# ------------------------------------------------------------------------ CLI
def main(argv: list[str] | None = None) -> int:
    """Command-line entry point."""
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("channels", help="list channels and note keys")
    pc.add_argument("file", type=Path)

    pr = sub.add_parser("run", help="reconstruct in-plane maps from a manifest")
    pr.add_argument("manifest", type=Path)
    pr.add_argument("--out", type=Path, default=Path("ar_pfm_out"))
    pr.add_argument("--lat-amp", default="AmplitudeRetrace")
    pr.add_argument("--lat-phase", default="PhaseRetrace")
    pr.add_argument("--vert-amp", default=None)
    pr.add_argument("--vert-phase", default=None)
    pr.add_argument("--height", default="HeightRetrace")
    pr.add_argument("--lat-phase-ref", type=float, default=None, help="deg; from reference sample")
    pr.add_argument("--vert-phase-ref", type=float, default=None)
    pr.add_argument("--handedness", type=int, choices=(-1, 1), default=1)
    pr.add_argument("--angle-offset", type=float, default=0.0, help="deg")
    pr.add_argument("--fit-gains", action="store_true", help="per-orientation gain (ALS)")
    pr.add_argument("--max-angle-dev", type=float, default=4.0, help="deg search window")
    pr.add_argument("--signal-floor", type=float, default=3.0,
                    help="'strong' pixels: |L| > floor x median residual RMS")
    pr.add_argument("--line-flatten", action="store_true",
                    help="line-wise median flatten of Height before registration")
    pr.add_argument("--angle-sign", choices=("auto", "+1", "-1"), default="auto",
                    help="image-array rotation sense relative to the manifest angles")

    pk = sub.add_parser("calibrate", help="handedness/offset from reference ROIs")
    pk.add_argument("maps", type=Path)
    pk.add_argument("--roi", type=int, nargs=4, action="append", required=True,
                    metavar=("ROW0", "ROW1", "COL0", "COL1"))
    pk.add_argument("--psi", type=float, action="append", required=True,
                    help="known in-plane angle (deg) of each ROI, same order")
    pk.add_argument("--handedness", type=int, choices=(-1, 1), default=None)

    ps = sub.add_parser("selftest", help="synthetic end-to-end test")
    ps.add_argument("--out", type=Path, default=Path("ar_pfm_selftest"))

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s: %(message)s")
    try:
        if args.cmd == "channels":
            scan = load_scan(args.file)
            shape = next(iter(scan.channels.values())).shape
            print(f"{args.file.name}: {shape[0]} lines x {shape[1]} points")
            print("Channels:", ", ".join(scan.channels))
            for key in GEOMETRY_KEYS + SOFT_KEYS:
                print(f"  {key}: {scan.note.get(key, '<absent>')}")
        elif args.cmd == "run":
            opt = Options(args.lat_amp, args.lat_phase, args.vert_amp, args.vert_phase,
                          args.height, args.lat_phase_ref, args.vert_phase_ref,
                          args.handedness, args.angle_offset, args.fit_gains,
                          args.max_angle_dev, args.signal_floor, args.line_flatten,
                          0 if args.angle_sign == "auto" else int(args.angle_sign))
            if (opt.vert_amp is None) != (opt.vert_phase is None):
                raise ARPFMError("--vert-amp and --vert-phase must be given together")
            print(json.dumps(run(args.manifest, args.out, opt), indent=2))
        elif args.cmd == "calibrate":
            if len(args.roi) != len(args.psi):
                raise ARPFMError("Give one --psi per --roi")
            print(json.dumps(calibrate(args.maps, [tuple(r) for r in args.roi], args.psi,
                                       args.handedness), indent=2))
        elif args.cmd == "selftest":
            ok = selftest(args.out)
            print("SELFTEST", "PASSED" if ok else "FAILED")
            return 0 if ok else 1
    except ARPFMError as exc:
        LOG.error("%s", exc)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
