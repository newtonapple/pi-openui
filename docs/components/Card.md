# Card

A bordered panel with an optional title in the top border.

![A card with a nested card](../screenshots/card.png)
<sub>A card with a nested card</sub>

![A title too long for the border moves inside as a heading; a callout breaks a long word instead of cutting it](../screenshots/card-wide.png)
<sub>A title too long for the border moves inside as a heading; a callout breaks a long word instead of cutting it</sub>

## Signature

```text
Card(children: component[], title?: string)
```

## When to use

- Giving a chart or table a heading and a frame.
- Separating sections inside one widget.

## Arguments

### Card

| # | Argument | Type | Required | Notes |
|---|---|---|---|---|
| 1 | `children` | `component[]` | yes | The components inside. They are laid out as a column with the default gap. Limit: at most 40 items. |
| 2 | `title` | `string` | no | Shown in the top border. If it does not fit there it moves inside the card as a wrapped heading. |

## Example

```openui
root = Stack([c])
c = Card([chart], "Load by node")
chart = BarChart(["a", "b", "c"], [3, 5, 2])
```

## Tips and pitfalls

- The content is 4 columns narrower than the card: border and padding on both sides.
- Use Tabs for sections the reader switches between, Cards for sections shown together.

## Related

[Stack](Stack.md) · [Tabs](Tabs.md)
