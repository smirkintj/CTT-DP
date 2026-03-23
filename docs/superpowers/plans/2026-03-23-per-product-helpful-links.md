# Per-Product Helpful Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single global helpful links list with per-product lists, managed inside each product's config panel and shown only to stakeholders of that product.

**Architecture:** Storage reuses `PortalSetting` with namespaced keys (`helpful_links:{productId}`). The lib helper, both API routes, and both UI components are updated in sequence. No schema migration needed.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma (PostgreSQL/Neon), React 19, Tailwind CSS

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `lib/helpfulLinks.ts` | Modify | Replace constants with `getHelpfulLinksKey()` helper |
| `app/api/helpful-links/route.ts` | Modify | Resolve product via `UserProductAccess`, use namespaced key |
| `app/api/admin/helpful-links/route.ts` | Modify | Accept `productId`, max-5 guard, empty-array allowed, server-gen IDs |
| `views/StakeholderDashboard.tsx` | Modify | Initial state `[]`, hide section when empty |
| `views/AdminDatabase.tsx` | Modify | Remove top-level tab; add Helpful Links sub-tab inside product config |

---

## Task 1: Update `lib/helpfulLinks.ts`

**Files:**
- Modify: `lib/helpfulLinks.ts`

- [ ] **Step 1: Replace the file contents**

  Open `lib/helpfulLinks.ts`. Replace the entire file with:

  ```ts
  export type HelpfulLinkItem = {
    id: string;
    label: string;
    url: string;
  };

  export function getHelpfulLinksKey(productId: string): string {
    return `helpful_links:${productId}`;
  }
  ```

  The two removed exports (`DEFAULT_HELPFUL_LINKS`, `HELPFUL_LINKS_SETTING_KEY`) are no longer used anywhere after all tasks in this plan are complete.

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /Users/putra/Desktop/Code/CTT-DKSH-main
  npx tsc --noEmit 2>&1 | head -40
  ```

  Expected: errors about `DEFAULT_HELPFUL_LINKS` and `HELPFUL_LINKS_SETTING_KEY` being missing in the files not yet updated — that is correct at this stage. You will fix those in Tasks 2–5. No other errors should appear.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/helpfulLinks.ts
  git commit -m "refactor: replace global helpful links key with per-product key helper"
  ```

---

## Task 2: Update `app/api/helpful-links/route.ts` (stakeholder endpoint)

**Files:**
- Modify: `app/api/helpful-links/route.ts`

- [ ] **Step 1: Replace the file contents**

  ```ts
  import { NextResponse } from 'next/server';
  import { getServerSession } from 'next-auth';
  import { authOptions } from '../../../lib/auth';
  import prisma from '../../../lib/prisma';
  import { getHelpfulLinksKey } from '../../../lib/helpfulLinks';

  export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve the user's product — take the earliest-assigned product access.
    const access = await prisma.userProductAccess.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: { productId: true }
    });

    if (!access) {
      return NextResponse.json([]);
    }

    const setting = await prisma.portalSetting.findUnique({
      where: { key: getHelpfulLinksKey(access.productId) },
      select: { value: true }
    });

    return NextResponse.json(Array.isArray(setting?.value) ? setting.value : []);
  }
  ```

