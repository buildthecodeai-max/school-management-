import { NextResponse } from "next/server";
import { API_SCOPES } from "@/lib/api-auth";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

// Hand-authored OpenAPI 3.0 document for the endpoints actually implemented
// (API-001). Kept in sync with the route handlers by hand — see
// docs/ARCHITECTURE.md §9 for the process for adding a new endpoint.
export async function GET() {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Scholarum Public API",
      version: "1.0.0",
      description:
        "Tenant-scoped REST API. Authenticate with `Authorization: Bearer <keyId>.<secret>` " +
        "using a credential created under Setup → Integrations. Every response includes an " +
        `X-Correlation-Id header. Available scopes: ${API_SCOPES.join(", ")}.`,
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "keyId.secret" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                correlationId: { type: "string" },
              },
            },
          },
        },
        Student: {
          type: "object",
          properties: {
            id: { type: "string" },
            admissionNumber: { type: "string" },
            status: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/students": {
        get: {
          summary: "List students (active enrollments)",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "campusId", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "401": { description: "Missing/invalid credentials" },
            "429": { description: "Rate limited" },
          },
        },
        post: {
          summary: "Create a student and active enrollment",
          description:
            "Supports an `Idempotency-Key` header — retrying the same key with the same body " +
            "returns the original response instead of creating a duplicate.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["firstName", "lastName", "sectionId"],
                  properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    sectionId: { type: "string" },
                    admissionNumber: { type: "string" },
                    dateOfBirth: { type: "string", format: "date" },
                    gender: { type: "string", enum: ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"] },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Created" },
            "409": { description: "Idempotency-Key reused with a different request body" },
            "422": { description: "Validation error" },
          },
        },
      },
      "/students/{id}": {
        get: {
          summary: "Get a student by id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
      "/attendance/sessions": {
        get: {
          summary: "List attendance registers",
          parameters: [
            { name: "sectionId", in: "query", schema: { type: "string" } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
    },
    "x-webhooks": {
      description: "Subscribe an endpoint under Setup → Integrations. Deliveries are signed: " +
        "HMAC-SHA256 of the raw JSON body, hex-encoded, sent as `X-Scholarum-Signature: sha256=<hex>`.",
      events: WEBHOOK_EVENTS,
    },
  };

  return NextResponse.json(spec);
}
