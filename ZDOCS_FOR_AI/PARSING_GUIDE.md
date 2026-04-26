# SQL & dbt Parsing Guide

How to extract table references from SQL and dbt Jinja files.
Covers what to parse, what to skip
---

## SQL Parsing

### What to Parse (SQL)

- `FROM users` — simple table name
- `FROM public.users` / `FROM schema.table` — schema-qualified; table is always the last segment
- `FROM db.schema.table` — three-part (SQL Server / BigQuery); take the last segment regardless of depth
- `JOIN orders`, `LEFT JOIN orders`, `CROSS JOIN products` — all JOIN variants (INNER / LEFT / RIGHT / FULL / CROSS)
- `FROM t1 NATURAL JOIN t2` — NATURAL JOIN; NATURAL is a modifier, parse both `t1` and `t2`
- `FROM ONLY orders` — ONLY modifier (PostgreSQL inheritance); parse `orders`, skip `ONLY`. ✅ Already handled by `(?:only\s+)?` in `TABLE_REF_PATTERN`.
- `UPDATE orders SET ...` — UPDATE target
- `INSERT INTO orders ...` — INSERT target; handled by the INTO rule
- `DELETE FROM orders ...` — DELETE target; handled by the FROM rule
- `MERGE INTO orders USING ...` — MERGE target (SQL Server / BigQuery); handled by the INTO rule

### What to Skip (SQL)

- **Aliases** — `FROM orders o` — hovering `o` should return nothing. ✅ Already handled: alias is consumed but not captured by `TABLE_REF_PATTERN`.

- **Subqueries in FROM** — `FROM (SELECT id FROM users) AS u` — `u` is not a real table. ✅ Already handled: `TABLE_REF_PATTERN` requires the name to start with a word character not `(`, so the subquery body never matches; `u` after `AS` is also skipped since it isn't directly preceded by FROM/JOIN.

- **Inline VALUES** — `FROM (VALUES (1,'a')) AS t` — virtual table, not in any catalog. ✅ Already handled by the same `(` rule above.

- **dbt `depends_on` comment** — `-- depends_on: {{ ref('some_model') }}` — a `ref()` placed inside a SQL line comment to register a static dependency hint without affecting compiled SQL; used when a model conditionally references another via Jinja the static parser can't see. ✅ Already handled: comment stripping removes everything after `--` before scanning, so this ref never reaches any pattern.

- **Table functions / UNNEST** — `FROM generate_series(1, 10)`, `FROM UNNEST(array_col)` — not real tables. ✅ Handled: after extracting a candidate name, `documentScanner.ts` checks whether the next non-whitespace character in the document text is `(` — if so, the match is discarded. Covers both bare TVFs (`generate_series(`) and schema-qualified TVFs (`public.get_active_users(`)). No API call is made.

- **LATERAL** — `FROM LATERAL (SELECT * FROM users) u`, `FROM orders, LATERAL unnest(tags) AS tag` — LATERAL always precedes either a subquery `(` or a function call, never a real table name. ✅ Handled: `"lateral"` is in `SQL_KEYWORDS` in `sqlParser.ts` — any match where the name token is `lateral` is discarded before an API call is made.

- **CTE names** — the most common false positive:
  ```sql
  WITH orders AS (SELECT id FROM raw_orders)
  SELECT * FROM orders  -- "orders" here is the CTE, NOT the real table
  ```
  The name `orders` in the FROM resolves to the CTE defined above, not to a real catalog table — querying OpenMetadata for it returns the wrong table or nothing. ⚠️ Not yet handled. Fix: before scanning for table refs, extract all CTE names from the `WITH` clause first and exclude any matches:
  ```typescript
  /\bwith\s+(\w+)\s+as\s*\(/gi          // single CTE
  /\bwith\b[\s\S]*?(\w+)\s+as\s*\(/gi   // chained CTEs: WITH a AS (...), b AS (...)
  ```

## dbt / Jinja Parsing

**Important context:** Most dbt teams use plain `.sql` files with Jinja inside them — NOT `.jinja` or `.sql.jinja`. Our extension already activates on `.sql` files, so `ref()` and `source()` detection inside `.sql` files is the primary use case. The `.jinja` extension handling is a bonus for teams using non-standard naming.

### All Valid Forms

```jinja
{# ── ref() ── model name is always the LAST positional string arg ──────────── #}

{{ ref('model_name') }}                        standard, 1 arg
{{ ref("model_name") }}                        double quotes
{{ ref('package_name', 'model_name') }}        cross-project 2 args — model = 2nd arg
{{ ref('model_name', version=2) }}             versioned — ignore version kwarg, model = 1st arg
{{ ref('model_name', v=2) }}                   v= is alias for version=
{{ ref('pkg', 'model_name', version=2) }}      cross-project + versioned — model = 2nd arg

{# ── source() ── table name is ALWAYS the 2nd positional arg ─────────────── #}

{{ source('source_name', 'table_name') }}      standard
{{ source("source_name", "table_name") }}      double quotes
{{ source( 'source_name' , 'table_name' ) }}   whitespace variants (spaces ok)
{{ source(
    'source_name',
    'table_name'
) }}                                           multi-line form (rare but valid)
```

**Why multi-line source() is automatically handled:** In JavaScript/TypeScript, `\s` matches `[ \t\r\n\f\v]` — it includes newlines. So `\s*` in `DBT_SOURCE_PATTERN` and `DBT_REF_PATTERN` already spans across newlines without any extra work. This works because `documentScanner.ts` runs all patterns on the full document text (`document.getText()`), not line by line — multi-line calls are seen in their entirety in a single pass.

**Extraction rule:**
- `ref()` → find all quoted string arguments → take the **last positional one** (handles both 1-arg and 2-arg forms uniformly)
- `source()` → find all quoted string arguments → take the **second one**

### What to Skip (dbt)

These are unresolvable statically — return `null` silently, never crash:

```jinja
{{ ref(some_variable) }}                       dynamic ref, variable argument
{{ ref('model_' ~ env_var('SUFFIX')) }}        computed name via Jinja concatenation
{{ source(var('my_source'), 'table') }}        dynamic source name
{% if condition %}{{ ref('model') }}{% endif %} conditional — ref is valid but context-dependent
{{ ref('model') }}  inside a custom macro      indirect — out of our scope
```

**Note:** Every production tool (dbt Power User, Fivetran LSP, dbt-extractor) skips these too. This is an accepted limitation of static analysis. dbt itself uses a "100% certainty or give up" rule in dbt-extractor.

**Other Jinja tokens to silently ignore** (from Fivetran JinjaUtils.ts — these appear in dbt files but are not table references):
```jinja
{{ env_var('VARNAME') }}        environment variable — not a table
{{ value | as_native }}         Jinja filter — not a table
{{ value | int }}               type cast filter — not a table
{{ value | as_number }}         numeric filter — not a table
{% set x = ... %}               variable assignment — not a table
{% if ... %} / {% for ... %}    control flow — not a table
{# comment #}                   Jinja comment block — ignore entirely
```
These won't match our `ref()` or `source()` patterns anyway, but good to know they exist.
