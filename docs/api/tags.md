# Tags API Documentation

API endpoints for managing documentation tags within projects.

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:projectId/tags` | Create new tag |
| GET | `/api/projects/:projectId/tags` | List project tags |
| DELETE | `/api/tags/:id` | Delete tag |
| POST | `/api/docs/:docId/tags` | Assign tags to document |
| GET | `/api/docs/:docId/tags` | Get document tags |
| DELETE | `/api/docs/:docId/tags/:tagId` | Remove tag from document |
| GET | `/api/projects/:projectId/tags/:tagId/docs` | List docs with tag |

---

## Authentication

All endpoints require authentication via Supabase session cookie.
Returns `401 Unauthorized` if not authenticated.

---

## Tag Management

### Create Tag

```http
POST /api/projects/:projectId/tags
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "API"
}
```

**Response: 201 Created**
```json
{
  "data": {
    "id": "uuid",
    "name": "API",
    "projectId": "uuid",
    "orgId": "uuid",
    "createdAt": "2025-12-23T22:00:00.000Z"
  }
}
```

**Errors:**
- `400` - Validation error (empty name, name too long)
- `404` - Project not found
- `409` - Tag name already exists in project

---

### List Project Tags

```http
GET /api/projects/:projectId/tags
```

**Response: 200 OK**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "API",
      "projectId": "uuid",
      "orgId": "uuid",
      "createdAt": "2025-12-23T22:00:00.000Z",
      "_count": {
        "assignments": 5
      }
    }
  ]
}
```

---

### Delete Tag

```http
DELETE /api/tags/:id
```

**Response: 204 No Content**

**Errors:**
- `404` - Tag not found

> **Note:** Deleting a tag cascades to remove all document associations.

---

## Document Tag Operations

### Assign Tags to Document

```http
POST /api/docs/:docId/tags
Content-Type: application/json
```

**Request Body:**
```json
{
  "tagIds": ["uuid-1", "uuid-2"]
}
```

**Response: 200 OK**
```json
{
  "data": [
    { "id": "uuid-1", "name": "API", ... },
    { "id": "uuid-2", "name": "Guide", ... }
  ]
}
```

**Notes:**
- Idempotent - assigning same tag twice has no effect
- At least one tagId required

---

### Get Document Tags

```http
GET /api/docs/:docId/tags
```

**Response: 200 OK**
```json
{
  "data": [
    { "id": "uuid", "name": "API", "projectId": "uuid", ... }
  ]
}
```

---

### Remove Tag from Document

```http
DELETE /api/docs/:docId/tags/:tagId
```

**Response: 200 OK**
```json
{
  "data": [
    // remaining tags after removal
  ]
}
```

---

## Filter Documents by Tag

### List Documents with Specific Tag

```http
GET /api/projects/:projectId/tags/:tagId/docs
```

**Response: 200 OK**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "API Guide",
      "content": "...",
      "projectId": "uuid",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Tag not found",
    "details": {}
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource not found
- `CONFLICT` - Duplicate resource (e.g., tag name)
- `UNAUTHORIZED` - Not authenticated
