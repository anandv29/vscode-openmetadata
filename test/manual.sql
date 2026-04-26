-- Manual smoke-test file for the OpenMetadata VS Code extension.
-- Open in the Extension Development Host (F5 from the repo root).
--
-- Two sections:
--   A. SQL PARSER scenarios  — tests hover/CodeLens parsing edge cases
--   B. METADATA scenarios    — tests what the tooltip actually shows for diff. tables
--
-- Tables used (all verified against sandbox.open-metadata.org):
--   acme_nexus_analytics → dim_customers   (ANALYTICS.MARTS schema)
--   acme_nexus_raw_data  → clickstream     (acme_raw.analytics schema, owner + tags)
--   acme_nexus_raw_data  → customers       (acme_raw.crm schema, owner + many tags)
--   ACME_MYSQL           → ACCOUNTS        (FINANCIAL_STAGING schema, 32 columns)
--   sample_redshift      → dim_customer    (staging_db.integration schema)
--   sample_athena        → orders          (resolves to raw_orders in default.raw)
--
-- IMPORTANT: The sandbox DQ tests are mostly Queued (no results yet).
--   Most tables return an empty DQ list from the extension's endpoint
--   (which omits includeAllTests). Only dim_customers has 1 Aborted result.
--
-- How to read each section:
--   ✅ expected to work
--   ⚠️  known limitation (not a bug)
--   ❌ known gap / future fix


-- ════════════════════════════════════════════════════════════════
-- A. SQL PARSER SCENARIOS
-- ════════════════════════════════════════════════════════════════

-- ── A1. Basic multi-table query ───────────────────────────────
-- ✅ Hover on dim_customer, orders, dim_customers → tooltip with columns, DQ, owners
-- ✅ Hover on SELECT, WHERE, c, o, d (aliases) → no tooltip
-- ✅ CodeLens pairs (Open + Lineage) above each FROM/JOIN line

SELECT
    c.customer_id,
    c.name,
    o.order_date,
    d.customer_key
FROM dim_customer c
INNER JOIN orders o ON c.customer_id = o.customer_id
INNER JOIN dim_customers d ON d.customer_key = c.customer_id
WHERE o.order_date >= '2023-01-01'
ORDER BY c.name DESC
LIMIT 100;


-- ── A2. Block comment passthrough ─────────────────────────────
-- ✅ Hover on clickstream → tooltip (comment between FROM and name is ignored)
-- ✅ CodeLens above this line

SELECT * FROM /* this is a comment */ clickstream;


-- ── A3. Multi-line JOIN (split across lines) ──────────────────
-- ✅ Hover on orders (line 1) → tooltip + CodeLens above that line
-- ✅ Hover on dim_customer (line 3, after INNER JOIN) → tooltip
-- ✅ CodeLens for dim_customer appears on the INNER JOIN keyword line

SELECT * FROM orders o
INNER JOIN
    dim_customer c ON c.customer_id = o.customer_id;


-- ── A4. Multiple tables on one line ──────────────────────────
-- ✅ CodeLens above this line shows 4 links: Open orders, Lineage orders,
--    Open dim_customer, Lineage dim_customer
-- ✅ Hover on either table name → correct tooltip for that table

SELECT * FROM orders o JOIN dim_customer c ON o.customer_id = c.customer_id;


-- ── A5. Schema-qualified names ────────────────────────────────
-- ✅ Hover on ANALYTICS.dim_customers → resolves and shows dim_customers tooltip
-- ✅ CodeLens above the line

SELECT * FROM ANALYTICS.dim_customers;


-- ── A6. CTE shadow trap ───────────────────────────────────────
-- ✅ Hover on dim_customer (inside the CTE body) → tooltip
-- ⚠️  Hover on orders in "WITH orders AS (" → no tooltip (definition, not a ref)
-- ⚠️  Hover on orders in "SELECT * FROM orders" (last line) → shows real orders
--    tooltip. Known limitation: can't distinguish CTE alias from real table.

