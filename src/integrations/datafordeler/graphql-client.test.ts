import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { datafordelerGraphqlFetch } from "./graphql-client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

beforeEach(() => resetMockedFetch());
afterEach(() => resetMockedFetch());

const TEST_URL = new URL("https://graphql.datafordeler.dk/DAR/v1?apiKey=test");
const TEST_QUERY = "query { DAR_Adresse(where: {id_lokalId: {eq: $id}}) { nodes { id_lokalId } } }";
const TEST_VARS = { id: "abc", virkningstid: "2026-01-01", registreringstid: "2026-01-01" };

type TestResponse = { DAR_Adresse: { nodes: { id_lokalId: string }[] } };

describe("datafordelerGraphqlFetch", () => {
  it("returns typed data on success", async () => {
    installSequentialJsonFetch([
      { data: { DAR_Adresse: { nodes: [{ id_lokalId: "abc" }] } } },
    ]);
    const result = await datafordelerGraphqlFetch<TestResponse>(
      TEST_URL,
      TEST_QUERY,
      TEST_VARS,
      "DAR_Adresse",
    );
    expect(result.DAR_Adresse.nodes[0].id_lokalId).toBe("abc");
  });

  it("throws on HTTP error", async () => {
    installSequentialJsonFetch([{ error: "server error" }], { status: 500 });
    await expect(
      datafordelerGraphqlFetch<TestResponse>(TEST_URL, TEST_QUERY, TEST_VARS, "DAR_Adresse"),
    ).rejects.toThrow("HTTP 500");
  });

  it("throws on GraphQL errors array", async () => {
    installSequentialJsonFetch([{ errors: [{ message: "Field not found" }] }]);
    await expect(
      datafordelerGraphqlFetch<TestResponse>(TEST_URL, TEST_QUERY, TEST_VARS, "DAR_Adresse"),
    ).rejects.toThrow("Field not found");
  });
});
