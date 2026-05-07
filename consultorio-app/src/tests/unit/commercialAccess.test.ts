import assert from "node:assert/strict";
import {
  getEffectiveSubscriptionFeatures,
  resolveCommercialAccess,
} from "../../server/subscription/commercialAccess.ts";
import { runSuite } from "../testHarness.ts";

export async function runCommercialAccessUnitTests() {
  await runSuite("Unit: commercial access", [
    {
      name: "PAST_DUE during grace keeps app access but strips AI",
      run: () => {
        const access = resolveCommercialAccess({
          status: "PAST_DUE",
          currentPeriodEnd: new Date("2030-01-10T00:00:00.000Z"),
          cancelAtPeriodEnd: false,
        }, new Date("2030-01-01T00:00:00.000Z"));

        assert.equal(access.appAccess, true);
        assert.equal(access.aiAccess, false);
        assert.equal(access.hasActiveSubscription, true);

        const effective = getEffectiveSubscriptionFeatures(
          {
            "agenda.enabled": true,
            "clinical.enabled": true,
            "ai.enabled": true,
            "ai.dictation": true,
            "ai.insights": true,
          },
          access,
        );

        assert.equal(effective["agenda.enabled"], true);
        assert.equal(effective["clinical.enabled"], true);
        assert.equal(effective["ai.enabled"], undefined);
        assert.equal(effective["ai.dictation"], undefined);
      },
    },
    {
      name: "PAST_DUE after grace suspends all app access",
      run: () => {
        const access = resolveCommercialAccess({
          status: "PAST_DUE",
          currentPeriodEnd: new Date("2030-01-10T00:00:00.000Z"),
          cancelAtPeriodEnd: false,
        }, new Date("2030-01-20T00:00:00.000Z"));

        assert.equal(access.appAccess, false);
        assert.equal(access.hasActiveSubscription, false);

        const effective = getEffectiveSubscriptionFeatures(
          {
            "agenda.enabled": true,
            "clinical.enabled": true,
          },
          access,
        );

        assert.deepEqual(effective, {});
      },
    },
  ]);
}