WITH orders AS (
    SELECT * FROM dim_customer
)
SELECT * FROM orders;


-- ── A7. Backtick identifiers (BigQuery / MySQL style) ─────────
-- ✅ Hover anywhere on the quoted name → shows clickstream tooltip
-- ✅ CodeLens above the line

SELECT * FROM `acme_nexus_raw_data`.`acme_raw`.`analytics`.`clickstream`;


-- ── A8. Bracket identifiers (SQL Server style) ────────────────
-- ✅ Hover anywhere on the bracketed name → shows dim_customers tooltip
-- ✅ CodeLens above the line

SELECT * FROM [acme_nexus_analytics].[ANALYTICS].[MARTS].[dim_customers];


-- ── A9. INSERT INTO and UPDATE ────────────────────────────────
-- ✅ Hover on orders (INSERT line) → tooltip
-- ✅ Hover on dim_customer (UPDATE line) → tooltip
-- ✅ CodeLens above each DML line

INSERT INTO orders (customer_id, total_amount) SELECT customer_id, 0 FROM dim_customer;

UPDATE dim_customer SET country = 'US' WHERE customer_id = 1;


-- ── A10. Inline comment stripping ─────────────────────────────
-- ✅ Hover on orders (line below) → tooltip (trailing comment is ignored)
-- ✅ Hover on dim_customer in the trailing comment → no tooltip
-- ✅ Hover on clickstream in the full-line comment → no tooltip (entire line stripped)

SELECT * FROM orders; -- JOIN dim_customer c ON ...
-- SELECT * FROM clickstream;   ← whole line is a comment — nothing resolves here


-- ── A11. Keyword rejection ────────────────────────────────────
-- ✅ Hover on SELECT, FROM, WHERE, JOIN, AS, ON, SET → no tooltip on any

SELECT * FROM orders WHERE customer_id IN (SELECT customer_id FROM dim_customer);


-- ── A12. Subquery ─────────────────────────────────────────────
-- ✅ Hover on orders (inner query) → tooltip
-- ✅ Hover on dim_customer (outer query) → tooltip

SELECT *
FROM dim_customer c
WHERE c.customer_id IN (
    SELECT customer_id FROM orders WHERE total_amount > 100
);


-- ════════════════════════════════════════════════════════════════
-- B. METADATA SCENARIOS
-- (these test what the tooltip actually shows, not parsing logic)
-- ════════════════════════════════════════════════════════════════

