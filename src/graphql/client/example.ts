import { print } from "graphql";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import {
  AgentReviewsDocument,
  type AgentReviewsQuery,
  type AgentReviewsQueryVariables,
} from "./generated";

async function executeGraphql<TResult, TVariables>(
  endpoint: string,
  token: string,
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
): Promise<TResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: print(document), variables }),
  });
  const payload = (await response.json()) as {
    data?: TResult;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || payload.errors || !payload.data) {
    throw new Error(payload.errors?.[0]?.message ?? "GraphQL request failed");
  }

  return payload.data;
}

/**
 * Loads every page while preserving generated result and variable types.
 * Frontends should store cursors without decoding or constructing them.
 */
export async function loadAgentReviews(
  endpoint: string,
  token: string,
  agentId: string,
): Promise<AgentReviewsQuery["agentReviews"]["edges"]> {
  const reviews: Array<AgentReviewsQuery["agentReviews"]["edges"][number]> = [];
  let after: string | null = null;

  do {
    const variables: AgentReviewsQueryVariables = {
      agentId,
      first: 20,
      after,
    };
    const data = await executeGraphql(
      endpoint,
      token,
      AgentReviewsDocument,
      variables,
    );
    reviews.push(...data.agentReviews.edges);

    const { hasNextPage, endCursor } = data.agentReviews.pageInfo;
    after = hasNextPage ? (endCursor ?? null) : null;
    if (!hasNextPage) break;
  } while (after);

  return reviews;
}
