# Erd

An entity-relationship diagram: tables with their columns, and relations with one-or-many ends.

![Three tables. `├` or `┤` is the bar (one) and `<` `>` the crow's foot (many)](../screenshots/erd.png)
<sub>Three tables. `├` or `┤` is the bar (one) and `<` `>` the crow's foot (many)</sub>

## Signature

```text
Erd(entities: Entity[], relations: Relation[], title?: string, tooltips?: Tooltip[])
Entity(name: string, fields: string[])
Relation(from: string, to: string, kind?: "1:1" | "1:N" | "N:1" | "N:M", label?: string)
```

## When to use

- The tables, columns and keys of a schema.
- How tables point at each other.

Not for: Steps that run in order (Dag).

## Arguments

### Erd

| # | Argument | Type | Required | Notes |
|---|---|---|---|---|
| 1 | `entities` | `Entity[]` | yes | One Entity per table. Limit: at most 20 items. |
| 2 | `relations` | `Relation[]` | yes | One Relation per line. Limit: at most 40 items. |
| 3 | `title` | `string` | no | A bold line above the diagram. |
| 4 | `tooltips` | `Tooltip[]` | no | Targets: an entity name, or `entity.column`. |

### Entity

| # | Argument | Type | Required | Notes |
|---|---|---|---|---|
| 1 | `name` | `string` | yes | The table name. Relations refer to it. |
| 2 | `fields` | `string[]` | yes | One string per column: `"name type flags"`, such as `"id uuid PK"` or `"email text UNIQUE"`. `PK` and `FK` are highlighted. Limit: at most 30 items. |

### Relation

| # | Argument | Type | Required | Notes |
|---|---|---|---|---|
| 1 | `from` | `string` | yes | An entity name. |
| 2 | `to` | `string` | yes | An entity name. |
| 3 | `kind` | `"1:1" \| "1:N" \| "N:1" \| "N:M"` | no | `"1:N"` (default: the first entity is the one side), `"1:1"`, `"N:1"` or `"N:M"`. |
| 4 | `label` | `string` | no | Short text on the line, such as `owns`. |

## Example

```openui
root = Stack([s])
s = Erd([users, projects], [r], "Schema")
users = Entity("users", ["id uuid PK", "email text UNIQUE"])
projects = Entity("projects", ["id uuid PK", "owner_id uuid FK"])
r = Relation("users", "projects", "1:N", "owns")
```

## Interaction

- A table is a target, and so is each column.

## Tooltips

Use an Entity name or entity.column. See [Tooltip](Tooltip.md). Write `null` for each skipped optional argument before `tooltips`, which is always last.

## Tips and pitfalls

- Each relation end is one character so the picture stays small: a bar fused with the wire (`├ ┤ ┬ ┴`) means one, a foot facing the table (`< > Λ V`) means many.
- Two relations between the same tables are both drawn.
- A relation from a table to itself is shown as a `∞` in the title.

## Related

[Dag](Dag.md) · [Table](Table.md)
