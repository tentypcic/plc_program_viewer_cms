import type { Project, Node } from "../model";
/** Implementations must identify language/version and ship a grammar-backed test corpus. */
export interface SourceRange {
  from: number;
  to: number;
  line: number;
  column: number;
}
export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  range?: SourceRange;
}
export interface Declaration {
  name: string;
  type: string;
  scope: string;
  range: SourceRange;
}
export interface Reference {
  fromNodeId: string;
  targetName: string;
  resolvedNodeId?: string;
  range: SourceRange;
}
export interface AnalysisResult {
  languageVersion: string;
  diagnostics: Diagnostic[];
  declarations: Declaration[];
  references: Reference[];
  folds: SourceRange[];
}
export interface PlcAnalyzer {
  analyze(
    source: string,
    node: Node,
    project: Project,
    signal: AbortSignal,
  ): Promise<AnalysisResult>;
}
export interface TiaImportAdapter {
  sourceVersion: string;
  supports(filename: string): boolean;
  convert(
    files: Map<string, Uint8Array>,
    signal: AbortSignal,
  ): Promise<{ project: Project; diagnostics: Diagnostic[] }>;
}
