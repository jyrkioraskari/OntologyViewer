# Ontograph

Ontograph is a browser-based ontology explorer for OWL and RDF data. It turns
classes and their relationships into an interactive graph, exposes instances in
a sortable table, and lets you refine property descriptions without sending
the ontology to a server.

The project is intentionally focused: it is a visual workspace, not a complete
OWL reasoner or an ontology persistence service.

## What you can do

- Open Turtle, RDF/XML, OWL, or JSON-LD files up to 5 MB.
- Explore class hierarchies and object-property relationships on a zoomable
  canvas.
- Search for a class by label or compact IRI.
- Inspect and filter instances of the selected class.
- Follow links between instances when both resources are present in the file.
- See inherited class properties and edit their labels and descriptions for the
  current browser session.
- Add class or property relationships while exploring a model.

All imported content and edits live in memory. Reloading the page restores the
built-in example ontology.

## Quick start

### 1. Install the prerequisites

You need Node.js 22.13 or newer and npm (included with Node.js). Check them with:

```sh
node --version
npm --version
```

### 2. Install dependencies

From this directory, run:

```sh
npm ci
```

`npm ci` installs the exact versions recorded in `package-lock.json`.

### 3. Start the development server

```sh
npm run dev
```

Open <http://localhost:5173>. You should see the built-in research ontology.
The development server reloads the page as you edit the source files.

## Tutorial: explore the example ontology

1. Select **Researcher** in the class list. The graph highlights that class and
   the instance drawer reports four matching resources.
2. Zoom in on the canvas. Class cards expand to show definitions and
   properties.
3. Select a property in a class card. Its label, type, description, and
   inheritance source appear in a tooltip.
4. Choose the pencil button in that tooltip, change the description, and save.
   The change is reflected everywhere that property is inherited.
5. Open the **Instances** drawer and select an instance. The detail panel shows
   literal values and links to related resources.
6. Select **Relationship** above the graph to add either an object-property
   edge or a subclass edge. The graph is laid out again automatically.

Solid edges are asserted relationships. Dashed, animated edges are inferred
relationships included in the loaded model. Selecting an inferred edge shows
its evidence when evidence is available.

## Tutorial: import your first ontology

Save this example as `people.ttl`:

```turtle
@prefix ex: <https://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Person a owl:Class ;
  rdfs:label "Person" .

ex:Researcher a owl:Class ;
  rdfs:label "Researcher" ;
  rdfs:subClassOf ex:Person .

ex:Organization a owl:Class ;
  rdfs:label "Organization" .

ex:affiliation a owl:ObjectProperty ;
  rdfs:label "affiliation" ;
  rdfs:domain ex:Researcher ;
  rdfs:range ex:Organization .

ex:Ada a ex:Researcher ;
  ex:name "Ada Lovelace" ;
  ex:affiliation ex:Lab .

ex:Lab a ex:Organization ;
  ex:name "Analytical Research Lab" .
```

Then:

1. Choose **Load ontology**.
2. Select `people.ttl`.
3. Review the class, instance, and relationship counts.
4. Choose **Load onto canvas**.

Parsing happens entirely in the browser. For format-specific behavior and the
supported subset of each serialization, read
[Importing ontologies](docs/importing-ontologies.md).

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the development server on port 5173. |
| `npm run lint` | Check TypeScript and React source with ESLint. |
| `npm run typecheck` | Type-check without producing files. |
| `npm run build` | Create the production Worker in `dist/`. |
| `npm start` | Preview an existing production build locally. |
| `npm run install:ci` | Run the environment-aware locked installation helper. |

To preview a production build:

```sh
npm run build
npm start
```

Use the local URL printed by Wrangler. `npm start` does not deploy the site.

## Project map

```text
app/
  globals.css                 Global theme and workspace styles
  layout.tsx                  Document metadata and root layout
  page.tsx                    Application entry page
components/
  ontology-workspace.tsx      Graph, inspectors, import UI, and interactions
  ui/                         The small set of UI primitives used by the app
lib/
  import-ontology.ts          Turtle, RDF/XML, and JSON-LD adapters
  ontology.ts                 Domain types, inheritance, and example data
build/                        Sites/Vinext build integration
scripts/                      Portable and managed build helpers
docs/                         Design and import documentation
```

Start with `components/ontology-workspace.tsx` for UI behavior and
`lib/ontology.ts` for the internal data model. See
[Architecture](docs/architecture.md) before changing parsing, layout, or state
ownership.

## Current limitations

- Changes cannot yet be exported or saved between sessions.
- The import layer recognizes a useful visualization-oriented subset of
  Turtle, RDF/XML, and JSON-LD; it is not a standards-complete RDF parser.
- Inference evidence is displayed when supplied by the model. Ontograph does
  not run a general-purpose OWL reasoner.
- Blank-node class expressions and advanced OWL restrictions are not fully
  represented.
- The workspace accepts at most 500 classes and keeps at most 2,500 instances
  from one import to protect browser responsiveness.

## Further documentation

- [Importing ontologies](docs/importing-ontologies.md) — supported formats,
  examples, limits, and troubleshooting.
- [Architecture](docs/architecture.md) — data flow, key modules, extension
  points, and validation workflow.

