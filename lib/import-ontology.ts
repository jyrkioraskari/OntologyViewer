import { applyPropertyInheritance, type OntologyAxiom, type OntologyClass, type OntologyInstance, type OntologyModel, type OntologyProperty } from "@/lib/ontology";

const accents: OntologyClass["accent"][] = ["violet", "blue", "cyan", "amber", "rose"];
const classTypes = ["owl:Class", "rdfs:Class", "http://www.w3.org/2002/07/owl#Class", "http://www.w3.org/2000/01/rdf-schema#Class"];
const objectPropertyTypes = ["owl:ObjectProperty", "http://www.w3.org/2002/07/owl#ObjectProperty"];
const datatypePropertyTypes = ["owl:DatatypeProperty", "http://www.w3.org/2002/07/owl#DatatypeProperty"];

const localName = (value: string) => {
  const clean = value.replace(/^<|>$/g, "").replace(/^.*[#/]/, "");
  return clean.includes(":") ? clean.split(":").pop() || clean : clean;
};
const idFor = (value: string) => localName(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "resource";
const labelFor = (value: string) => localName(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const scalar = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(", ");
  if (value && typeof value === "object") return scalar((value as Record<string, unknown>)["@value"] ?? (value as Record<string, unknown>)["@id"] ?? "");
  return "";
};
const valuesOf = (value: unknown) => Array.isArray(value) ? value : value == null ? [] : [value];
const readKey = (node: Record<string, unknown>, names: string[]) => {
  const entry = Object.entries(node).find(([key]) => names.some((name) => key === name || key.endsWith(`#${name}`) || key.endsWith(`/${name}`) || key.endsWith(`:${name}`)));
  return entry?.[1];
};

function finalize(classes: OntologyClass[], instances: OntologyInstance[], axioms: OntologyAxiom[]): OntologyModel {
  const uniqueClasses = Array.from(new Map(classes.map((item) => [item.id, item])).values());
  const classIds = new Set(uniqueClasses.map((item) => item.id));
  const validAxioms = axioms.filter((axiom) => classIds.has(axiom.source) && classIds.has(axiom.target));
  if (!uniqueClasses.length) throw new Error("No OWL or RDFS classes were found in this file.");
  if (uniqueClasses.length > 500) throw new Error("This ontology has more than 500 classes. Import a smaller module for this visual workspace.");
  return applyPropertyInheritance({ classes: uniqueClasses, instances: instances.filter((item) => classIds.has(item.classId)).slice(0, 2500), axioms: Array.from(new Map(validAxioms.map((item) => [`${item.source}:${item.predicate}:${item.target}`, item])).values()) });
}

function parseJsonLd(text: string): OntologyModel {
  const parsed = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
  const graph = Array.isArray(parsed) ? parsed : (Array.isArray(parsed["@graph"]) ? parsed["@graph"] as Record<string, unknown>[] : [parsed]);
  const classNodes = graph.filter((node) => valuesOf(node["@type"]).map(scalar).some((type) => classTypes.includes(type)));
  const inferredTypes = graph.flatMap((node) => valuesOf(node["@type"]).map(scalar)).filter((type) => type && !classTypes.includes(type) && !objectPropertyTypes.includes(type) && !datatypePropertyTypes.includes(type));
  const classTerms = classNodes.length ? classNodes.map((node) => scalar(node["@id"])) : Array.from(new Set(inferredTypes));
  const classByTerm = new Map(classTerms.map((term) => [term, idFor(term)]));
  const properties = graph.filter((node) => valuesOf(node["@type"]).map(scalar).some((type) => [...objectPropertyTypes, ...datatypePropertyTypes].includes(type)));
  const propertyNames = new Map<string, OntologyProperty[]>();
  properties.forEach((property) => { const domain = scalar(readKey(property, ["domain"])); const range = scalar(readKey(property, ["range"])); const name = localName(scalar(property["@id"])); const item = { name, type: range ? localName(range) : "value", label: scalar(readKey(property, ["label", "prefLabel"])) || labelFor(name), description: scalar(readKey(property, ["comment", "definition"])) }; if (domain) propertyNames.set(idFor(domain), [...(propertyNames.get(idFor(domain)) ?? []), item]); });
  const classes = classTerms.map((term, index) => { const node = classNodes.find((item) => scalar(item["@id"]) === term); return { id: idFor(term), label: scalar(node && readKey(node, ["label", "prefLabel"])) || labelFor(term), prefix: term, definition: scalar(node && readKey(node, ["comment", "definition"])) || "Imported ontology class.", properties: propertyNames.get(idFor(term)) ?? [], accent: accents[index % accents.length] }; });
  const axioms: OntologyAxiom[] = [];
  classNodes.forEach((node) => { const source = idFor(scalar(node["@id"])); valuesOf(readKey(node, ["subClassOf"])).forEach((target) => axioms.push({ id: `sub-${axioms.length}`, source, target: idFor(scalar(target)), predicate: "subClassOf", kind: "asserted" })); });
  properties.forEach((property) => { const domain = scalar(readKey(property, ["domain"])); const range = scalar(readKey(property, ["range"])); if (domain && range) axioms.push({ id: `prop-${axioms.length}`, source: idFor(domain), target: idFor(range), predicate: localName(scalar(property["@id"])), kind: "asserted" }); });
  const instances = graph.flatMap((node): OntologyInstance[] => { const type = valuesOf(node["@type"]).map(scalar).find((item) => classByTerm.has(item)); if (!type) return []; const values: Record<string, string> = {}; const connections: { predicate: string; target: string }[] = []; Object.entries(node).forEach(([key, value]) => { if (key.startsWith("@") || /label$/.test(key)) return; const display = scalar(value); if (display) { if (valuesOf(value).some((item) => typeof item === "object" && item !== null && "@id" in item)) connections.push({ predicate: localName(key), target: idFor(display) }); else values[localName(key)] = display; } }); const uri = scalar(node["@id"]); return [{ id: idFor(uri), classId: classByTerm.get(type)!, label: scalar(readKey(node, ["label", "name", "prefLabel"])) || labelFor(uri), values, connections }]; });
  return finalize(classes, instances, axioms);
}

function parseRdfXml(text: string): OntologyModel {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The RDF/XML document is not well formed.");
  const about = (element: Element) => element.getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "about") || element.getAttribute("rdf:about") || element.getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "ID") || element.getAttribute("rdf:ID") || "";
  const resource = (element: Element | null) => element?.getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "resource") || element?.getAttribute("rdf:resource") || "";
  const children = (element: Element, name: string) => Array.from(element.children).filter((child) => child.localName === name);
  const classElements = Array.from(doc.getElementsByTagNameNS("*", "Class"));
  const classUris = classElements.map(about).filter(Boolean);
  const classIds = new Set(classUris.map(idFor));
  const propertyElements = [...Array.from(doc.getElementsByTagNameNS("*", "ObjectProperty")), ...Array.from(doc.getElementsByTagNameNS("*", "DatatypeProperty"))];
  const classProperties = new Map<string, OntologyProperty[]>();
  propertyElements.forEach((property) => { const domain = resource(children(property, "domain")[0] ?? null); const range = resource(children(property, "range")[0] ?? null); const name = localName(about(property)); const item = { name, type: range ? localName(range) : (property.localName === "ObjectProperty" ? "resource" : "literal"), label: children(property, "label")[0]?.textContent?.trim() || labelFor(name), description: children(property, "comment")[0]?.textContent?.trim() || "" }; if (domain) classProperties.set(idFor(domain), [...(classProperties.get(idFor(domain)) ?? []), item]); });
  const classes = classElements.filter((element) => about(element)).map((element, index) => { const uri = about(element); return { id: idFor(uri), label: children(element, "label")[0]?.textContent?.trim() || labelFor(uri), prefix: uri, definition: children(element, "comment")[0]?.textContent?.trim() || "Imported ontology class.", properties: classProperties.get(idFor(uri)) ?? [], accent: accents[index % accents.length] }; });
  const axioms: OntologyAxiom[] = [];
  classElements.forEach((element) => children(element, "subClassOf").forEach((relation) => { const target = resource(relation); if (target) axioms.push({ id: `sub-${axioms.length}`, source: idFor(about(element)), target: idFor(target), predicate: "subClassOf", kind: "asserted" }); }));
  propertyElements.forEach((element) => { const domain = resource(children(element, "domain")[0] ?? null); const range = resource(children(element, "range")[0] ?? null); if (domain && range) axioms.push({ id: `prop-${axioms.length}`, source: idFor(domain), target: idFor(range), predicate: localName(about(element)), kind: "asserted" }); });
  const instances: OntologyInstance[] = [];
  Array.from(doc.getElementsByTagName("*")).forEach((element) => { const uri = about(element); if (!uri || classIds.has(idFor(uri)) || ["ObjectProperty", "DatatypeProperty"].includes(element.localName)) return; const typeUri = element.localName === "NamedIndividual" ? resource(children(element, "type")[0] ?? null) : classUris.find((term) => idFor(term) === idFor(element.namespaceURI ? `${element.namespaceURI}${element.localName}` : element.tagName)); if (!typeUri || !classIds.has(idFor(typeUri))) return; const values: Record<string, string> = {}; const connections: { predicate: string; target: string }[] = []; Array.from(element.children).forEach((child) => { if (["type", "label"].includes(child.localName)) return; const linked = resource(child); if (linked) connections.push({ predicate: child.localName, target: idFor(linked) }); else if (child.textContent?.trim()) values[child.localName] = child.textContent.trim(); }); instances.push({ id: idFor(uri), classId: idFor(typeUri), label: children(element, "label")[0]?.textContent?.trim() || labelFor(uri), values, connections }); });
  return finalize(classes, instances, axioms);
}

