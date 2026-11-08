export type Check = {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail';
  evidence: string;
  recommendation: string;
};
export type Technology = {
  name: string;
  category: string;
  confidence: 'high' | 'medium';
  evidence: string;
};
export type Evidence = { id: string; heading: string; text: string; url: string };
export type Audit = {
  device: 'mobile' | 'desktop';
  measuredAt: string;
  lighthouseVersion: string;
  finalUrl: string;
  durationMs: number;
  scores: Record<'performance' | 'accessibility' | 'best-practices' | 'seo', number | null>;
  metrics: {
    id: string;
    label: string;
    value: number | null;
    display: string;
    score: number | null;
  }[];
  findings: {
    id: string;
    title: string;
    description: string;
    score: number | null;
    display?: string;
    category: string;
  }[];
  warnings: string[];
};
export type FieldData = {
  status: 'available' | 'not-configured' | 'unavailable';
  message: string;
  scope?: 'url' | 'origin';
  formFactor?: string;
  period?: string;
  metrics?: {
    name: string;
    p75: number;
    rating: 'good' | 'needs-improvement' | 'poor';
    unit: string;
  }[];
};
export type Report = {
  id: string;
  requestedUrl: string;
  url: string;
  title: string;
  description: string;
  analyzedAt: string;
  statusCode: number;
  mode: 'rendered' | 'html';
  warnings: string[];
  screenshot?: string;
  language: string;
  wordCount: number;
  headings: { level: number; text: string }[];
  links: { text: string; url: string; internal: boolean }[];
  resources: { scripts: number; styles: number; images: number; imagesWithoutAlt: number };
  technologies: Technology[];
  seo: Check[];
  security: Check[];
  evidence: Evidence[];
  audits: Partial<Record<'mobile' | 'desktop', Audit>>;
  fieldData?: FieldData;
};
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
export type StreamEvent =
  | { type: 'progress'; message: string }
  | { type: 'report'; report: Report }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' | 'error'; detail: string }
  | { type: 'mode'; mode: 'agent' | 'evidence' }
  | { type: 'error'; message: string }
  | { type: 'done' };
