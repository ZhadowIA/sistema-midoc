import type { VendorToothTemplate } from "./toothSkinModel.ts";

const VENDOR_TOOTH_ASSETS: Record<VendorToothTemplate, string> = {
  "11": new URL("./assets/vendor/zoliqua-odontogram/11.svg", import.meta.url).href,
  "13": new URL("./assets/vendor/zoliqua-odontogram/13.svg", import.meta.url).href,
  "14": new URL("./assets/vendor/zoliqua-odontogram/14.svg", import.meta.url).href,
  "16": new URL("./assets/vendor/zoliqua-odontogram/16.svg", import.meta.url).href
};

export function vendorToothAsset(template: VendorToothTemplate): string {
  return VENDOR_TOOTH_ASSETS[template];
}
