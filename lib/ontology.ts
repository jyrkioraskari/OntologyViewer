export type OntologyProperty = { name: string; type: string; label: string; description: string; inheritedFrom?: string; inheritedFromId?: string };
export type OntologyClass = { id: string; label: string; prefix: string; definition: string; properties: OntologyProperty[]; accent: "violet" | "cyan" | "amber" | "rose" | "blue" };
export type OntologyInstance = { id: string; classId: string; label: string; values: Record<string, string>; connections: { predicate: string; target: string }[] };
export type OntologyAxiom = { id: string; source: string; target: string; predicate: string; kind: "asserted" | "inferred"; evidence?: string[] };
export type OntologyModel = { classes: OntologyClass[]; instances: OntologyInstance[]; axioms: OntologyAxiom[] };

export function applyPropertyInheritance(model: OntologyModel): OntologyModel {
  const classById = new Map(model.classes.map((item) => [item.id, item]));
  const parentsByClass = new Map<string, string[]>();
  model.axioms.filter((axiom) => axiom.predicate === "subClassOf").forEach((axiom) => parentsByClass.set(axiom.source, [...(parentsByClass.get(axiom.source) ?? []), axiom.target]));
  const resolve = (classId: string, trail = new Set<string>()): OntologyProperty[] => {
    const ontologyClass = classById.get(classId);
    if (!ontologyClass || trail.has(classId)) return [];
    const nextTrail = new Set(trail).add(classId);
    const combined = new Map<string, OntologyProperty>(ontologyClass.properties.filter((property) => !property.inheritedFrom).map((property) => [property.name, { ...property, inheritedFrom: undefined, inheritedFromId: undefined }]));
    (parentsByClass.get(classId) ?? []).forEach((parentId) => {
      const parent = classById.get(parentId);
      resolve(parentId, nextTrail).forEach((property) => {
        if (!combined.has(property.name)) combined.set(property.name, { ...property, inheritedFrom: property.inheritedFrom ?? parent?.label ?? parentId, inheritedFromId: property.inheritedFromId ?? parentId });
      });
    });
    return Array.from(combined.values());
  };
  return { ...model, classes: model.classes.map((item) => ({ ...item, properties: resolve(item.id) })) };
}

