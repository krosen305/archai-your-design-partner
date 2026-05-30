import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { datafordelerGraphqlFetch, summarizeGraphqlQuery } from "./graphql-client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

beforeEach(() => resetMockedFetch());
afterEach(() => resetMockedFetch());

const TEST_URL = new URL("https://graphql.datafordeler.dk/DAR/v1?apiKey=test");
const TEST_QUERY = "query { DAR_Adresse(where: {id_lokalId: {eq: $id}}) { nodes { id_lokalId } } }";
const TEST_VARS = { id: "abc", virkningstid: "2026-01-01", registreringstid: "2026-01-01" };

type TestResponse = { DAR_Adresse: { nodes: { id_lokalId: string }[] } };
const testResponseSchema = z.object({
  DAR_Adresse: z.object({
    nodes: z.array(z.object({ id_lokalId: z.string() })),
  }),
});

describe("datafordelerGraphqlFetch", () => {
  it("summarizes GraphQL queries onto one line", () => {
    expect(
      summarizeGraphqlQuery(`
        query Foo($id: String!) {
          Foo(where: { id: { eq: $id } }) {
            nodes { id }
          }
        }
      `),
    ).toBe("query Foo($id: String!) { Foo(where: { id: { eq: $id } }) { nodes { id } } }");
  });

  it("returns typed data on success", async () => {
    installSequentialJsonFetch([{ data: { DAR_Adresse: { nodes: [{ id_lokalId: "abc" }] } } }]);
    const result = await datafordelerGraphqlFetch<TestResponse>(
      TEST_URL,
      TEST_QUERY,
      TEST_VARS,
      "DAR_Adresse",
      testResponseSchema,
    );
    expect(result.DAR_Adresse.nodes[0].id_lokalId).toBe("abc");
  });

  it("throws on HTTP error", async () => {
    installSequentialJsonFetch([{ error: "server error" }], { status: 500 });
    await expect(
      datafordelerGraphqlFetch<TestResponse>(
        TEST_URL,
        TEST_QUERY,
        TEST_VARS,
        "DAR_Adresse",
        testResponseSchema,
      ),
    ).rejects.toThrow("HTTP 500");
  });

  it("throws on GraphQL errors array", async () => {
    installSequentialJsonFetch([{ errors: [{ message: "Field not found" }] }]);
    await expect(
      datafordelerGraphqlFetch<TestResponse>(
        TEST_URL,
        TEST_QUERY,
        TEST_VARS,
        "DAR_Adresse",
        testResponseSchema,
      ),
    ).rejects.toThrow("Field not found");
  });

  it("throws on invalid response shape", async () => {
    installSequentialJsonFetch([{ data: { DAR_Adresse: { nodes: [{ wrong: "abc" }] } } }]);
    await expect(
      datafordelerGraphqlFetch<TestResponse>(
        TEST_URL,
        TEST_QUERY,
        TEST_VARS,
        "DAR_Adresse",
        testResponseSchema,
      ),
    ).rejects.toThrow();
  });
});
