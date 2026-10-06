# Architecture

Ontograph is a client-side React workspace delivered through Vinext and a
Cloudflare Worker. The ontology itself stays in browser memory; there is no
application database or server-side model state.

## Data flow

```text
Built-in example or local file
            │
            ▼
  format-specific parser
  lib/import-ontology.ts
            │
            ▼
     OntologyModel
     lib/ontology.ts
            │
       ┌────┴────┐
       ▼         ▼
  ELK layout   instance table
       │         │
       └────┬────┘
            ▼
 React workspace state and UI
 components/ontology-workspace.tsx
```

The single normalized model keeps the graph, class list, tooltips, and instance
browser consistent after an import or edit.

## Internal model

`OntologyModel` has three collections:

- `classes`: graph nodes with labels, definitions, display accents, and
  properties
- `instances`: resources associated with one class, literal values, and local
  resource connections
- `axioms`: directed class relationships with asserted or inferred provenance

Properties may contain `inheritedFrom` and `inheritedFromId`. These fields are
derived by `applyPropertyInheritance`; they are not treated as declarations.
When updating a property, the workspace follows `inheritedFromId` and edits the
declaring class.

## Rendering and state ownership

`OntologyWorkspace` owns the active model and all interaction state. It derives
React Flow nodes with an asynchronous ELK layered layout and derives edges by
grouping axioms that share endpoints, provenance, and relationship category.

The UI has four coordinated views:

- the class sidebar selects the active class
- the React Flow canvas displays classes and axioms
- the instance drawer filters instances of the active class
- the instance inspector displays values and local connections

State is deliberately ephemeral. Importing replaces the active model, while
edits create new in-memory model values. If persistence is added later, keep
serialization outside the parser so parsing remains a pure input-normalization
concern.

## Import boundary

`parseOntology(text, filename)` chooses a parser and always returns an
`OntologyModel`. Each parser performs format-specific extraction, then
`finalize`:

1. removes duplicate classes by normalized ID
2. drops axioms whose endpoints are not known classes
3. enforces the class limit
4. drops instances with unknown classes and applies the instance limit
5. removes duplicate class edges
6. computes inherited properties

The adapters are intentionally small and visualization-oriented. If
standards-complete RDF behavior becomes a requirement, replace these adapters
with a maintained RDF library while preserving `OntologyModel` as the boundary
consumed by the UI.

## Browser tool integration

When `document.modelContext.registerTool` is available, the workspace registers
three in-page tools:

- `select_ontology_class`
- `create_ontology_relationship`
- `load_ontology_text`

The same state transitions back both direct UI interaction and tool calls. In a
normal browser without `modelContext`, registration is skipped and the visual
application works unchanged.

## Build and hosting layers

- `app/` is the Next-compatible application surface.
- Vinext translates that surface for Vite and Cloudflare Workers.
- `build/sites-worker.ts` delegates requests to Vinext's fetch handler.
- `build/sites-vite-plugin.ts` preserves the hosting manifest in production
  output and supplies local Sites behavior.
- `scripts/run-framework.mjs` selects the portable or managed-Linux build path.

Generated `.next/`, `.vinext/`, `dist/`, `.wrangler/`, and `.sites-runtime/`
directories are disposable and ignored by Git.

## Making a change safely

For a UI change:

1. Update `components/ontology-workspace.tsx` and, when needed,
   `app/globals.css`.
2. Keep reusable ontology transformations in `lib/ontology.ts` rather than in
   JSX.
3. Run the static checks and production build:

   ```sh
   npm run lint
   npm run typecheck
   npm run build
   ```

For an import change:

1. Decide whether the behavior belongs to one serialization or the normalized
   model.
2. Update the relevant adapter in `lib/import-ontology.ts`.
3. Confirm that returned IDs match the class IDs used by axioms and instances.
4. Exercise a small file and a malformed file in the browser.
5. Update `docs/importing-ontologies.md` when the recognized subset changes.

## Adding a UI primitive

Only primitives used by the workspace are kept under `components/ui/`. If a
new interaction needs another primitive, add that component and its direct
dependency together. Avoid restoring the entire component catalog: a narrow UI
surface keeps dependency updates and linting understandable.