function splitTurtleStatements(text: string) {
  const statements: string[] = [];
  let current = "", quoted = false, tripleQuoted = false, iri = false, escaped = false, comment = false, square = 0, round = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const nextThree = text.slice(index, index + 3);
    if (comment) { if (char === "\n") { comment = false; current += char; } continue; }
    if (!quoted && !iri && char === "#") { comment = true; continue; }
    if (!quoted && char === "<") iri = true;
    else if (iri && char === ">") iri = false;
    if (!iri && !escaped && nextThree === '\"\"\"') { tripleQuoted = !tripleQuoted; quoted = tripleQuoted; current += nextThree; index += 2; continue; }
    if (!iri && !tripleQuoted && !escaped && char === '\"') quoted = !quoted;
    if (!quoted && !iri) { if (char === "[") square += 1; if (char === "]") square = Math.max(0, square - 1); if (char === "(") round += 1; if (char === ")") round = Math.max(0, round - 1); }
    if (char === "." && !quoted && !iri && square === 0 && round === 0 && (!text[index + 1] || /\s/.test(text[index + 1]))) { if (current.trim()) statements.push(current.trim()); current = ""; continue; }
    current += char;
    escaped = quoted && char === "\\" && !escaped; if (char !== "\\") escaped = false;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((statement) => !/^\s*(?:@prefix|PREFIX)\b/i.test(statement));
}

