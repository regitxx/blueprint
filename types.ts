export type AgentName = 'scout' | 'analyst' | 'architect' | 'reader' | 'system';

export interface LogEntry {
  id: number;
  agent: AgentName;
  text: string;
  status: 'run' | 'ok' | 'err';
}

export interface Source {
  id: string; // s1, s2, ...
  kind: 'paper' | 'repo';
  title: string;
  url: string;
  origin: string; // 'arXiv' | 'GitHub' | 'Paper' | … (widened for the papers fallback ladder)
  snippet: string; // abstract or README excerpt (truncated)
  meta?: string; // authors/year or stars/language
}

export interface Insight {
  sourceId: string;
  architecture: string;
  algorithmOrMath: string;
  limitations: string;
  metrics: string;
  relevance: string;
}

export interface VariantComponent {
  name: string;
  role: string;
  sourceIds: string[];
}

export interface Variant {
  id: string;
  name: string;
  profile: string; // "Fast MVP" | "Scalable" | "Research-grade"
  tagline: string;
  summary: string;
  mermaid: string;
  components: VariantComponent[];
  risks: string;
  whenToChoose: string;
}

export interface ComparisonRow {
  criterion: string;
  values: string[]; // aligned with variants order
}

export interface RunResult {
  topic: string;
  sources: Source[];
  insights: Insight[];
  variants: Variant[];
  comparison: ComparisonRow[];
  constraints?: string[]; // hard constraints distilled from an uploaded idea doc
  docName?: string; // filename of the uploaded idea doc, if any
}