export const initialOntology: OntologyModel = {
  classes: [
    { id: "person", label: "Person", prefix: "schema:Person", definition: "An individual human agent in the research domain.", properties: [{ name: "name", type: "string", label: "Name", description: "The preferred name of the person." }, { name: "email", type: "string", label: "Email", description: "An email address for the person." }, { name: "affiliation", type: "Organization", label: "Affiliation", description: "An organization with which the person is affiliated." }], accent: "violet" },
    { id: "researcher", label: "Researcher", prefix: "ex:Researcher", definition: "A person who conducts a systematic investigation.", properties: [{ name: "orcid", type: "string", label: "ORCID", description: "The persistent ORCID researcher identifier." }, { name: "researchField", type: "Topic", label: "Research field", description: "A topic studied by the researcher." }, { name: "hIndex", type: "integer", label: "h-index", description: "The researcher's citation-based h-index." }], accent: "blue" },
    { id: "publication", label: "Publication", prefix: "bibo:Document", definition: "A citable scholarly work made available to an audience.", properties: [{ name: "title", type: "string", label: "Title", description: "The title of the scholarly work." }, { name: "published", type: "date", label: "Published", description: "The publication date." }, { name: "doi", type: "string", label: "DOI", description: "The publication's digital object identifier." }], accent: "cyan" },
    { id: "organization", label: "Organization", prefix: "schema:Organization", definition: "A structured group with a shared academic purpose.", properties: [{ name: "name", type: "string", label: "Name", description: "The organization's name." }, { name: "country", type: "string", label: "Country", description: "The country in which the organization operates." }, { name: "homepage", type: "anyURI", label: "Homepage", description: "The organization's primary website." }], accent: "amber" },
    { id: "project", label: "Research Project", prefix: "foaf:Project", definition: "A coordinated research activity with defined outcomes.", properties: [{ name: "title", type: "string", label: "Title", description: "The project's title." }, { name: "startDate", type: "date", label: "Start date", description: "The date on which the project began." }, { name: "status", type: "string", label: "Status", description: "The current project status." }], accent: "rose" },
    { id: "topic", label: "Research Topic", prefix: "skos:Concept", definition: "A concept used to categorize scholarly activity.", properties: [{ name: "prefLabel", type: "langString", label: "Preferred label", description: "The preferred lexical label for this topic." }, { name: "broader", type: "Topic", label: "Broader topic", description: "A more general topic in the concept hierarchy." }, { name: "scheme", type: "ConceptScheme", label: "Concept scheme", description: "The scheme that contains this topic." }], accent: "violet" },
  ],
  instances: [
    { id: "ada", classId: "researcher", label: "Ada Lovelace", values: { orcid: "0000-0001-5842-1000", researchField: "Computational methods", hIndex: "42" }, connections: [{ predicate: "authored", target: "analytical-engine" }, { predicate: "memberOf", target: "arc-lab" }] },
    { id: "grace", classId: "researcher", label: "Grace Hopper", values: { orcid: "0000-0002-1098-7550", researchField: "Programming languages", hIndex: "57" }, connections: [{ predicate: "leads", target: "compiler-project" }, { predicate: "memberOf", target: "naval-lab" }] },
    { id: "alan", classId: "researcher", label: "Alan Turing", values: { orcid: "0000-0003-4145-9265", researchField: "Computer science", hIndex: "68" }, connections: [{ predicate: "authored", target: "computing-machinery" }] },
    { id: "fei", classId: "researcher", label: "Fei-Fei Li", values: { orcid: "0000-0002-1234-5678", researchField: "Computer vision", hIndex: "154" }, connections: [{ predicate: "leads", target: "vision-project" }] },
    { id: "analytical-engine", classId: "publication", label: "Notes on the Analytical Engine", values: { title: "Notes on the Analytical Engine", published: "1843", doi: "10.5555/1843.001" }, connections: [{ predicate: "hasTopic", target: "computing" }] },
    { id: "computing-machinery", classId: "publication", label: "Computing Machinery and Intelligence", values: { title: "Computing Machinery and Intelligence", published: "1950", doi: "10.1093/mind/LIX.236.433" }, connections: [{ predicate: "hasTopic", target: "artificial-intelligence" }] },
    { id: "arc-lab", classId: "organization", label: "Analytical Research Collective", values: { name: "Analytical Research Collective", country: "United Kingdom", homepage: "arc.example.org" }, connections: [] },
    { id: "naval-lab", classId: "organization", label: "Naval Computing Lab", values: { name: "Naval Computing Lab", country: "United States", homepage: "ncl.example.org" }, connections: [] },
    { id: "compiler-project", classId: "project", label: "Compiler Systems Initiative", values: { title: "Compiler Systems Initiative", startDate: "1949", status: "Complete" }, connections: [{ predicate: "hasTopic", target: "programming-languages" }] },
    { id: "vision-project", classId: "project", label: "Visual Intelligence Lab", values: { title: "Visual Intelligence Lab", startDate: "2009", status: "Active" }, connections: [{ predicate: "hasTopic", target: "artificial-intelligence" }] },
    { id: "computing", classId: "topic", label: "Computing", values: { prefLabel: "Computing", broader: "Formal sciences", scheme: "Research domains" }, connections: [] },
    { id: "artificial-intelligence", classId: "topic", label: "Artificial Intelligence", values: { prefLabel: "Artificial Intelligence", broader: "Computing", scheme: "Research domains" }, connections: [] },
    { id: "programming-languages", classId: "topic", label: "Programming Languages", values: { prefLabel: "Programming Languages", broader: "Computing", scheme: "Research domains" }, connections: [] },
  ],
  axioms: [
    { id: "a1", source: "researcher", target: "person", predicate: "subClassOf", kind: "asserted" },
    { id: "a2", source: "researcher", target: "publication", predicate: "authored", kind: "asserted" },
    { id: "a3", source: "researcher", target: "organization", predicate: "memberOf", kind: "asserted" },
    { id: "a4", source: "researcher", target: "project", predicate: "leads", kind: "asserted" },
    { id: "a5", source: "publication", target: "topic", predicate: "hasTopic", kind: "asserted" },
    { id: "a6", source: "project", target: "topic", predicate: "hasTopic", kind: "asserted" },
    { id: "a7", source: "person", target: "organization", predicate: "affiliatedWith", kind: "inferred", evidence: ["Researcher ⊑ Person", "Researcher memberOf Organization", "memberOf ⊑ affiliatedWith"] },
  ],
};

export const instanceCount = (model: OntologyModel, classId: string) => model.instances.filter((instance) => instance.classId === classId).length;
