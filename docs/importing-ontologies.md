# Importing ontologies

This guide explains how Ontograph converts ontology files into its visual data
model and how to prepare files that produce useful graphs.

## Before you import

Ontograph reads the selected file in your browser. It does not upload the file,
and it does not retain the model after a page reload.

An import must satisfy these limits:

- maximum file size: 5 MB
- maximum number of classes: 500
- maximum number of retained instances: 2,500
- at least one recognizable OWL or RDFS class

Supported filename extensions are `.ttl`, `.owl`, `.rdf`, `.xml`, `.jsonld`,
and `.json`.

## How format detection works

The filename normally selects the parser:

| Input | Parser |
| --- | --- |
| `.json` or `.jsonld` | JSON-LD |
| `.rdf`, `.owl`, or `.xml` | RDF/XML |
| `.ttl` or another extension | Turtle |

There are two content fallbacks: text beginning with `{` is treated as
JSON-LD, and text beginning with `<` is treated as RDF/XML. Use a standard
extension whenever possible so that malformed input produces a useful error.

## Turtle tutorial

For the clearest result, declare classes explicitly and give object properties
a domain and range:

```turtle
@prefix ex: <https://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Building a owl:Class ;
  rdfs:label "Building" ;
  rdfs:comment "A constructed place." .

ex:Room a owl:Class ;
  rdfs:label "Room" .

ex:contains a owl:ObjectProperty ;
  rdfs:domain ex:Building ;
  rdfs:range ex:Room .

ex:MainBuilding a ex:Building ;
  ex:name "Main Building" ;
  ex:contains ex:Room101 .

ex:Room101 a ex:Room ;
  ex:name "Room 101" .
```

This produces two class nodes, a `contains` edge, and two instances. Literal
values such as `ex:name "Room 101"` appear in the instance table. Resource
values such as `ex:contains ex:Room101` appear as navigable connections when
the target instance is also present.

The lightweight Turtle adapter recognizes common prefixed names, full IRIs,
class declarations, subclass statements, object/datatype property declarations,
labels, comments, domains, ranges, and ordinary typed instances. It also
handles selected `owl:unionOf`, `schema:domainIncludes`,
`schema:rangeIncludes`, and `rdfs:subPropertyOf` patterns used by practical
ontologies.

## RDF/XML guidance

Declare classes with `owl:Class` or `rdfs:Class`. Declare properties with
`owl:ObjectProperty` or `owl:DatatypeProperty`, and use `rdfs:domain` and
`rdfs:range` resource attributes to create graph edges.

Named individuals are recognized from `owl:NamedIndividual` plus an `rdf:type`
link. Elements whose XML element name corresponds to a declared class can also
be recognized as instances.

If the importer reports that the document is not well formed, first open it in
an XML-aware editor and check namespace declarations, closing tags, and escaped
characters.

## JSON-LD guidance

Ontograph accepts either a top-level array, a single node object, or an object
with an `@graph` array. Classes should use `owl:Class`, `rdfs:Class`, or their
full IRIs.

Object and datatype properties should use `owl:ObjectProperty` or
`owl:DatatypeProperty` (or their full IRIs). The importer recognizes compact
and expanded keys whose local names are `label`, `prefLabel`, `comment`,
`definition`, `domain`, `range`, or `subClassOf`.

Objects containing `@id` become resource connections; scalars and objects
containing `@value` become displayed values.

## What the importer derives

Every input format is normalized to the same four concepts:

1. **Classes** become graph nodes.
2. **Properties with class domains and ranges** become graph edges and class
   property rows.
3. **Subclass statements** become hierarchy edges.
4. **Typed resources** become instances associated with a class.

After parsing, class properties are inherited along `subClassOf` edges. A
property declared by a child class wins over an inherited property with the
same local name. Cycles in the hierarchy are guarded against during this pass.

Identifiers shown in the UI are normalized from the resource's local name.
For example, both `ex:Researcher` and `https://example.org/Researcher` become
the internal ID `researcher`. Because that normalization can merge resources
with the same local name, prefer unique local names across namespaces in files
intended for Ontograph.

## Troubleshooting

### “No OWL or RDFS classes were found”

Declare classes explicitly. A vocabulary containing only instances and
properties may be valid RDF but does not provide enough information for the
visual class graph.

### A property does not appear as an edge

Check that both its domain and range resolve to declared classes. Literal
ranges such as `xsd:string` remain property metadata and do not produce a class
edge.

### An instance connection is not clickable

The target resource must also be parsed as an instance in the same file. Links
to external or undeclared resources are shown as identifiers but cannot open an
instance panel.

### The graph contains fewer instances than the source

Only resources typed as a recognized class are retained, and imports are
limited to 2,500 instances.

