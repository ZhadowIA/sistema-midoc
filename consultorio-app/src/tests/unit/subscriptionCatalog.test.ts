import assert from "node:assert/strict"

export async function runSubscriptionCatalogUnitTests() {
  const { test } = await import("node:test")

  const {
    COMMERCIAL_ADD_ONS,
    COMMERCIAL_BASE_PLANS,
    resolveCommercialPlan,
    resolveCommercialPlanFromSubscription,
  } = await import("@/lib/subscriptionCatalog")

  test("resolveCommercialPlan maps Plan Clínico + Add-on IA to expected capabilities", () => {
    const plan = resolveCommercialPlan({
      basePlan: COMMERCIAL_BASE_PLANS.CLINICAL,
      addOns: [COMMERCIAL_ADD_ONS.AI_30],
    })

    assert.equal(plan.basePlan, COMMERCIAL_BASE_PLANS.CLINICAL)
    assert.deepEqual(plan.addOns, [COMMERCIAL_ADD_ONS.AI_30])
    assert.equal(plan.features["clinical.enabled"], true)
    assert.equal(plan.features["agenda.enabled"], undefined)
    assert.equal(plan.features["ai.enabled"], true)
    assert.equal(plan.features["ai.dictation"], true)
    assert.equal(plan.features["ai.questionnaire.text"], true)
    assert.equal(plan.features["ai.questionnaire.audio"], true)
    assert.equal(plan.features["ai.credits.enabled"], true)
    assert.equal(plan.features["subscription.basePlan"], COMMERCIAL_BASE_PLANS.CLINICAL)
  })

  test("resolveCommercialPlanFromSubscription falls back from legacy planName", () => {
    const plan = resolveCommercialPlanFromSubscription({
      planName: "Plan Agenda MiDoc",
      features: {},
    })

    assert.equal(plan.basePlan, COMMERCIAL_BASE_PLANS.AGENDA)
    assert.equal(plan.features["agenda.enabled"], true)
    assert.equal(plan.features["clinical.enabled"], undefined)
  })
}
