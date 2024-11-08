import { TestBed } from "@angular/core/testing";
import qrcodeParser from "qrcode-parser";

import { BrowserApi } from "../../../platform/browser/browser-api";

import { BrowserTotpCaptureService } from "./browser-totp-capture.service";

jest.mock("qrcode-parser", () => jest.fn());

const mockQrcodeParser = qrcodeParser as jest.Mock;

describe("BrowserTotpCaptureService", () => {
  let testBed: TestBed;
  let service: BrowserTotpCaptureService;
  let mockCaptureVisibleTab: jest.SpyInstance;

  const validTotpUrl = "otpauth://totp/label?secret=123";

  beforeEach(() => {
    mockCaptureVisibleTab = jest.spyOn(BrowserApi, "captureVisibleTab");
    mockCaptureVisibleTab.mockResolvedValue("screenshot");

    testBed = TestBed.configureTestingModule({
      providers: [BrowserTotpCaptureService],
    });
    service = testBed.inject(BrowserTotpCaptureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should call captureVisibleTab and qrcodeParser when captureTotpSecret is called", async () => {
    mockQrcodeParser.mockResolvedValue({ toString: () => validTotpUrl });

    await service.captureTotpSecret();

    expect(mockCaptureVisibleTab).toHaveBeenCalled();
    expect(mockQrcodeParser).toHaveBeenCalledWith("screenshot");
  });

  it("should return the totpUrl when captureTotpSecret is called", async () => {
    mockQrcodeParser.mockResolvedValue({ toString: () => validTotpUrl });

    const result = await service.captureTotpSecret();

    expect(result).toEqual(validTotpUrl);
  });

  it("should return null when the URL is not the otpauth: protocol", async () => {
    mockQrcodeParser.mockResolvedValue({ toString: () => "https://example.com" });

    const result = await service.captureTotpSecret();

    expect(result).toBeNull();
  });

  it("should return null when the URL is missing the secret parameter", async () => {
    mockQrcodeParser.mockResolvedValue({ toString: () => "otpauth://totp/label" });

    const result = await service.captureTotpSecret();

    expect(result).toBeNull();
  });
});
