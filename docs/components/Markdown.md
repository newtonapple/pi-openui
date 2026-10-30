# Markdown

Formatted text from a markdown string.

![Headings, emphasis, lists, a quote, a table, a rule and a link](../screenshots/markdown.png)
<sub>Headings, emphasis, lists, a quote, a table, a rule and a link</sub>

## Signature

```text
Markdown(text: string)
```

## When to use

- Release notes, explanations, anything with structure.

## Arguments

### Markdown

| # | Argument | Type | Required | Notes |
|---|---|---|---|---|
| 1 | `text` | `string` | yes | Markdown. Use `\n` for newlines. Supported: `#`-`######` headings, **bold**, *italic*, `code`, ~~strike~~, `[text](https://example.com)`, lists (nested), `>` quotes, tables, fenced code, `---`. |

## Example

```openui
root = Stack([m])
m = Markdown("# Notes\n\nThis adds **streaming** and `--fast` mode.\n\n- faster start\n- fewer errors")
```

## Tips and pitfalls

- Links are shown as `text (url)`; they are not clickable.
- Fenced code blocks are highlighted like CodeBlock but have no copy button.
- Headings beyond the third level look like the third.

## Related

[Text](Text.md) · [CodeBlock](CodeBlock.md) · [Faq](Faq.md)