- [ ] **Step 2: Verify no TS errors in this file**

  ```bash
  npx tsc --noEmit 2>&1 | grep "api/helpful-links/route"
  ```

  Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/helpful-links/route.ts
  git commit -m "feat: resolve helpful links by user product access"
  ```

---

## Task 3: Update `app/api/admin/helpful-links/route.ts` (admin endpoint)

**Files:**
- Modify: `app/api/admin/helpful-links/route.ts`

- [ ] **Step 1: Replace the file contents**

  ```ts
  import { NextResponse } from 'next/server';
  import { getServerSession } from 'next-auth';
  import { authOptions } from '../../../../lib/auth';
  import prisma from '../../../../lib/prisma';
  import { getHelpfulLinksKey } from '../../../../lib/helpfulLinks';
  import { adminCanAccessProduct } from '../../../../lib/adminAccess';
  import { randomUUID } from 'crypto';

  const isValidUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const productId = new URL(req.url).searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId is required', code: 'PRODUCT_ID_REQUIRED' }, { status: 400 });
    }
    if (!(await adminCanAccessProduct(session.user.id, productId))) {
      return NextResponse.json({ error: 'Forbidden', code: 'ADMIN_PRODUCT_FORBIDDEN' }, { status: 403 });
    }

    const setting = await prisma.portalSetting.findUnique({
      where: { key: getHelpfulLinksKey(productId) },
      select: { value: true }
    });

    return NextResponse.json(Array.isArray(setting?.value) ? setting.value : []);
  }

  export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const productId = body?.productId?.toString().trim();
    if (!productId) {
      return NextResponse.json({ error: 'productId is required', code: 'PRODUCT_ID_REQUIRED' }, { status: 400 });
    }
    if (!(await adminCanAccessProduct(session.user.id, productId))) {
      return NextResponse.json({ error: 'Forbidden', code: 'ADMIN_PRODUCT_FORBIDDEN' }, { status: 403 });
    }

    const links = Array.isArray(body?.links) ? body.links : null;
    if (links === null) {
      return NextResponse.json({ error: 'links must be an array', code: 'HELPFUL_LINKS_INVALID' }, { status: 400 });
    }
    if (links.length > 5) {
      return NextResponse.json({ error: 'Max 5 links allowed', code: 'HELPFUL_LINKS_MAX_EXCEEDED' }, { status: 400 });
    }

    for (const link of links) {
      const label = (link?.label || '').toString().trim();
      const url = (link?.url || '').toString().trim();
      if (!label) {
        return NextResponse.json({ error: 'Link label is required', code: 'HELPFUL_LINKS_LABEL_REQUIRED' }, { status: 400 });
      }
      if (!url || !isValidUrl(url)) {
        return NextResponse.json({ error: `Invalid URL for "${label}"`, code: 'HELPFUL_LINKS_URL_INVALID' }, { status: 400 });
      }
    }

    // Server regenerates all IDs to prevent malformed/duplicate client IDs.
    const sanitised = links.map((link: { label: string; url: string }) => ({
      id: randomUUID(),
      label: link.label.toString().trim(),
      url: link.url.toString().trim()
    }));

    const key = getHelpfulLinksKey(productId);
    const saved = await prisma.portalSetting.upsert({
      where: { key },
      create: { key, value: sanitised, updatedById: session.user.id },
      update: { value: sanitised, updatedById: session.user.id },
      select: { value: true }
    });

    return NextResponse.json(saved.value);
  }
  ```

- [ ] **Step 2: Verify no TS errors in this file**

  ```bash
  npx tsc --noEmit 2>&1 | grep "admin/helpful-links/route"
  ```

  Expected: no output.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/admin/helpful-links/route.ts
  git commit -m "feat: scope admin helpful links API to product, enforce max 5, server-gen IDs"
  ```

---

## Task 4: Update `views/StakeholderDashboard.tsx`

**Files:**
- Modify: `views/StakeholderDashboard.tsx`

Three small changes in this file:

- [ ] **Step 1: Remove `DEFAULT_HELPFUL_LINKS` import (line 7)**

  Find:
  ```ts
  import { DEFAULT_HELPFUL_LINKS } from '../lib/helpfulLinks';
  ```
  Delete this line entirely.

- [ ] **Step 2: Change initial `helpfulLinks` state to empty array (line 42)**

  Find:
  ```ts
  const [helpfulLinks, setHelpfulLinks] = useState(DEFAULT_HELPFUL_LINKS);
  ```
  Replace with:
  ```ts
  const [helpfulLinks, setHelpfulLinks] = useState<{ id: string; label: string; url: string }[]>([]);
  ```

- [ ] **Step 3: Wrap Helpful Links section in a conditional (around line 556)**

  Find:
  ```tsx
  <div className="pt-4 border-t border-slate-100">
      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Helpful Links</h4>
      <ul className="space-y-2">
        {helpfulLinks.map((link) => (
          <li key={link.id}>
            <a href={link.url} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
  </div>
  ```
  Replace with:
  ```tsx
  {helpfulLinks.length > 0 && (
    <div className="pt-4 border-t border-slate-100">
      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Helpful Links</h4>
      <ul className="space-y-2">
        {helpfulLinks.map((link) => (
          <li key={link.id}>
            <a href={link.url} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )}
  ```

- [ ] **Step 4: Verify no TS errors**

  ```bash
  npx tsc --noEmit 2>&1 | grep "StakeholderDashboard"
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add views/StakeholderDashboard.tsx
  git commit -m "feat: hide helpful links section when empty, remove global defaults"
  ```

---

## Task 5: Update `views/AdminDatabase.tsx`

This is the largest task. It has two parts: (A) remove the old global tab, and (B) add the new per-product sub-tab.

