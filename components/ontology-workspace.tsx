"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { Box, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDotDashed, FileText, Network, Pencil, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { applyPropertyInheritance, initialOntology, instanceCount, type OntologyAxiom, type OntologyClass, type OntologyInstance, type OntologyModel, type OntologyProperty } from "@/lib/ontology";
import { parseOntology } from "@/lib/import-ontology";

type PropertyUpdate = (classId: string, propertyName: string, changes: Pick<OntologyProperty, "label" | "description">) => void;
type OntologyNodeData = OntologyClass & { count: number; zoom: number; onUpdateProperty: PropertyUpdate };
type EdgePropertyInfo = { source: string; target: string; properties: OntologyProperty[] };
const accentMap = { violet: "#a78bfa", cyan: "#22d3ee", amber: "#fbbf24", rose: "#fb7185", blue: "#60a5fa" };

function PropertyHint({ property, classId, onUpdate, compact = false }: { property: OntologyProperty; classId: string; onUpdate: PropertyUpdate; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(property.label);
  const [description, setDescription] = useState(property.description);
  useEffect(() => { if (!editing) { setLabel(property.label); setDescription(property.description); } }, [editing, property.description, property.label]);
  const save = () => { onUpdate(property.inheritedFromId ?? classId, property.name, { label: label.trim() || property.name, description: description.trim() }); setEditing(false); setOpen(true); };
  return <Tooltip open={open} onOpenChange={setOpen} delayDuration={180}>
    <TooltipTrigger asChild><button type="button" className={`${compact ? "node-property" : "property-row property-button"}${property.inheritedFrom ? " is-inherited" : ""}`} onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}>
      <span>{property.name}</span><small>{property.type}</small>
    </button></TooltipTrigger>
    <TooltipContent className="property-tooltip" side="right" sideOffset={8} onClick={(event) => event.stopPropagation()} onPointerDownOutside={() => { setOpen(false); setEditing(false); }}>
      {editing ? <div className="property-editor"><Label>Label</Label><Input value={label} onChange={(event) => setLabel(event.target.value)} /><Label>Description</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe how this property is used…" /><div><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></div></div> : <><strong>{property.label}</strong><code>{property.name} · {property.type}</code>{property.inheritedFrom && <span className="inherited-note">Inherited from {property.inheritedFrom}</span>}<p>{property.description || "No description yet."}</p><Button className="edit-property" size="icon" variant="outline" aria-label="Edit property" title="Edit property" onClick={() => setEditing(true)}><Pencil size={15} strokeWidth={2.4} /></Button></>}
    </TooltipContent>
  </Tooltip>;
}

function ClassNode({ data, selected }: NodeProps<Node<OntologyNodeData>>) {
  const expanded = data.zoom > 0.82;
  return <article className={`ontology-node ${selected ? "is-selected" : ""}`} style={{ "--node-accent": accentMap[data.accent] } as React.CSSProperties}>
    <Handle type="target" position={Position.Top} className="flow-handle" />
    <div className="node-kicker"><span />{data.prefix}</div>
    <div className="node-heading"><h3>{data.label}</h3><span className="count-pill">{data.count}</span></div>
    {expanded && <div className="node-detail"><p>{data.definition}</p><div className="property-list">{data.properties.map((property) => <PropertyHint key={property.name} property={property} classId={data.id} onUpdate={data.onUpdateProperty} compact />)}</div></div>}
    <Handle type="source" position={Position.Bottom} className="flow-handle" />
  </article>;
}
const nodeTypes = { ontologyClass: ClassNode };

function SelfRelationEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, label, labelStyle }: EdgeProps) {
  const loopWidth = 74;
  const edgePath = `M ${sourceX} ${sourceY} C ${sourceX + loopWidth} ${sourceY + 24}, ${targetX + loopWidth} ${targetY - 24}, ${targetX} ${targetY}`;
  return <>
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={18} />
    {label && <EdgeLabelRenderer><div className="self-edge-label" style={{ ...labelStyle, transform: `translate(-50%, -50%) translate(${sourceX + loopWidth}px, ${(sourceY + targetY) / 2}px)` }}>{label}</div></EdgeLabelRenderer>}
  </>;
}

const edgeTypes = { selfRelation: SelfRelationEdge };

