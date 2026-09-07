import { ConceptSetNameConflictError } from "../errors/ConceptSetErrors.ts";

const DEFAULT_WEBAPI_URL = "http://localhost:33001/WebAPI";

export interface IWebApiConceptSetHeader {
  id: number;
  name: string;
  description?: string | null;
  createdBy?: {
    id?: number;
    login?: string;
    name?: string;
  } | null;
  modifiedBy?: {
    id?: number;
    login?: string;
    name?: string;
  } | null;
  createdDate?: number | null;
  modifiedDate?: number | null;
  writeAccess?: boolean | null;
  readAccess?: boolean | null;
  tags?: unknown[];
}

export interface IWebApiConceptSetItem {
  conceptId: number;
  isExcluded: number;
  includeDescendants: number;
  includeMapped: number;
}

export interface IWebApiConceptSetItemWrite {
  conceptId: number;
  isExcluded: boolean;
  includeDescendants: boolean;
  includeMapped: boolean;
}

export interface IWebApiConcept {
  CONCEPT_ID: number;
  CONCEPT_NAME: string;
  STANDARD_CONCEPT: string | null;
  STANDARD_CONCEPT_CAPTION: string;
  INVALID_REASON: string | null;
  INVALID_REASON_CAPTION: string;
  CONCEPT_CODE: string;
  DOMAIN_ID: string;
  VOCABULARY_ID: string;
  CONCEPT_CLASS_ID: string;
  VALID_START_DATE: string | number;
  VALID_END_DATE: string | number;
}

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;

const assertPositiveInteger = (value: unknown, field: string): number => {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value <= 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`Invalid ${field}: expected positive integer`);
  }
  return value;
};

const assertName = (value: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) {
    throw new Error("Invalid concept set name");
  }
  if (CONTROL_CHAR_REGEX.test(value)) {
    throw new Error("Invalid concept set name: control characters not allowed");
  }
  return value;
};

const assertOptionalDescription = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.length > 2000) {
    throw new Error("Invalid concept set description");
  }
  if (CONTROL_CHAR_REGEX.test(value)) {
    throw new Error(
      "Invalid concept set description: control characters not allowed",
    );
  }
  return value;
};

const buildUrl = (baseUrl: string, ...segments: (string | number)[]): URL => {
  const normalizedBase = baseUrl.replace(/\/?$/, "/");
  const path = segments
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/");
  return new URL(path, normalizedBase);
};

const getWebApiBaseUrl = (): string => {
  try {
    const parsed = JSON.parse(Deno.env.get("SERVICE_ROUTES") ?? "{}");
    return parsed.webapi ?? DEFAULT_WEBAPI_URL;
  } catch {
    return DEFAULT_WEBAPI_URL;
  }
};

const buildHeaders = (token: string, contentType?: string) => {
  const headers: Record<string, string> = {
    Authorization: token.toLowerCase().startsWith("bearer ")
      ? token
      : `Bearer ${token}`,
    Accept: "application/json",
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
};

export class WebApiConceptSetAPI {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(token: string) {
    if (!token) {
      throw new Error("No token passed for WebApiConceptSetAPI!");
    }

    this.token = token;

    const baseUrl = getWebApiBaseUrl();
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error(`Invalid WebAPI base URL: ${baseUrl}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid WebAPI base URL protocol: ${parsed.protocol}`);
    }
    this.baseUrl = baseUrl;
  }

  async getConceptSets(): Promise<IWebApiConceptSetHeader[]> {
    const response = await fetch(buildUrl(this.baseUrl, "conceptset", ""), {
      method: "GET",
      headers: buildHeaders(this.token),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch WebAPI concept sets: ${response.status}`,
      );
    }

    return response.json();
  }

  async getConceptSet(id: number): Promise<IWebApiConceptSetHeader> {
    const validatedId = assertPositiveInteger(id, "id");

    const response = await fetch(
      buildUrl(this.baseUrl, "conceptset", validatedId),
      {
        method: "GET",
        headers: buildHeaders(this.token),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch WebAPI concept set ${validatedId}: ${response.status}`,
      );
    }

    return response.json();
  }

  async getConceptSetItems(id: number): Promise<IWebApiConceptSetItem[]> {
    const validatedId = assertPositiveInteger(id, "id");

    const response = await fetch(
      buildUrl(this.baseUrl, "conceptset", validatedId, "items"),
      {
        method: "GET",
        headers: buildHeaders(this.token),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch WebAPI concept set items ${validatedId}: ${response.status}`,
      );
    }

    return response.json();
  }

  async createConceptSet(input: {
    name: string;
    description?: string;
  }): Promise<IWebApiConceptSetHeader> {
    const payload = {
      name: assertName(input.name),
      description: assertOptionalDescription(input.description),
    };

    const response = await fetch(buildUrl(this.baseUrl, "conceptset", ""), {
      method: "POST",
      headers: buildHeaders(this.token, "application/json"),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // WebAPI has no duplicate-name check. The `uq_cs_name` constraint on
      // `webapi.concept_set` rejects the insert and surfaces as a 409.
      if (response.status === 409) {
        throw new ConceptSetNameConflictError(payload.name);
      }
      throw new Error(
        `Failed to create WebAPI concept set: ${response.status}`,
      );
    }

    const created = await response.json();
    return this.getConceptSet(created.id);
  }

  async updateConceptSet(
    id: number,
    input: { id: number; name: string; description?: string },
  ): Promise<IWebApiConceptSetHeader> {
    const validatedId = assertPositiveInteger(id, "id");
    const inputId = assertPositiveInteger(input.id, "input.id");
    if (inputId !== validatedId) {
      throw new Error("Concept set id mismatch");
    }

    const payload = {
      id: validatedId,
      name: assertName(input.name),
      description: assertOptionalDescription(input.description),
    };

    const response = await fetch(
      buildUrl(this.baseUrl, "conceptset", validatedId),
      {
        method: "PUT",
        headers: buildHeaders(this.token, "application/json"),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      // A rename onto a name another concept set already holds trips the same
      // `uq_cs_name` constraint as a create.
      if (response.status === 409) {
        throw new ConceptSetNameConflictError(payload.name);
      }
      throw new Error(
        `Failed to update WebAPI concept set ${validatedId}: ${response.status}`,
      );
    }

    return response.json();
  }

  async updateConceptSetItems(
    id: number,
    items: IWebApiConceptSetItemWrite[],
  ): Promise<boolean> {
    const validatedId = assertPositiveInteger(id, "id");

    const payload: IWebApiConceptSetItem[] = items.map((item) => {
      assertPositiveInteger(item.conceptId, "conceptId");
      return {
        conceptId: item.conceptId,
        isExcluded: item.isExcluded ? 1 : 0,
        includeDescendants: item.includeDescendants ? 1 : 0,
        includeMapped: item.includeMapped ? 1 : 0,
      };
    });

    const response = await fetch(
      buildUrl(this.baseUrl, "conceptset", validatedId, "items"),
      {
        method: "PUT",
        headers: buildHeaders(this.token, "application/json"),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to update WebAPI concept set items ${validatedId}: ${response.status}`,
      );
    }

    return response.json();
  }

  async deleteConceptSet(id: number): Promise<void> {
    const validatedId = assertPositiveInteger(id, "id");

    const response = await fetch(
      buildUrl(this.baseUrl, "conceptset", validatedId),
      {
        method: "DELETE",
        headers: buildHeaders(this.token),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to delete WebAPI concept set ${validatedId}: ${response.status}`,
      );
    }
  }
}