**Files:**
- Modify: `views/AdminDatabase.tsx`

### Part A — Remove the global Helpful Links tab

- [ ] **Step A1: Remove `DEFAULT_HELPFUL_LINKS` import (line 8)**

  Find:
  ```ts
  import { DEFAULT_HELPFUL_LINKS } from '../lib/helpfulLinks';
  ```
  Delete this line entirely.

- [ ] **Step A2: Update the `activeTab` union type (line 41)**

  Find:
  ```ts
  const [activeTab, setActiveTab] = useState<'countries' | 'products' | 'notifications' | 'helpfulLinks' | 'users'>('countries');
  ```
  Replace with:
  ```ts
  const [activeTab, setActiveTab] = useState<'countries' | 'products' | 'notifications' | 'users'>('countries');
  ```

- [ ] **Step A3: Remove the three helpfulLinks state declarations (lines 112–114)**

  Find and delete these three lines:
  ```ts
  const [helpfulLinks, setHelpfulLinks] = useState(DEFAULT_HELPFUL_LINKS);
  const [savedHelpfulLinks, setSavedHelpfulLinks] = useState(DEFAULT_HELPFUL_LINKS);
  const [helpfulLinksSaveState, setHelpfulLinksSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  ```

- [ ] **Step A4: Remove the helpfulLinks load effect (lines 154–165)**

  Find and delete:
  ```ts
  useEffect(() => {
    if (activeTab !== 'helpfulLinks') return;
    void (async () => {
      const response = await fetch('/api/admin/helpful-links', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) {
        setHelpfulLinks(data);
        setSavedHelpfulLinks(data);
      }
    })();
  }, [activeTab]);
  ```

- [ ] **Step A5: Remove `helpfulLinksDirty` computed value (line 370)**

  Find and delete:
  ```ts
  const helpfulLinksDirty = JSON.stringify(helpfulLinks) !== JSON.stringify(savedHelpfulLinks);
  ```

- [ ] **Step A6: Remove `updateHelpfulLink` function**

  Find and delete:
  ```ts
  const updateHelpfulLink = (index: number, field: 'label' | 'url', value: string) => {
    setHelpfulLinks((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };
  ```

- [ ] **Step A7: Remove `saveHelpfulLinks` function (lines 598–617)**

  Find and delete:
  ```ts
  const saveHelpfulLinks = () => {
    void (async () => {
      setHelpfulLinksSaveState('saving');
      const response = await fetch('/api/admin/helpful-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: helpfulLinks })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setHelpfulLinksSaveState('error');
        notify(data?.error || 'Failed to save helpful links', 'error');
        return;
      }
      setSavedHelpfulLinks(helpfulLinks);
      setHelpfulLinksSaveState('saved');
      notify('Helpful links saved', 'success');
      window.setTimeout(() => setHelpfulLinksSaveState('idle'), 1200);
    })();
  };
  ```

- [ ] **Step A8: Update `handleTabChange` — remove `helpfulLinks` guard and update type (lines 619–641)**

  Find:
  ```ts
  const handleTabChange = (nextTab: 'countries' | 'products' | 'notifications' | 'helpfulLinks' | 'users') => {
    if (activeTab === 'notifications' && nextTab !== 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
      setConfirmDialog({
        open: true,
        title: 'Unsaved Notification Settings',
        message: 'You have unsaved notification settings. Leave without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => setActiveTab(nextTab)
      });
      return;
    }
    if (activeTab === 'helpfulLinks' && nextTab !== 'helpfulLinks' && helpfulLinksDirty) {
      setConfirmDialog({
        open: true,
        title: 'Unsaved Helpful Links',
        message: 'You have unsaved helpful links. Leave without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => setActiveTab(nextTab)
      });
      return;
    }
    setActiveTab(nextTab);
  };
  ```
  Replace with:
  ```ts
  const handleTabChange = (nextTab: 'countries' | 'products' | 'notifications' | 'users') => {
    if (activeTab === 'notifications' && nextTab !== 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
      setConfirmDialog({
        open: true,
        title: 'Unsaved Notification Settings',
        message: 'You have unsaved notification settings. Leave without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => setActiveTab(nextTab)
      });
      return;
    }
    setActiveTab(nextTab);
  };
  ```

- [ ] **Step A9: Remove the "Helpful Links" tab bar button (lines ~680–684)**

  Find and delete:
  ```tsx
  <button
    onClick={() => handleTabChange('helpfulLinks')}
    className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'helpfulLinks' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
  >
     Helpful Links
  </button>
  ```