const turtleTerms = (body: string, predicates: string[], classIds?: Set<string>) => {
  const found: string[] = [];
  predicates.forEach((predicate) => {
    const direct = new RegExp(`${predicate.replace(":", "\\:")}\\s+([^;]+)`, "g");
    for (const match of body.matchAll(direct)) {
      const tokens = match[1].match(/<[^>]+>|[A-Za-z_][\w-]*:[\w.-]+/g) ?? [];
      tokens.forEach((token) => { if ((!classIds || classIds.has(idFor(token))) && !found.some((item) => idFor(item) === idFor(token))) found.push(token); });
    }
    if (predicate === "rdfs:domain" || predicate === "rdfs:range") {
      const union = new RegExp(`${predicate.replace(":", "\\:")}\\s+\\[[\\s\\S]*?owl:unionOf\\s+\\(([^)]*)\\)`, "g");
      for (const match of body.matchAll(union)) {
        const tokens = match[1].match(/<[^>]+>|[A-Za-z_][\w-]*:[\w.-]+/g) ?? [];
        tokens.forEach((token) => { if ((!classIds || classIds.has(idFor(token))) && !found.some((item) => idFor(item) === idFor(token))) found.push(token); });
      }
    }
  });
  return found;
};

function parseTurtle(text: string): OntologyModel {
  const blocks = splitTurtleStatements(text);
  const classTerms: string[] = [];
  const propertyBlocks: { subject: string; body: string }[] = [];
  blocks.forEach((block) => { const match = block.match(/^(<[^>]+>|[\w-]+:[\w.-]+)\s+([\s\S]+)$/); if (!match) return; if (/\ba\s+(?:owl:Class|rdfs:Class)\b/.test(match[2])) classTerms.push(match[1]); if (/\ba\s+owl:(?:Object|Datatype)Property\b/.test(match[2])) propertyBlocks.push({ subject: match[1], body: match[2] }); });
  const bodyBySubject = new Map<string, string[]>();
  blocks.forEach((block) => { const match = block.match(/^(<[^>]+>|[\w-]+:[\w.-]+)\s+([\s\S]+)$/); if (match) bodyBySubject.set(idFor(match[1]), [...(bodyBySubject.get(idFor(match[1])) ?? []), match[2]]); });
  const completeBody = (subject: string) => (bodyBySubject.get(idFor(subject)) ?? []).join(" ;\n");
  const classIds = new Set(classTerms.map(idFor));
  const classParents = new Map<string, string[]>();
  blocks.forEach((block) => { const source = block.match(/^(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1]; const parent = block.match(/rdfs:subClassOf\s+(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1]; if (source && parent && classIds.has(idFor(source)) && classIds.has(idFor(parent))) classParents.set(idFor(source), [...(classParents.get(idFor(source)) ?? []), idFor(parent)]); });
  const isDescendant = (candidate: string, ancestor: string, seen = new Set<string>()): boolean => { if (candidate === ancestor) return true; if (seen.has(candidate)) return false; seen.add(candidate); return (classParents.get(candidate) ?? []).some((parent) => isDescendant(parent, ancestor, seen)); };
  const mostSpecific = (terms: string[]) => terms.filter((term) => !terms.some((other) => idFor(other) !== idFor(term) && isDescendant(idFor(other), idFor(term))));
  const propertyInfo = propertyBlocks.map((property) => {
    const body = completeBody(property.subject);
    const semanticDomains = turtleTerms(body, ["rdfs:domain"], classIds); const domainHints = turtleTerms(body, ["schema:domainIncludes"], classIds);
    const semanticRanges = turtleTerms(body, ["rdfs:range"]); let rangeHints = turtleTerms(body, ["schema:rangeIncludes"]);
    const isBotInterfaceOf = idFor(property.subject) === "interfaceof" && semanticDomains.some((domain) => idFor(domain) === "interface");
    if (isBotInterfaceOf && !semanticRanges.length && !rangeHints.length) rangeHints = classTerms.filter((term) => ["zone", "element"].includes(idFor(term)));
    return { ...property, body, domains: semanticDomains.length ? semanticDomains : domainHints, ranges: semanticRanges.length ? semanticRanges : rangeHints, displayDomains: mostSpecific(semanticDomains.length ? semanticDomains : domainHints), displayRanges: mostSpecific((semanticRanges.length ? semanticRanges : rangeHints).filter((term) => classIds.has(idFor(term)))), parent: body.match(/rdfs:subPropertyOf\s+(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1] };
  });
  const propertyById = new Map(propertyInfo.map((property) => [idFor(property.subject), property]));
  const inherited = (property: typeof propertyInfo[number], field: "domains" | "ranges" | "displayDomains" | "displayRanges", seen = new Set<string>()): string[] => { const key = idFor(property.subject); if (seen.has(key)) return []; seen.add(key); const own = property[field]; if (own.length || !property.parent) return own; const parent = propertyById.get(idFor(property.parent)); return parent ? inherited(parent, field, seen) : []; };
  const classes = classTerms.map((term, index) => {
    const body = completeBody(term);
    const label = body.match(/(?:rdfs:label|skos:prefLabel)\s+"([^"]+)"/)?.[1];
    const definition = body.match(/(?:rdfs:comment|skos:definition)\s+"([^"]+)"/)?.[1];
    const properties = propertyInfo
      .filter((property) => inherited(property, "domains").some((domain) => idFor(domain) === idFor(term)))
      .map((property) => {
        const ranges = inherited(property, "ranges");
        const name = localName(property.subject);
        return {
          name,
          type: ranges.length ? ranges.map(localName).join(" | ") : (/DatatypeProperty/.test(property.body) ? "literal" : "resource"),
          label: property.body.match(/(?:rdfs:label|skos:prefLabel)\s+"([^"]+)"/)?.[1] || labelFor(name),
          description: property.body.match(/(?:rdfs:comment|skos:definition)\s+"([^"]+)"/)?.[1] || "",
        };
      });
    return { id: idFor(term), label: label || labelFor(term), prefix: term.replace(/^<|>$/g, ""), definition: definition || "Imported ontology class.", properties, accent: accents[index % accents.length] };
  });
  const axioms: OntologyAxiom[] = [];
  blocks.forEach((block) => { const subject = block.match(/^(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1]; const parent = block.match(/rdfs:subClassOf\s+(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1]; if (subject && parent && classIds.has(idFor(subject)) && classIds.has(idFor(parent))) axioms.push({ id: `sub-${axioms.length}`, source: idFor(subject), target: idFor(parent), predicate: "subClassOf", kind: "asserted" }); });
  propertyInfo.forEach((property) => { mostSpecific(inherited(property, "displayDomains")).forEach((domain) => mostSpecific(inherited(property, "displayRanges")).forEach((range) => axioms.push({ id: `prop-${axioms.length}`, source: idFor(domain), target: idFor(range), predicate: localName(property.subject), kind: "asserted" }))); });
  const instances = blocks.flatMap((block): OntologyInstance[] => { const match = block.match(/^(<[^>]+>|[\w-]+:[\w.-]+)\s+([\s\S]+)$/); if (!match || classIds.has(idFor(match[1])) || /\ba\s+owl:(?:Object|Datatype)Property\b/.test(match[2])) return []; const type = match[2].match(/\ba\s+(<[^>]+>|[\w-]+:[\w.-]+)/)?.[1]; if (!type || !classIds.has(idFor(type))) return []; const values: Record<string, string> = {}; const connections: { predicate: string; target: string }[] = []; match[2].split(/\s*;\s*/).forEach((part) => { const property = part.match(/^([\w-]+:[\w.-]+)\s+(.+)$/); if (!property || property[1] === "a") return; const literal = property[2].match(/^"([^"]*)"/)?.[1]; if (literal != null) values[localName(property[1])] = literal; else connections.push({ predicate: localName(property[1]), target: idFor(property[2].split(/[\s,]/)[0]) }); }); const label = values.label || values.prefLabel || labelFor(match[1]); delete values.label; delete values.prefLabel; return [{ id: idFor(match[1]), classId: idFor(type), label, values, connections }]; });
  return finalize(classes, instances, axioms);
}

export function parseOntology(text: string, filename = "ontology.ttl"): OntologyModel {
  const extension = filename.toLowerCase().split(".").pop();
  if (["json", "jsonld"].includes(extension ?? "") || text.trim().startsWith("{")) return parseJsonLd(text);
  if (["rdf", "owl", "xml"].includes(extension ?? "") || text.trim().startsWith("<")) return parseRdfXml(text);
  return parseTurtle(text);
}
