import { SystemPortal } from "./system-portal";
import { LogResponseType } from "../constant";
import { request } from "./request";

jest.mock("./request", () => ({
  request: jest.fn(),
}));

const mockRequest = request as jest.MockedFunction<typeof request>;

describe("SystemPortal.logAuditResponse", () => {
  it("posts the disclaimer response to the D2E-owned audit route", () => {
    const systemPortal = new SystemPortal();

    systemPortal.logAuditResponse(LogResponseType.DECLINED);

    expect(mockRequest).toHaveBeenCalledWith({
      baseURL: "system-portal/",
      url: "audit/log",
      method: "POST",
      data: { response: LogResponseType.DECLINED },
    });
  });
});
