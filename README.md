## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open http://localhost:3000 with your browser.

## Usage

Paste JSON texts for comparison (or open files) and hit the **Sort and diff**
button.

<div>
  <img src="./img/Screenshot 2025-11-05 at 9.12.50 PM.png" width="45%">
  <img src="./img/Screenshot 2025-11-05 at 9.14.11 PM.png" width="45%">
</div>

For complex shapes, click **Settings** and add sorting rules. For example, a
shape like below:

```json
{
  "data": [
    {
      "id": "item_001",
      "type": "itemType",
      "attributes": {
        "name": "Sample Item",
        "category": "Category A",
        "tags": []
      },
      "relationships": {
        "owner": {
          "type": "person",
          "id": "person_123"
        },
        "group": {
          "type": "group",
          "id": "group_456"
        }
      }
    }
  ]
}
```

can be sorted with rules like (from highest to lowest precedence):

- `data[].relationships.group.id`
- `data[].attributes.name`
