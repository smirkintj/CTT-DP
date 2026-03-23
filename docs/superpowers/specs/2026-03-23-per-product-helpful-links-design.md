# Per-Product Helpful Links — Design Spec
**Date:** 2026-03-23
**Status:** Draft

---

## Problem

The current Helpful Links feature stores a single global set of links in `PortalSetting` (key `helpful_links`). All stakeholders across all products see the same links, regardless of which product they are assigned to. Different products need different resources, so the links must be managed and displayed per-product.

---

## Goals

- Each product has its own independent set of helpful links (max 5).
- Admins manage links inside the product's own config panel — not a separate top-level tab.
- Stakeholders see only their product's links in the dashboard sidebar.
- No new DB table or migration required.

---

## Non-Goals

- Global/shared links that appear for all products (explicitly out of scope — purely per-product).
- More than 5 links per product.

---

## Data Storage

Reuse the existing `PortalSetting` model with a namespaced key:

```
helpful_links:{productId}
```

Each entry stores a JSON array:
```json
[
  { "id": "uuid", "label": "UAT Guidelines PDF", "url": "https://..." },
  { "id": "uuid", "label": "Report a Bug", "url": "https://..." }
]
```

**Retirement of old key:** The old global `helpful_links` PortalSetting row is left in the database untouched (consistent with project convention of no destructive data migrations). The application code simply stops reading or writing it.

---

## API Changes

### `GET /api/admin/helpful-links?productId={id}`
- Requires `ADMIN` role.
- `productId` query param is required. If missing, return `400 { error: 'productId is required', code: 'PRODUCT_ID_REQUIRED' }`.
- Admin must pass the existing `adminCanAccessProduct` gate (403 if not).
- Returns the array for that product's `PortalSetting` key, or `[]` if not yet set.

### `PATCH /api/admin/helpful-links`
- Requires `ADMIN` role.
- Body: `{ productId: string, links: HelpfulLinkItem[] }`.
- Validates `productId` is present (400 `PRODUCT_ID_REQUIRED` if missing) and admin has access (403 if not).
- Validates each link: non-empty `label` string, valid `http`/`https` URL. Empty `links` array (`[]`) is valid — it clears all links for the product.
- Enforces max 5 links (returns `400 { error: 'Max 5 links allowed', code: 'HELPFUL_LINKS_MAX_EXCEEDED' }` if exceeded).
- **`id` handling:** The server ignores any client-submitted `id` values. On every save, the server regenerates all `id` fields via `crypto.randomUUID()` before persisting. This prevents malformed or duplicate IDs.
- Upserts `PortalSetting` with key `helpful_links:{productId}`.

### `GET /api/helpful-links`
- Requires authenticated session (any role).
- **Product resolution:** Queries `UserProductAccess` for the current user (`where: { userId: session.user.id }`, `orderBy: { createdAt: 'asc' }`), takes the first result's `productId`.
  - If the user has zero product accesses, return `[]`.
  - If the user has multiple product accesses, use the earliest-created one (first assigned). This is the expected case for stakeholders who are typically single-product; multiple accesses is treated as an edge case, not an error.
- Returns the array for `helpful_links:{productId}`, or `[]` if not configured.
- No longer falls back to `DEFAULT_HELPFUL_LINKS`.

---

## Admin UI (`views/AdminDatabase.tsx`)

### Remove
- The top-level **"Helpful Links"** tab from the tab bar.
- All associated state (`helpfulLinks`, `savedHelpfulLinks`, `helpfulLinksSaveState`), load effect, save function, and render block.

### Add — inside each product's config panel
A new **"Helpful Links"** sub-tab alongside the existing "Modules" and "Target Systems" sub-tabs.

**Panel contents:**
- Helper text: *"Configure links shown in the stakeholder dashboard sidebar for [Product Name] users. Max 5 links."*
- Up to 5 link rows, each with:
  - Label text input (`placeholder="Link label"`)
  - URL input (`type="url"`, `placeholder="https://..."`)
  - Red `×` remove button
- `+ Add link (N of 5 remaining)` dashed button — hidden when 5 links already present. N = `5 - currentCount`.
- **Save Links** button (bottom-right), disabled when no unsaved changes.
- Saving an empty list (`[]`) is valid and clears all links for that product.

**Dirty-state guard:**
When the user attempts to switch away from the Helpful Links sub-tab (or select a different product) with unsaved changes, show a `window.confirm()` dialog: *"You have unsaved changes to Helpful Links. Leave without saving?"* If the user cancels, stay on the current sub-tab. If confirmed, discard changes and navigate. This matches the existing `window.confirm`-based guard already used in `AdminDatabase.tsx` for top-level tab changes.

**Data loading:**
Fetch `GET /api/admin/helpful-links?productId={id}` each time the Helpful Links sub-tab is activated (i.e. on every entry, including re-entry after discarding changes). This ensures the user always sees fresh server data. Show a loading skeleton while fetching.

---

## Stakeholder UI (`views/StakeholderDashboard.tsx`)

- No structural changes to the fetch logic — it already calls `/api/helpful-links`.
- **Change initial state:** `useState([])` instead of `useState(DEFAULT_HELPFUL_LINKS)` to prevent a flash of stale default links on load.
- **Hide the section entirely** when the returned array is empty: render the "Helpful Links" sidebar block only when `helpfulLinks.length > 0`.

---

## `lib/helpfulLinks.ts`

- Add helper: `getHelpfulLinksKey(productId: string): string` → returns `` `helpful_links:${productId}` ``.
- Keep `HelpfulLinkItem` type.
- Remove `DEFAULT_HELPFUL_LINKS` constant (no longer referenced).
- Remove `HELPFUL_LINKS_SETTING_KEY` constant (replaced by the helper function).

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/helpfulLinks.ts` | Add `getHelpfulLinksKey()`, remove `DEFAULT_HELPFUL_LINKS` and `HELPFUL_LINKS_SETTING_KEY` exports |
| `app/api/helpful-links/route.ts` | Remove import of `DEFAULT_HELPFUL_LINKS`/`HELPFUL_LINKS_SETTING_KEY`; resolve product via `UserProductAccess`; use `getHelpfulLinksKey()`; return `[]` instead of defaults |
| `app/api/admin/helpful-links/route.ts` | Remove import of old constants; accept `productId`; enforce max 5; server-generate IDs; allow empty array; use `getHelpfulLinksKey()` |
| `views/AdminDatabase.tsx` | Remove import of `DEFAULT_HELPFUL_LINKS`; remove `'helpfulLinks'` from the tab union type and all handler conditions/effects; remove top-level Helpful Links tab, state, load effect, save function, and render block; add Helpful Links sub-tab inside product config |
| `views/StakeholderDashboard.tsx` | Remove import of `DEFAULT_HELPFUL_LINKS`; initial state `[]`; hide section when `helpfulLinks.length === 0` |

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Product has no links configured | Stakeholder sees no Helpful Links section |
| Admin has no product access | `adminCanAccessProduct` returns 403 |
| `productId` missing from admin request | 400 `PRODUCT_ID_REQUIRED` |
| User has zero product accesses | `/api/helpful-links` returns `[]` |
| User has multiple product accesses | Use earliest-created productId |
| Submitted links array is empty | Valid — clears links for that product |
| Submitted links array exceeds 5 | API returns 400 `HELPFUL_LINKS_MAX_EXCEEDED` |
| URL is not http/https | API returns 400 `HELPFUL_LINKS_URL_INVALID` |
| Label is empty string | API returns 400 `HELPFUL_LINKS_LABEL_REQUIRED` |
