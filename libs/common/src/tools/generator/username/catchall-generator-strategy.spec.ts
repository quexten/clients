import { mock } from "jest-mock-extended";
import { of, firstValueFrom } from "rxjs";

import { PolicyType } from "../../../admin-console/enums";
// FIXME: use index.ts imports once policy abstractions and models
// implement ADR-0002
import { Policy } from "../../../admin-console/models/domain/policy";
import { StateProvider } from "../../../platform/state";
import { UserId } from "../../../types/guid";
import { Randomizer } from "../abstractions/randomizer";
import { DefaultPolicyEvaluator } from "../default-policy-evaluator";
import { CATCHALL_SETTINGS } from "../key-definitions";

import { DefaultCatchallOptions } from "./catchall-generator-options";

import { CatchallGeneratorStrategy } from ".";

const SomeUser = "some user" as UserId;
const SomePolicy = mock<Policy>({
  type: PolicyType.PasswordGenerator,
  data: {
    minLength: 10,
  },
});

describe("Email subaddress list generation strategy", () => {
  describe("toEvaluator()", () => {
    it.each([[[]], [null], [undefined], [[SomePolicy]], [[SomePolicy, SomePolicy]]])(
      "should map any input (= %p) to the default policy evaluator",
      async (policies) => {
        const strategy = new CatchallGeneratorStrategy(null, null);

        const evaluator$ = of(policies).pipe(strategy.toEvaluator());
        const evaluator = await firstValueFrom(evaluator$);

        expect(evaluator).toBeInstanceOf(DefaultPolicyEvaluator);
      },
    );
  });

  describe("durableState", () => {
    it("should use password settings key", () => {
      const provider = mock<StateProvider>();
      const randomizer = mock<Randomizer>();
      const strategy = new CatchallGeneratorStrategy(randomizer, provider);

      strategy.durableState(SomeUser);

      expect(provider.getUser).toHaveBeenCalledWith(SomeUser, CATCHALL_SETTINGS);
    });
  });

  describe("defaults$", () => {
    it("should return the default subaddress options", async () => {
      const strategy = new CatchallGeneratorStrategy(null, null);

      const result = await firstValueFrom(strategy.defaults$(SomeUser));

      expect(result).toEqual(DefaultCatchallOptions);
    });
  });

  describe("policy", () => {
    it("should use password generator policy", () => {
      const randomizer = mock<Randomizer>();
      const strategy = new CatchallGeneratorStrategy(randomizer, null);

      expect(strategy.policy).toBe(PolicyType.PasswordGenerator);
    });
  });

  describe("generate()", () => {
    it.todo("generate catchall email addresses");
  });
});
