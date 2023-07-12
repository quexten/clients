import { MockProxy } from "jest-mock-extended";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { ProtonPassJsonImporter } from "../src/importers";

import { testData } from "./test-data/protonpass-json/protonpass.json";

describe("Protonpass Json Importer", () => {
  let importer: ProtonPassJsonImporter;
  let i18nService: MockProxy<I18nService>;
  beforeEach(() => {
    importer = new ProtonPassJsonImporter(i18nService);
  });

  it("should parse login data", async () => {
    const testDataJson = JSON.stringify(testData);

    const result = await importer.parse(testDataJson);
    expect(result != null).toBe(true);

    const cipher = result.ciphers.shift();
    expect(cipher.name).toEqual("Test Login - Personal Vault");
    expect(cipher.login.username).toEqual("Username");
    expect(cipher.login.password).toEqual("Password");
    expect(cipher.login.uris.length).toEqual(2);
    const uriView = cipher.login.uris.shift();
    expect(uriView.uri).toEqual("https://example.com/");
    expect(cipher.notes).toEqual("My login secure note.");
  });
});