- [ ] **Step A10: Remove the `activeTab === 'helpfulLinks'` render block (lines 1078–1118)**

  Find and delete the entire block:
  ```tsx
  {activeTab === 'helpfulLinks' && (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      ...
    </div>
  )}
  ```
  (Delete from the opening `{activeTab === 'helpfulLinks' && (` to its closing `)}`)

### Part B — Add per-product Helpful Links sub-tab

- [ ] **Step B1: Add per-product helpful links state**

  After the existing product-related state declarations (look for `selectedProduct`, `newModule`, etc.), add:

  ```ts
  const [productHelpfulLinks, setProductHelpfulLinks] = useState<{ id: string; label: string; url: string }[]>([]);
  const [savedProductHelpfulLinks, setSavedProductHelpfulLinks] = useState<{ id: string; label: string; url: string }[]>([]);
  const [productHelpfulLinksSaveState, setProductHelpfulLinksSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [productLinksSubTab, setProductLinksSubTab] = useState<'modules' | 'targetSystems' | 'helpfulLinks'>('modules');
  const [productLinksLoading, setProductLinksLoading] = useState(false);
  ```

- [ ] **Step B2: Add a load function for per-product links**

  Add this function alongside the other product-related functions (near `handleAddModule`, etc.):

  ```ts
  const loadProductHelpfulLinks = async (productId: string) => {
    setProductLinksLoading(true);
    try {
      const response = await fetch(`/api/admin/helpful-links?productId=${productId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) {
        setProductHelpfulLinks(data);
        setSavedProductHelpfulLinks(data);
      }
    } finally {
      setProductLinksLoading(false);
    }
  };
  ```

- [ ] **Step B3: Add a save function for per-product links**

  ```ts
  const saveProductHelpfulLinks = () => {
    if (!selectedProduct) return;
    void (async () => {
      setProductHelpfulLinksSaveState('saving');
      const response = await fetch('/api/admin/helpful-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProduct.id, links: productHelpfulLinks })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setProductHelpfulLinksSaveState('error');
        notify(data?.error || 'Failed to save helpful links', 'error');
        return;
      }
      if (Array.isArray(data)) {
        setProductHelpfulLinks(data);
        setSavedProductHelpfulLinks(data);
      }
      setProductHelpfulLinksSaveState('saved');
      notify('Helpful links saved', 'success');
      window.setTimeout(() => setProductHelpfulLinksSaveState('idle'), 1200);
    })();
  };
  ```

- [ ] **Step B4: Add a computed dirty check**

  Near the other dirty-state checks, add:
  ```ts
  const productHelpfulLinksDirty = JSON.stringify(productHelpfulLinks) !== JSON.stringify(savedProductHelpfulLinks);
  ```

- [ ] **Step B5: Add the sub-tab switch with dirty guard and load trigger**

  Add this function near `handleTabChange`:
  ```ts
  const handleProductSubTab = (next: 'modules' | 'targetSystems' | 'helpfulLinks') => {
    if (productLinksSubTab === 'helpfulLinks' && next !== 'helpfulLinks' && productHelpfulLinksDirty) {
      if (!window.confirm('You have unsaved changes to Helpful Links. Leave without saving?')) return;
    }
    setProductLinksSubTab(next);
    if (next === 'helpfulLinks' && selectedProduct) {
      void loadProductHelpfulLinks(selectedProduct.id);
    }
  };
  ```

- [ ] **Step B6: Reset sub-tab state when selected product changes**

  The component uses `selectedProductId` (string) as state, not `selectedProduct`. Search for `setSelectedProductId(` — there are 3 call sites. After **each** one, add:
  ```ts
  setProductLinksSubTab('modules');
  setProductHelpfulLinks([]);
  setSavedProductHelpfulLinks([]);
  setProductHelpfulLinksSaveState('idle');
  ```
  Note: `selectedProduct` used in the JSX below is a derived constant (`products.find(p => p.id === selectedProductId) ?? null`) already defined in the component — reference it directly.

- [ ] **Step B7: Replace the static Modules/Target Systems sections with a sub-tabbed layout**

  In the `{selectedProduct ? ( ... ) : ...}` block (around line 803), the current structure is two consecutive `<div className="rounded-xl border...">` panels — one for Modules, one for Target Systems. Replace the wrapping `<>` fragment with:

  ```tsx
  <>
    {/* Product sub-tab bar */}
    <div className="flex gap-0 border-b border-slate-200 mb-4">
      {(['modules', 'targetSystems', 'helpfulLinks'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => handleProductSubTab(tab)}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
            productLinksSubTab === tab
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab === 'modules' ? 'Modules' : tab === 'targetSystems' ? 'Target Systems' : 'Helpful Links'}
        </button>
      ))}
    </div>

    {/* Modules panel — unchanged, just conditional */}
    {productLinksSubTab === 'modules' && (
      <div className="rounded-xl border border-slate-200 p-5">
        {/* KEEP all existing Modules content exactly as-is */}
      </div>
    )}

    {/* Target Systems panel — unchanged, just conditional */}
    {productLinksSubTab === 'targetSystems' && (
      <div className="rounded-xl border border-slate-200 p-5">
        {/* KEEP all existing Target Systems content exactly as-is */}
      </div>
    )}

    {/* Helpful Links panel — NEW */}
    {productLinksSubTab === 'helpfulLinks' && (
      <div className="rounded-xl border border-slate-200 p-5 space-y-4">
        <p className="text-xs text-slate-500">
          Configure links shown in the stakeholder dashboard sidebar for <strong>{selectedProduct.name}</strong> users. Max 5 links.
        </p>

        {productLinksLoading ? (
          <div className="space-y-2">
            {[1, 2].map((n) => (
              <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {productHelpfulLinks.map((link, index) => (
              <div key={link.id || index} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) =>
                    setProductHelpfulLinks((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, label: e.target.value } : item))
                    )
                  }
                  className={fieldBaseClass}
                  placeholder="Link label"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) =>
                    setProductHelpfulLinks((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, url: e.target.value } : item))
                    )
                  }
                  className={fieldBaseClass}
                  placeholder="https://..."
                />
                <button
                  onClick={() =>
                    setProductHelpfulLinks((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 text-base leading-none"
                  aria-label="Remove link"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {productHelpfulLinks.length < 5 && (
          <button
            onClick={() =>
              setProductHelpfulLinks((prev) => [
                ...prev,
                { id: '', label: '', url: '' }
              ])
            }
            className="flex items-center gap-2 text-xs text-slate-600 border border-dashed border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50"
          >
            <Plus size={14} /> Add link
            <span className="text-slate-400">({5 - productHelpfulLinks.length} of 5 remaining)</span>
          </button>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={saveProductHelpfulLinks}
            disabled={!productHelpfulLinksDirty || productHelpfulLinksSaveState === 'saving'}
            className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {productHelpfulLinksSaveState === 'saving'
              ? 'Saving...'
              : productHelpfulLinksSaveState === 'saved'
              ? 'Saved'
              : 'Save Links'}
          </button>
        </div>
      </div>
    )}
  </>
  ```

  **Important:** Keep all existing Modules and Target Systems JSX content exactly as-is — just wrap each in the `productLinksSubTab === 'modules'` and `productLinksSubTab === 'targetSystems'` conditionals.

- [ ] **Step B8: Verify TypeScript compiles clean**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step B9: Commit**

  ```bash
  git add views/AdminDatabase.tsx
  git commit -m "feat: move helpful links into per-product sub-tab, remove global tab"
  ```

---

## Task 6: Smoke Test

- [ ] **Step 1: Start the dev server**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Test admin flow**

  1. Log in as an admin user.
  2. Go to **Admin → Database → Products**.
  3. Select a product — you should see three sub-tabs: **Modules**, **Target Systems**, **Helpful Links**.
  4. Click **Helpful Links** — it should show a loading skeleton then an empty list with an `+ Add link (5 of 5 remaining)` button.
  5. Add 2 links with valid labels and `https://` URLs. Click **Save Links**. Expect a "Helpful links saved" toast.
  6. Switch to **Modules** tab and back to **Helpful Links** — the saved links should re-load (fresh fetch).
  7. Add a 6th link — the **+ Add link** button should be hidden at 5. (To test: add up to 5 first.)
  8. Try leaving with unsaved changes — confirm dialog should appear.
  9. Verify the old top-level **Helpful Links** tab is gone from the main tab bar.

- [ ] **Step 3: Test stakeholder flow**

  1. Log in as a stakeholder user assigned to the product you just configured.
  2. The sidebar should show the **Helpful Links** section with the links you saved.
  3. Log in as a stakeholder assigned to a product with no links configured — the **Helpful Links** section should not appear.

- [ ] **Step 4: Final commit if any last fixes applied**

  ```bash
  git add -A
  git commit -m "fix: per-product helpful links smoke test fixes" # only if needed
  ```
