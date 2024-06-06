/**
 * include structuredClone in test environment.
 * @jest-environment ../../../../shared/test.environment.ts
 */

import { mock } from "jest-mock-extended";
import { of, firstValueFrom } from "rxjs";

import { PolicyType } from "../../../admin-console/enums";
// FIXME: use index.ts imports once policy abstractions and models
// implement ADR-0002
import { Policy } from "../../../admin-console/models/domain/policy";
import { StateProvider } from "../../../platform/state";
import { UserId } from "../../../types/guid";
import { Randomizer } from "../abstractions/randomizer";
import { PASSWORD_SETTINGS } from "../key-definitions";

import { DisabledPasswordGeneratorPolicy } from "./password-generator-policy";

import {
  DefaultPasswordGenerationOptions,
  PasswordGeneratorOptionsEvaluator,
  PasswordGeneratorStrategy,
} from ".";

const SomeUser = "some user" as UserId;

describe("Password generation strategy", () => {
  describe("toEvaluator()", () => {
    it("should map to a password policy evaluator", async () => {
      const strategy = new PasswordGeneratorStrategy(null, null);
      const policy = mock<Policy>({
        type: PolicyType.PasswordGenerator,
        data: {
          minLength: 10,
          useUpper: true,
          useLower: true,
          useNumbers: true,
          minNumbers: 1,
          useSpecial: true,
          minSpecial: 1,
        },
      });

      const evaluator$ = of([policy]).pipe(strategy.toEvaluator());
      const evaluator = await firstValueFrom(evaluator$);

      expect(evaluator).toBeInstanceOf(PasswordGeneratorOptionsEvaluator);
      expect(evaluator.policy).toMatchObject({
        minLength: 10,
        useUppercase: true,
        useLowercase: true,
        useNumbers: true,
        numberCount: 1,
        useSpecial: true,
        specialCount: 1,
      });
    });

    it.each([[[]], [null], [undefined]])(
      "should map `%p` to a disabled password policy evaluator",
      async (policies) => {
        const strategy = new PasswordGeneratorStrategy(null, null);

        const evaluator$ = of(policies).pipe(strategy.toEvaluator());
        const evaluator = await firstValueFrom(evaluator$);

        expect(evaluator).toBeInstanceOf(PasswordGeneratorOptionsEvaluator);
        expect(evaluator.policy).toMatchObject(DisabledPasswordGeneratorPolicy);
      },
    );
  });

  describe("durableState", () => {
    it("should use password settings key", () => {
      const provider = mock<StateProvider>();
      const randomizer = mock<Randomizer>();
      const strategy = new PasswordGeneratorStrategy(randomizer, provider);

      strategy.durableState(SomeUser);

      expect(provider.getUser).toHaveBeenCalledWith(SomeUser, PASSWORD_SETTINGS);
    });
  });

  describe("defaults$", () => {
    it("should return the default subaddress options", async () => {
      const strategy = new PasswordGeneratorStrategy(null, null);

      const result = await firstValueFrom(strategy.defaults$(SomeUser));

      expect(result).toEqual(DefaultPasswordGenerationOptions);
    });
  });

  describe("policy", () => {
    it("should use password generator policy", () => {
      const randomizer = mock<Randomizer>();
      const strategy = new PasswordGeneratorStrategy(randomizer, null);

      expect(strategy.policy).toBe(PolicyType.PasswordGenerator);
    });
  });

  describe("generate()", () => {
    it.todo("should generate a password using the given options");
  });
});
