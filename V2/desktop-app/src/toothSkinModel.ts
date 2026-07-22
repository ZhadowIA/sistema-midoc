export type OdontogramSkin = "MIDOC" | "ZOLIQUA_MIT";

export type VendorToothTemplate = "11" | "13" | "14" | "16";

export interface VendorToothPlacement {
  template: VendorToothTemplate;
  /**
   * The chart already flips lower teeth vertically. This extra horizontal
   * mirror completes the orientation used by the source templates.
   */
  mirrorWithinArch: boolean;
}

function templateForPosition(position: number): VendorToothTemplate | null {
  if (position === 1 || position === 2) {
    return "11";
  }
  if (position === 3) {
    return "13";
  }
  if (position === 4 || position === 5) {
    return "14";
  }
  if (position >= 6 && position <= 8) {
    return "16";
  }
  return null;
}

/**
 * Maps FDI permanent and primary quadrants onto the four MIT templates.
 * Primary quadrants reuse their permanent counterpart (5→1, …, 8→4), which
 * keeps the spike visual-only and leaves the clinical payload untouched.
 */
export function vendorToothPlacement(toothId: string): VendorToothPlacement | null {
  if (!/^[1-8][1-8]$/.test(toothId)) {
    return null;
  }

  const quadrant = Number(toothId[0]);
  const position = Number(toothId[1]);
  const template = templateForPosition(position);
  if (!template) {
    return null;
  }

  const permanentQuadrant = quadrant > 4 ? quadrant - 4 : quadrant;
  return {
    template,
    // Source orientation: Q1 none, Q2 mirror, Q3 rotate 180, Q4 rotate 180
    // plus mirror. The chart's own lower-arch flip supplies the vertical half.
    mirrorWithinArch: permanentQuadrant === 2 || permanentQuadrant === 3
  };
}