-- ── B1. Table that does NOT exist ─────────────────────────────
-- ✅ Status bar shows "$(warning) OpenMetadata: "ghost_orders" not found"
--    for ~4 seconds, then disappears
-- ✅ No tooltip appears — hover returns null silently
-- ✅ CodeLens still renders (the provider doesn't pre-validate table names),
--    but clicking "Open" shows the same "not found" status bar warning

SELECT * FROM ghost_orders;


-- ── B2. Table with DQ tests ──────────────────────────────────
-- clickstream (acme_nexus_raw_data.acme_raw.analytics.clickstream)
-- ⚠️  Sandbox DQ data is volatile — test results may change between sessions.
--    If the sandbox was reset, the DQ section may show "No tests set up."
--    Check sandbox.open-metadata.org → clickstream → Data Quality tab to verify.
-- ✅ Tooltip appears (table exists, 8 columns)
-- ✅ Owner line shows "👤 akash"
-- ✅ Tag pills render (BusinessDomain, Business_Glossary, DataTier etc.)
-- ✅ DQ section shows current test results — count and status depend on sandbox state

SELECT * FROM clickstream;


-- ── B3. Table with DQ tests ──────────────────────────────────
-- dim_customers (acme_nexus_analytics.ANALYTICS.MARTS.dim_customers)
-- ⚠️  Sandbox DQ data is volatile — test results may change between sessions.
--    If the sandbox was reset, the DQ section may show "No tests set up."
--    Check sandbox.open-metadata.org → dim_customers → Data Quality tab to verify.
-- ✅ Tooltip appears (12 columns shown in column table)
-- ✅ DQ section shows current test results — count and status depend on sandbox state

SELECT * FROM dim_customers;


-- ── B4. Table with rich owners and tags ───────────────────────
-- customers (acme_nexus_raw_data.acme_raw.crm.customers)
-- Has 1 owner (ashish.gupta) and 11 tags. 2 DQ tests set up but never run.
-- ✅ Tooltip shows "👤 ashish.gupta" line
-- ✅ Tag pills render (11 tags in backtick pill format)
-- ✅ DQ shows "2 tests set up — none run yet" (both tests lack a testCaseResult)

SELECT * FROM customers;


-- ── B5. Table with many columns (>20) ────────────────────────
-- ACCOUNTS (ACME_MYSQL.default.FINANCIAL_STAGING.ACCOUNTS) — 32 columns.
-- Tests the "+ N more columns" truncation in the tooltip.
-- ✅ Tooltip shows first 20 columns, then "_+ 12 more_" row at the bottom
-- ✅ ACME_MYSQL is a MySQL service — tests cross-service FQN resolution

SELECT * FROM ACCOUNTS;


-- ── B6. Ambiguous table name (exists in multiple services) ───────
-- ACCOUNTS exists in ACME_MYSQL, MySQL2, and ACME_SNOWFLAKE (total=3).
-- FINANCIAL_STAGING.ACCOUNTS also exists in all 3 services (total=3, still ambiguous).
-- Resolution uses fullyQualifiedName:*.{name} suffix search + track_total_hits=true.
-- ✅ Tooltip appears on both lines — shows highest search-scored match
-- ✅ Ambiguity warning shown on EVERY hover for both (never cached, total>1)
-- ✅ To remove warning: use full FQN e.g. ACME_MYSQL.default.FINANCIAL_STAGING.ACCOUNTS

SELECT * FROM ACCOUNTS;
SELECT * FROM FINANCIAL_STAGING.ACCOUNTS;

SELECT * FROM ACME_MYSQL.default.FINANCIAL_STAGING.ACCOUNTS;

-- ── B7. Tooltip cache freshness ───────────────────────────────
-- Tests the "Just fetched" vs "Cached X min ago" footer.
-- ✅ First hover on dim_customers → footer shows "🕐 Just fetched"
-- ✅ Hover again immediately → footer shows "🕐 Cached just now"
-- ✅ Wait 2+ min → hover again → DQ re-fetches (2 min TTL), table still cached,
--    footer shows "🕐 Cached 2 min ago"
-- ✅ Click sidebar Refresh → hover again → footer shows "🕐 Just fetched"

SELECT * FROM dim_customers;


-- ── B8. Table with owners and tags vs. table without ──────────
-- dim_customer (sample_redshift) has 1 owner and 4 tags.
-- orders (sample_athena) has 1 owner (test) and 14 tags.
-- ✅ Tooltip shows "👤 Owner Name" line for both
-- ✅ Tooltip shows tag pills for both

SELECT * FROM dim_customer;
SELECT * FROM orders;


-- ── B9. Network / auth error states ─────────────────────────
-- To test these manually, disconnect from the server or use a bad token.
-- ✅ Bad token: hover shows one-time warning notification (not repeated on
--    every hover — hasShownAuthError flag prevents spam)
-- ✅ Server unreachable: hover shows inline tooltip
--    "⚠️ OpenMetadata: Cannot reach server — check your network connection."
-- ✅ After reconnecting via Setup command, hasShownAuthError resets and
--    next auth failure shows the warning again

SELECT * FROM orders;


-- ════════════════════════════════════════════════════════════════
-- C. dbt ref() / source() SCENARIOS
-- (works in both .sql and .jinja files — extension activates on both)
-- All patterns run on the full document text, same pass as SQL patterns.
-- ════════════════════════════════════════════════════════════════

-- ── C1. Basic ref() ──────────────────────────────────────────
-- ✅ Hover anywhere on the ref(...) call → tooltip for dim_customer
-- ✅ CodeLens pair (Open + Lineage) appears above this line

{{ ref('dim_customer') }}


-- ── C2. Double-quote ref() ───────────────────────────────────
-- ✅ Both quote styles work — group 4 of DBT_REF_PATTERN captures correctly

{{ ref("orders") }}


-- ── C3. Cross-project ref (package, model) ───────────────────
-- ✅ Hover on the ref() call → tooltip for dim_customers
-- ✅ 'my_package' is ignored — only the last positional arg (group 4) is the name

{{ ref('my_package', 'dim_customers') }}


-- ── C4. Versioned ref() ──────────────────────────────────────
-- ✅ version=2 kwarg is consumed but not captured — hover shows dim_customer
-- ✅ v=2 short form works identically

{{ ref('dim_customer', version=2) }}
{{ ref('dim_customer', v=2) }}


-- ── C5. Cross-project + versioned ────────────────────────────
-- ✅ All three forms resolve to 'dim_customer' (group 4 always = model name)

{{ ref('my_package', 'dim_customer', version=2) }}


-- ── C6. source() ─────────────────────────────────────────────
-- ✅ Hover on source() call → tooltip for orders (group 4 = table name)
-- ✅ Source name ('raw') is ignored by the resolver — only table name is looked up

{{ source('raw', 'orders') }}
{{ source("raw", "orders") }}
{{ source( 'raw' , 'orders' ) }}


-- ── C7. ref() inside Jinja conditional block ─────────────────
-- ✅ Intentional behaviour: ref() INSIDE {% if %} blocks WILL produce tooltips.
-- Same as dbt Power User, Fivetran LSP, and dbt Core — static analysis always
-- extracts the literal string, regardless of the runtime condition.

{% if target.name == 'prod' %}
    SELECT * FROM {{ ref('dim_customer') }}
{% else %}
    SELECT * FROM {{ ref('orders') }}
{% endif %}


-- ── C8. ref() inside a macro call ────────────────────────────
-- ✅ Same intentional behaviour — literal string is present, tooltip fires.
-- The macro context doesn't affect static string extraction.

{{ my_macro(ref('dim_customers')) }}


-- ── C9. Dynamic ref — no match (expected) ────────────────────
-- ✅ No tooltip. Pattern requires quoted string literals.
--    ref(some_variable) and computed names are unresolvable statically.
-- ⚠️  This is consistent with dbt Power User and dbt-extractor ("100% certainty or give up")

{{ ref(some_variable) }}
{{ ref('model_' ~ env_var('SUFFIX')) }}


-- ── C10. Multi-line source() ─────────────────────────────────
-- ✅ \s* in DBT_SOURCE_PATTERN matches newlines — multi-line calls work naturally.
-- ✅ Hover anywhere on the call → tooltip for orders

{{ source(
    'raw',
    'orders'
) }}


-- ── C11. Mixed SQL + dbt in the same file ─────────────────────
-- ✅ Both SQL TABLE_REF_PATTERN and dbt patterns run in the same scan pass.
-- ✅ Hover on dim_customer (SQL FROM) → tooltip
-- ✅ Hover on ref('orders') → tooltip
-- ✅ CodeLens appears above both lines

SELECT *
FROM dim_customer c
WHERE c.customer_id IN (
    SELECT customer_id FROM {{ ref('orders') }} WHERE total_amount > 100
);


-- ── C12. ref() in a -- line comment (depends_on hint) ─────────
-- ✅ No tooltip. -- comments are stripped before any pattern runs.
--    This is the dbt static dependency hint pattern — intentionally ignored.

-- depends_on: {{ ref('dim_customer') }}
SELECT 1;
