import assert from "node:assert/strict";
import { can, PERMISSIONS } from "@/lib/permissions";

export async function runPermissionsUnitTests() {
  const { test } = await import("node:test");

  test("DOCTOR can manage appointments and read billing but cannot manage billing", () => {
    assert.equal(can("DOCTOR", PERMISSIONS.APPOINTMENT_CREATE), true);
    assert.equal(can("DOCTOR", PERMISSIONS.APPOINTMENT_UPDATE), true);
    assert.equal(can("DOCTOR", PERMISSIONS.BILLING_READ), true);
    assert.equal(can("DOCTOR", PERMISSIONS.BILLING_MANAGE), false);
  });

  test("CLINIC_ADMIN can manage clinic and billing", () => {
    assert.equal(can("CLINIC_ADMIN", PERMISSIONS.CLINIC_MANAGE_DOCTORS), true);
    assert.equal(can("CLINIC_ADMIN", PERMISSIONS.CLINIC_MANAGE_SEATS), true);
    assert.equal(can("CLINIC_ADMIN", PERMISSIONS.BILLING_MANAGE), true);
  });

  test("SECRETARY is restricted to appointment operations", () => {
    assert.equal(can("SECRETARY", PERMISSIONS.APPOINTMENT_CREATE), true);
    assert.equal(can("SECRETARY", PERMISSIONS.SECURITY_INCIDENT_WRITE), false);
    assert.equal(can("SECRETARY", PERMISSIONS.CLINICAL_NOTE_READ), false);
  });

  test("context denies secretary update outside owned resource", () => {
    assert.equal(
      can("SECRETARY", PERMISSIONS.APPOINTMENT_UPDATE, { ownsResource: false }),
      false,
    );
    assert.equal(
      can("SECRETARY", PERMISSIONS.APPOINTMENT_UPDATE, { ownsResource: true }),
      true,
    );
  });

  test("context denies clinic manage permissions outside clinic scope", () => {
    assert.equal(
      can("CLINIC_ADMIN", PERMISSIONS.CLINIC_MANAGE_DOCTORS, { sameClinic: false }),
      false,
    );
    assert.equal(
      can("CLINIC_ADMIN", PERMISSIONS.CLINIC_MANAGE_DOCTORS, { sameClinic: true }),
      true,
    );
  });
}