async function layoutGraph(model: OntologyModel, zoom: number, onUpdateProperty: PropertyUpdate) {
  const elk = new ELK();
  const width = zoom > 0.82 ? 302 : 245;
  const dimensions = new Map(model.classes.map((item) => [item.id, { width, height: zoom > 0.82 ? Math.max(140, 100 + Math.ceil(item.definition.length / 46) * 16 + item.properties.length * 21) : 92 }]));
  const graph = await elk.layout({ id: "root", layoutOptions: { "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.spacing.nodeNode": "56", "elk.layered.spacing.nodeNodeBetweenLayers": "76", "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX" }, children: model.classes.map((item) => ({ id: item.id, ...dimensions.get(item.id)! })), edges: model.axioms.map((axiom) => ({ id: axiom.id, sources: [axiom.source], targets: [axiom.target] })) });
  return model.classes.map((item) => { const placed = graph.children?.find((child) => child.id === item.id); return { id: item.id, type: "ontologyClass", position: { x: placed?.x ?? 0, y: placed?.y ?? 0 }, data: { ...item, count: instanceCount(model, item.id), zoom, onUpdateProperty }, style: dimensions.get(item.id) } satisfies Node<OntologyNodeData>; });
}

const makeEdges = (model: OntologyModel): Edge[] => {
  const groups = new Map<string, OntologyAxiom[]>();
  model.axioms.forEach((axiom) => { const relationGroup = axiom.predicate === "subClassOf" ? "hierarchy" : "property"; const key = `${axiom.source}|${axiom.target}|${axiom.kind}|${relationGroup}`; groups.set(key, [...(groups.get(key) ?? []), axiom]); });
  return Array.from(groups.values()).map((axioms) => {
    const axiom = axioms[0];
    const hierarchy = axiom.predicate === "subClassOf";
    const names = Array.from(new Set(axioms.map((item) => item.predicate)));
    const label = hierarchy ? "subclass of" : names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(" · ");
    const color = hierarchy ? "#2563eb" : axiom.kind === "inferred" ? "#7c3aed" : "#64748b";
    return { id: axioms.map((item) => item.id).join("-"), source: axiom.source, target: axiom.target, type: axiom.source === axiom.target ? "selfRelation" : undefined, label, data: { axiom, axioms }, animated: axiom.kind === "inferred", markerEnd: { type: MarkerType.ArrowClosed, color }, style: { stroke: color, strokeDasharray: axiom.kind === "inferred" ? "6 5" : undefined, strokeWidth: hierarchy ? 1.8 : 1.5 }, labelStyle: { color: hierarchy ? "#1d4ed8" : "#475569", fill: hierarchy ? "#1d4ed8" : "#475569", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#ffffff", fillOpacity: .94 } };
  });
};

function Workspace() {
  const [model, setModel] = useState(() => applyPropertyInheritance(initialOntology));
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<OntologyNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(makeEdges(model));
  const [zoom, setZoom] = useState(0.72);
  const [query, setQuery] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("researcher");
  const [selectedInstance, setSelectedInstance] = useState<OntologyInstance | null>(null);
  const [selectedInference, setSelectedInference] = useState<OntologyAxiom | null>(null);
  const [edgePropertyInfo, setEdgePropertyInfo] = useState<EdgePropertyInfo | null>(null);
  const [edgeInfoPinned, setEdgeInfoPinned] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [source, setSource] = useState("researcher");
  const [target, setTarget] = useState("topic");
  const [predicate, setPredicate] = useState("studies");
  const [relationshipType, setRelationshipType] = useState<"property" | "subclass" | "superclass">("property");
  const [ontologyName, setOntologyName] = useState("Example ontology");
  const [instancesOpen, setInstancesOpen] = useState(false);
  const fitAfterLayout = useRef(true);
  const centerAfterLayout = useRef<string | null>(null);
  const instancePanelMounted = useRef(false);
  const { fitView, setCenter } = useReactFlow();
  const fitScreen = useCallback((duration = 350) => void fitView({ padding: .2, duration, minZoom: .1, maxZoom: .8 }), [fitView]);
  const centerOnNode = useCallback((node: Node<OntologyNodeData>, duration = 450) => {
    const width = node.measured?.width ?? (typeof node.style?.width === "number" ? node.style.width : 302);
    const height = node.measured?.height ?? (typeof node.style?.height === "number" ? node.style.height : 140);
    setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1.05, duration });
  }, [setCenter]);
  const toggleInstances = useCallback(() => { setInstancesOpen((current) => !current); window.requestAnimationFrame(() => window.requestAnimationFrame(() => fitScreen(250))); }, [fitScreen]);
  const beginFitScreen = useCallback(() => {
    if (zoom > .82) { fitAfterLayout.current = true; setZoom(.72); }
    else fitScreen();
  }, [fitScreen, setZoom, zoom]);
  const instancePanelOpen = selectedInstance !== null;
  useEffect(() => {
    if (!instancePanelMounted.current) { instancePanelMounted.current = true; return; }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => fitScreen(250)));
  }, [fitScreen, instancePanelOpen]);

  const updateProperty = useCallback<PropertyUpdate>((classId, propertyName, changes) => { setModel((current) => applyPropertyInheritance({ ...current, classes: current.classes.map((item) => ({ ...item, properties: item.properties.filter((property) => !property.inheritedFrom).map((property) => item.id === classId && property.name === propertyName ? { ...property, ...changes } : property) })) })); }, []);
  useEffect(() => {
    let active = true;
    void layoutGraph(model, zoom, updateProperty).then((nextNodes) => {
      if (!active) return;
      const shouldFit = fitAfterLayout.current;
      fitAfterLayout.current = false;
      const classToCenter = centerAfterLayout.current;
      centerAfterLayout.current = null;
      setNodes(nextNodes);
      if (classToCenter) {
        const node = nextNodes.find((item) => item.id === classToCenter);
        if (node) window.setTimeout(() => { if (active) centerOnNode(node); }, 80);
      } else if (shouldFit) window.setTimeout(() => { if (active) fitScreen(); }, 80);
    });
    setEdges(makeEdges(model));
    return () => { active = false; };
  }, [centerOnNode, fitScreen, model, updateProperty, zoom, setEdges, setNodes]);
  const selectedClass = model.classes.find((item) => item.id === selectedClassId) ?? model.classes[0];
  const classInstances = useMemo(() => model.instances.filter((instance) => instance.classId === selectedClassId), [model, selectedClassId]);
  const sourceLabel = model.classes.find((item) => item.id === source)?.label ?? source;
  const targetLabel = model.classes.find((item) => item.id === target)?.label ?? target;
  const search = useCallback((value: string) => {
    setQuery(value);
    const term = value.trim().toLowerCase();
    if (!term) return;
    const match = model.classes.find((item) => `${item.label} ${item.prefix}`.toLowerCase().includes(term));
    if (!match) return;
    setSelectedClassId(match.id);
    setSelectedInstance(null);
    if (zoom <= .82 || centerAfterLayout.current) { centerAfterLayout.current = match.id; setZoom(1.05); }
    else {
      const node = nodes.find((item) => item.id === match.id);
      if (node) centerOnNode(node);
    }
  }, [centerOnNode, model.classes, nodes, setZoom, zoom]);
  const createRelationship = () => {
    if (source === target || (relationshipType === "property" && !predicate.trim())) return;
    const hierarchy = relationshipType !== "property";
    const axiomSource = relationshipType === "superclass" ? target : source;
    const axiomTarget = relationshipType === "superclass" ? source : target;
    setModel((current) => applyPropertyInheritance({ ...current, axioms: [...current.axioms, { id: `custom-${Date.now()}`, source: axiomSource, target: axiomTarget, predicate: hierarchy ? "subClassOf" : predicate.trim(), kind: "asserted" }] }));
    setDialogOpen(false);
  };
  const showEdgeProperties = (edge: Edge, pinned: boolean) => { const axioms = (edge.data?.axioms as OntologyAxiom[] | undefined) ?? [edge.data?.axiom as OntologyAxiom]; const first = axioms[0]; if (!first || first.kind === "inferred") return; const sourceClass = model.classes.find((item) => item.id === first.source); const properties = axioms.map((axiom) => sourceClass?.properties.find((property) => property.name === axiom.predicate)).filter((property): property is OntologyProperty => Boolean(property)); setSelectedInference(null); setEdgePropertyInfo({ source: sourceClass?.label ?? first.source, target: model.classes.find((item) => item.id === first.target)?.label ?? first.target, properties }); setEdgeInfoPinned(pinned); };
  const loadOntology = useCallback((nextModel: OntologyModel, filename: string) => { const first = nextModel.classes[0].id; fitAfterLayout.current = true; setZoom(.72); setModel(nextModel); setOntologyName(filename); setSelectedClassId(first); setSelectedInstance(null); setSelectedInference(null); setSource(first); setTarget(nextModel.classes[1]?.id ?? first); setQuery(""); }, [setZoom]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool?.({ name: "select_ontology_class", title: "Select ontology class", description: "Select a class in the ontology canvas and show its instances.", inputSchema: { type: "object", properties: { classId: { type: "string" } }, required: ["classId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: { classId?: string }) => { if (!input.classId || !model.classes.some((item) => item.id === input.classId)) throw new Error("Unknown classId"); setSelectedClassId(input.classId); setSelectedInstance(null); return { selectedClassId: input.classId }; } }, { signal: lifecycle.signal });
      await context.registerTool?.({ name: "create_ontology_relationship", title: "Create ontology relationship", description: "Add an asserted relationship between two existing ontology classes.", inputSchema: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, predicate: { type: "string" } }, required: ["source", "target", "predicate"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: { source?: string; target?: string; predicate?: string }) => { if (!input.source || !input.target || !input.predicate || input.source === input.target || !model.classes.some((item) => item.id === input.source) || !model.classes.some((item) => item.id === input.target)) throw new Error("Invalid relationship"); const axiom = { id: `tool-${Date.now()}`, source: input.source, target: input.target, predicate: input.predicate.trim(), kind: "asserted" as const }; setModel((current) => ({ ...current, axioms: [...current.axioms, axiom] })); return { relationshipId: axiom.id }; } }, { signal: lifecycle.signal });
      await context.registerTool?.({ name: "load_ontology_text", title: "Load ontology text", description: "Parse RDF/OWL source text and replace the ontology currently shown on the canvas.", inputSchema: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" } }, required: ["filename", "content"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (input: { filename?: string; content?: string }) => { if (!input.filename || !input.content) throw new Error("filename and content are required"); if (input.content.length > 5 * 1024 * 1024) throw new Error("Ontology source exceeds 5 MB"); const next = parseOntology(input.content, input.filename); loadOntology(next, input.filename); return { filename: input.filename, classes: next.classes.length, instances: next.instances.length, relationships: next.axioms.length }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined); return () => lifecycle.abort();
  }, [loadOntology, model.classes]);

  return <main className={`app-shell${instancesOpen ? " instances-open" : ""}${instancePanelOpen ? " instance-selected" : ""}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark"><Network size={18} /></span><div><strong>Ontograph</strong><span title={ontologyName}>{ontologyName}</span></div></div><div className="search-wrap"><Search size={16} /><Input value={query} onChange={(event) => search(event.target.value)} placeholder="Find a class or prefix…" aria-label="Search ontology" /><kbd>⌘ K</kbd></div><div className="topbar-actions"><span className="model-status"><i />OWL / RDF</span><ImportOntologyDialog onLoad={loadOntology} /><Button variant="outline" size="sm" onClick={beginFitScreen}>Fit screen</Button></div></header>
    <section className="workspace-grid">
      <aside className="class-sidebar"><div className="panel-title"><span>Classes</span><span>{model.classes.length}</span></div><nav aria-label="Ontology classes">{model.classes.map((item) => <button key={item.id} className={selectedClassId === item.id ? "active" : ""} onClick={() => { setSelectedClassId(item.id); setSelectedInstance(null); }}><span className="class-icon" style={{ color: accentMap[item.accent] }}><Box size={15} /></span><span><strong>{item.label}</strong><small>{item.prefix}</small></span><em>{instanceCount(model, item.id)}</em></button>)}</nav><div className="legend"><span><i className="asserted" />Asserted</span><span><i className="inferred" />Inferred</span></div></aside>
      <section className="canvas-panel" aria-label="Ontology graph"><div className="canvas-toolbar"><div><CircleDotDashed size={15} /><span>{model.classes.length} classes</span><span>{model.axioms.length} relationships</span></div><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button size="sm"><Plus size={15} />Relationship</Button></DialogTrigger><DialogContent className="relationship-dialog"><DialogHeader><DialogTitle>Create relationship</DialogTitle><DialogDescription>Add an object property or connect two classes in the hierarchy.</DialogDescription></DialogHeader><div className="form-grid"><Label>Relation type</Label><Select value={relationshipType} onValueChange={(value) => setRelationshipType(value as typeof relationshipType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="property">Object property</SelectItem><SelectItem value="subclass">Subclass of</SelectItem><SelectItem value="superclass">Superclass of</SelectItem></SelectContent></Select><Label>{relationshipType === "property" ? "Domain class" : relationshipType === "subclass" ? "Child class" : "Parent class"}</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.classes.map((item) => <SelectItem value={item.id} key={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>{relationshipType === "property" && <><Label>Property name</Label><Input value={predicate} onChange={(event) => setPredicate(event.target.value)} placeholder="e.g. containsZone" /></>}<Label>{relationshipType === "property" ? "Range class" : relationshipType === "subclass" ? "Parent class" : "Child class"}</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.classes.map((item) => <SelectItem value={item.id} key={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div><p className="relation-preview">{relationshipType === "property" ? <><strong>{sourceLabel}</strong> — {predicate.trim() || "property"} → <strong>{targetLabel}</strong></> : relationshipType === "subclass" ? <><strong>{sourceLabel}</strong> is a subclass of <strong>{targetLabel}</strong></> : <><strong>{sourceLabel}</strong> is a superclass of <strong>{targetLabel}</strong></>}</p><Button onClick={createRelationship} disabled={source === target || (relationshipType === "property" && !predicate.trim())}>Add relationship</Button></DialogContent></Dialog></div>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => { setSelectedClassId(node.id); setSelectedInstance(null); }} onEdgeClick={(_, edge) => { const axiom = edge.data?.axiom as OntologyAxiom; if (axiom.predicate === "subClassOf") { setSelectedClassId(axiom.source); setSelectedInstance(null); setEdgePropertyInfo(null); } else if (axiom.kind === "inferred") { setSelectedInference(axiom); setEdgePropertyInfo(null); } else showEdgeProperties(edge, true); }} onEdgeMouseEnter={(_, edge) => { const axiom = edge.data?.axiom as OntologyAxiom; if (!edgeInfoPinned && axiom.predicate !== "subClassOf") showEdgeProperties(edge, false); }} onEdgeMouseLeave={() => { if (!edgeInfoPinned) setEdgePropertyInfo(null); }} onPaneClick={() => { setEdgeInfoPinned(false); setEdgePropertyInfo(null); }} onMoveEnd={(_, viewport) => setZoom(Number(viewport.zoom.toFixed(2)))} minZoom={.1} maxZoom={1.7} defaultViewport={{ x: 90, y: 44, zoom: .72 }} fitView attributionPosition="bottom-left"><Background color="#cbd5e1" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(node) => accentMap[(node.data as OntologyNodeData).accent]} maskColor="rgba(241, 245, 249, .82)" /></ReactFlow><div className="zoom-hint">Zoom {Math.round(zoom * 100)}% · scroll to reveal class details</div>
      </section>
      {selectedInstance && <aside className="inspector instance-inspector"><div className="inspector-content"><InstanceDetail instance={selectedInstance} instances={model.instances} onClose={() => setSelectedInstance(null)} onNavigate={(target) => { setSelectedClassId(target.classId); setSelectedInstance(target); }} /></div></aside>}
    </section>
    <InstanceBrowser title={selectedClass.label} data={classInstances} collapsed={!instancesOpen} onToggle={toggleInstances} onSelect={setSelectedInstance} selectedId={selectedInstance?.id} />
    {selectedInference && <div className="inference-popover" role="dialog" aria-label="Inference evidence"><button aria-label="Close" onClick={() => setSelectedInference(null)}><X size={16} /></button><div className="inference-title"><Sparkles size={16} /><span>Inference evidence</span></div><h3>{selectedInference.source} <em>{selectedInference.predicate}</em> {selectedInference.target}</h3><p>Derived from the following supporting axioms and facts:</p><ol>{selectedInference.evidence?.map((item) => <li key={item}>{item}</li>)}</ol></div>}
    {edgePropertyInfo && <div className="edge-property-popover" role="dialog" aria-label="Relationship properties"><button aria-label="Close" onClick={() => { setEdgePropertyInfo(null); setEdgeInfoPinned(false); }}><X size={16} /></button><span className="edge-route">{edgePropertyInfo.source} → {edgePropertyInfo.target}</span>{edgePropertyInfo.properties.map((property) => <div key={property.name}><strong>{property.label}</strong><code>{property.name} · {property.type}</code><p>{property.description}</p></div>)}</div>}
  </main>;
}

function ImportOntologyDialog({ onLoad }: { onLoad: (model: OntologyModel, filename: string) => void }) {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<{ model: OntologyModel; filename: string } | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  const chooseFile = async (file?: File) => {
    setCandidate(null); setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Choose a file smaller than 5 MB."); return; }
    setReading(true);
    try {
      const model = parseOntology(await file.text(), file.name);
      setCandidate({ model, filename: file.name });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This ontology could not be parsed.");
    } finally { setReading(false); }
  };

  const confirm = () => {
    if (!candidate) return;
    onLoad(candidate.model, candidate.filename);
    setOpen(false); setCandidate(null); setError("");
  };

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setCandidate(null); setError(""); } }}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Upload size={15} />Load ontology</Button></DialogTrigger>
    <DialogContent className="import-dialog">
      <DialogHeader><DialogTitle>Load an ontology</DialogTitle><DialogDescription>Open a local OWL, RDF/XML, Turtle, or JSON-LD file. Your file stays in this browser.</DialogDescription></DialogHeader>
      <Label className="ontology-file-picker">
        <span className="file-picker-icon"><FileText size={22} /></span>
        <strong>{reading ? "Reading ontology…" : "Choose an ontology file"}</strong>
        <small>.owl, .rdf, .xml, .ttl, .jsonld or .json · up to 5 MB</small>
        <Input type="file" accept=".owl,.rdf,.xml,.ttl,.jsonld,.json,application/rdf+xml,text/turtle,application/ld+json" disabled={reading} onChange={(event) => void chooseFile(event.target.files?.[0])} />
      </Label>
      {error && <div className="import-message error" role="alert"><X size={15} /><span>{error}</span></div>}
      {candidate && <div className="import-message success"><CheckCircle2 size={16} /><div><strong>{candidate.filename}</strong><span>{candidate.model.classes.length} classes · {candidate.model.instances.length} instances · {candidate.model.axioms.length} relationships</span></div></div>}
      <div className="import-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={confirm} disabled={!candidate}>Load onto canvas</Button></div>
    </DialogContent>
  </Dialog>;
}

function InstanceDetail({ instance, instances, onClose, onNavigate }: { instance: OntologyInstance; instances: OntologyInstance[]; onClose: () => void; onNavigate: (target: OntologyInstance) => void }) { return <div><button className="close-inline" onClick={onClose}><X size={14} /> Clear selection</button><div className="instance-avatar">{instance.label.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><h2>{instance.label}</h2><code>{instance.id}</code><section><h3>Values</h3>{Object.entries(instance.values).map(([key, value]) => <div className="value-row" key={key}><small>{key}</small><span>{value}</span></div>)}</section><section><h3>Local connections</h3>{instance.connections.length ? instance.connections.map((connection) => { const target = instances.find((item) => item.id === connection.target); return <button className="related-instance" key={`${connection.predicate}-${connection.target}`} disabled={!target} onClick={() => target && onNavigate(target)}><span><small>{connection.predicate}</small><strong>{target?.label ?? connection.target}</strong></span><ChevronRight size={15} /></button>; }) : <p>No local connections.</p>}</section></div>; }

const columnHelper = createColumnHelper<OntologyInstance>();
function InstanceBrowser({ title, data, collapsed, onToggle, onSelect, selectedId }: { title: string; data: OntologyInstance[]; collapsed: boolean; onToggle: () => void; onSelect: (row: OntologyInstance) => void; selectedId?: string }) {
  const [sorting, setSorting] = useState<SortingState>([]); const [filter, setFilter] = useState(""); const propertyKeys = Array.from(new Set(data.flatMap((item) => Object.keys(item.values)))).slice(0, 2);
  const columns = useMemo(() => [columnHelper.accessor("label", { header: "Instance", cell: (info) => <span className="instance-name"><i />{info.getValue()}</span> }), ...propertyKeys.map((key) => columnHelper.accessor((row) => row.values[key] ?? "—", { id: key, header: key }))], [propertyKeys.join("|")]);
  const table = useReactTable({ data, columns, state: { sorting, globalFilter: filter }, onSortingChange: setSorting, onGlobalFilterChange: setFilter, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel() });
  return <section className={`instance-browser${collapsed ? " is-collapsed" : ""}`}><div className="instance-header"><div><span>Instances</span><strong>{title}</strong><em>{data.length}</em></div><div className="instance-actions">{!collapsed && <div className="table-filter"><Search size={14} /><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter instances…" /></div>}<Button className="instance-toggle" variant="outline" size="icon" onClick={onToggle} aria-label={collapsed ? "Open instances" : "Collapse instances"} title={collapsed ? "Open instances" : "Collapse instances"}>{collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button></div></div>{!collapsed && <div className="table-scroll"><table><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id} onClick={() => onSelect(row.original)} className={selectedId === row.original.id ? "selected" : ""}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length}>No matching instances</td></tr>}</tbody></table></div>}</section>;
}

export function OntologyWorkspace() { return <TooltipProvider><ReactFlowProvider><Workspace /></ReactFlowProvider></TooltipProvider>; }
