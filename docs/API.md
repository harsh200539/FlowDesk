# FlowDesk API

Base: `/api`. Login via cookie jar or send `Authorization: Bearer <JWT>` for CLI/test clients. Send `X-App-Request: 1` on writes except Stripe webhooks. All authorizations are enforced server-side.

| Method | Path |
| --- | --- |
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/logout` |
| GET | `/auth/me` |
| GET | `/health` |
| GET | `/workspaces` |
| POST | `/workspaces` |
| GET | `/workspaces/:id` |
| GET | `/workspaces/:id/members` |
| POST | `/workspaces/:id/members` |
| PATCH | `/workspaces/:id/members/:userId` |
| DELETE | `/workspaces/:id/members/:userId` |
| GET | `/projects` |
| POST | `/projects` |
| GET | `/projects/:id` |
| PATCH | `/projects/:id` |
| DELETE | `/projects/:id` |
| GET | `/tasks` |
| POST | `/tasks` |
| GET | `/tasks/:id` |
| PATCH | `/tasks/:id` |
| DELETE | `/tasks/:id` |
| GET | `/tasks/:id/comments` |
| POST | `/tasks/:id/comments` |
| GET | `/notifications` |
| PATCH | `/notifications/:id/read` |

## Query parameters

Pagination: `page=1&limit=20`, maximum 100.

Projects: `workspaceId`. Tasks: `projectId` required. Task PATCH requires current `version`. Due dates are ISO datetime strings or null. Workspace invites use registered `email` and `role`.

See strict Zod schemas in the source and the Postman collection for request bodies. For resume upload, use multipart field `resume` containing a PDF.
