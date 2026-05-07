import assert from "node:assert/strict";

export async function runInternalAdminCommercialUnitTests() {
  const { test } = await import("node:test");

  const {
    buildManagedCommercialState,
    buildCommercialDiff,
  } = await import("@/server/internal-admin/commercialHelpers");

  test("buildManagedCommercialState disables AI features when there is no add-on", () => {
    const state = buildManagedCommercialState({
      basePlan: "INTEGRAL",
      addOn: null,
    });

    assert.equal(state.features["ai.enabled"], undefined);
    assert.equal(state.features["ai.dictation"], undefined);
    assert.equal(state.features["clinical.enabled"], true);
  });

  test("buildManagedCommercialState applies feature overrides on AI add-on", () => {
    const state = buildManagedCommercialState({
      basePlan: "CLINICAL",
      addOn: "AI_60",
      aiOverrides: {
        "ai.dictation": true,
        "ai.insights": false,
        "ai.questionnaire.text": true,
        "ai.questionnaire.audio": false,
      },
    });

    assert.equal(state.features["ai.enabled"], true);
    assert.equal(state.features["ai.dictation"], true);
    assert.equal(state.features["ai.insights"], undefined);
    assert.equal(state.features["ai.questionnaire.text"], true);
    assert.equal(state.features["ai.questionnaire.audio"], undefined);
  });

  test("buildCommercialDiff reports enabled and disabled feature deltas", () => {
    const diff = buildCommercialDiff(
      {
        basePlan: "CLINICAL",
        addOn: null,
        features: { "clinical.enabled": true, "clinical.notes": true },
      },
      {
        basePlan: "INTEGRAL",
        addOn: "AI_30",
        features: {
          "clinical.enabled": true,
          "clinical.notes": true,
          "agenda.enabled": true,
          "ai.enabled": true,
        },
      },
    );

    assert.equal(diff.planChanged, true);
    assert.equal(diff.addOnChanged, true);
    assert.deepEqual(diff.enabledFeatures, ["agenda.enabled", "ai.enabled"]);
    assert.deepEqual(diff.disabledFeatures, []);
  });
}
