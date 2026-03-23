import type { BubbleInfo, BubbleSize, BubblePattern } from '@bubbles/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  kind: 'blow' | 'pop' | 'join' | 'leave' | 'expire';
  userName: string;
  bubbleId?: string;
  size?: BubbleSize;
  color?: string;
  pattern?: BubblePattern;
}

export interface SpreadsheetRow {
  timestamp: string;
  status: string;
  assignee: string;
  task: string;
  priority: string;
  category: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Fake task name pool (>30 entries)
// ---------------------------------------------------------------------------

const FAKE_TASKS: string[] = [
  'Q1 Budget Review',
  'Sprint Retrospective Notes',
  'Client Onboarding Checklist',
  'Performance Review Draft',
  'Marketing Campaign Analysis',
  'Weekly Status Update',
  'Vendor Contract Review',
  'Team Capacity Planning',
  'Risk Assessment Matrix',
  'Stakeholder Presentation',
  'Project Timeline Update',
  'Resource Allocation Sheet',
  'Monthly KPI Dashboard',
  'Training Schedule',
  'Compliance Audit Checklist',
  'Inventory Reconciliation',
  'Customer Feedback Summary',
  'Employee Satisfaction Survey',
  'Annual Revenue Forecast',
  'Operational Efficiency Report',
  'Hiring Pipeline Tracker',
  'IT Infrastructure Audit',
  'Travel Expense Report',
  'Product Roadmap Review',
  'Quarterly OKR Update',
  'Security Compliance Review',
  'Brand Guidelines Update',
  'Office Supply Inventory',
  'Meeting Room Schedule',
  'Sales Funnel Analysis',
  'Customer Retention Plan',
  'Data Migration Checklist',
  'Employee Onboarding Plan',
  'Social Media Calendar',
  'Bug Triage Spreadsheet',
];

let taskIndex = 0;
function nextTask(): string {
  const task = FAKE_TASKS[taskIndex % FAKE_TASKS.length];
  taskIndex++;
  return task;
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

export function sizeToPriority(size: BubbleSize): string {
  switch (size) {
    case 'S':
      return 'Low';
    case 'M':
      return 'Medium';
    case 'L':
      return 'High';
    default:
      return 'Medium';
  }
}

const COLOR_CATEGORIES: Record<string, string> = {
  '#FFB5C2': 'Marketing',
  '#87CEEB': 'Engineering',
  '#98FB98': 'Operations',
  '#DDA0DD': 'Design',
  '#FFD700': 'Finance',
  '#FFDAB9': 'Sales',
  '#F5F5F5': 'General',
  '#FF69B4': 'Executive',
};

export function colorToCategory(color: string): string {
  return COLOR_CATEGORIES[color] ?? 'General';
}

export function patternToNotes(pattern: BubblePattern): string {
  switch (pattern) {
    case 'plain':
      return 'Standard';
    case 'spiral':
      return 'Recurring';
    case 'dots':
      return 'Flagged';
    case 'star':
      return 'Urgent';
    default:
      return '';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function actionToRow(action: ActionLogEntry): SpreadsheetRow {
  const time = formatTime(action.timestamp);

  switch (action.kind) {
    case 'blow':
      return {
        timestamp: time,
        status: 'NEW',
        assignee: action.userName,
        task: nextTask(),
        priority: sizeToPriority(action.size ?? 'M'),
        category: colorToCategory(action.color ?? '#87CEEB'),
        notes: patternToNotes(action.pattern ?? 'plain'),
      };
    case 'pop':
      return {
        timestamp: time,
        status: 'DONE',
        assignee: action.userName,
        task: nextTask(),
        priority: sizeToPriority(action.size ?? 'M'),
        category: colorToCategory(action.color ?? '#87CEEB'),
        notes: 'Completed',
      };
    case 'join':
      return {
        timestamp: time,
        status: 'ACTIVE',
        assignee: action.userName,
        task: 'Sprint Planning',
        priority: '-',
        category: '-',
        notes: 'Joined',
      };
    case 'leave':
      return {
        timestamp: time,
        status: 'ON HOLD',
        assignee: action.userName,
        task: 'Break',
        priority: '-',
        category: '-',
        notes: 'Away',
      };
    case 'expire':
      return {
        timestamp: time,
        status: 'CLOSED',
        assignee: action.userName,
        task: nextTask(),
        priority: '-',
        category: '-',
        notes: 'Auto-archived',
      };
    default:
      return {
        timestamp: time,
        status: 'INFO',
        assignee: action.userName,
        task: '-',
        priority: '-',
        category: '-',
        notes: '',
      };
  }
}

// ---------------------------------------------------------------------------
// Formula bar helpers
// ---------------------------------------------------------------------------

const FAKE_FORMULAS = [
  '=SUM(B2:B15)',
  '=VLOOKUP(A2,Sheet2!A:D,3,FALSE)',
  '=IF(D2="High",1,0)',
  '=COUNTIF(B:B,"DONE")',
  '=AVERAGE(E2:E50)',
  '=TODAY()-DATE(2026,1,1)',
  '=CONCATENATE(C2," - ",D2)',
  '=INDEX(A:A,MATCH(MAX(E:E),E:E,0))',
];

export function generateFakeFormula(row: number, col: string): string {
  if (row === 1) {
    // header row – just show the header text
    const headers: Record<string, string> = {
      A: 'Timestamp',
      B: 'Status',
      C: 'Assignee',
      D: 'Task',
      E: 'Priority',
      F: 'Category',
      G: 'Notes',
    };
    return headers[col] ?? '';
  }
  // return a realistic-looking formula
  const idx = (row + col.charCodeAt(0)) % FAKE_FORMULAS.length;
  return FAKE_FORMULAS[idx];
}

// ---------------------------------------------------------------------------
// Build initial action log from existing bubbles
// ---------------------------------------------------------------------------

export function bubbleToActionEntry(bubble: BubbleInfo): ActionLogEntry {
  return {
    id: bubble.bubbleId,
    timestamp: bubble.createdAt,
    kind: 'blow',
    userName: bubble.blownBy.displayName,
    bubbleId: bubble.bubbleId,
    size: bubble.size,
    color: bubble.color,
    pattern: bubble.pattern,
  };
}

// ---------------------------------------------------------------------------
// Size ↔ font-size mapping (for the disguised size selector)
// ---------------------------------------------------------------------------

export const SIZE_FONT_MAP: { size: BubbleSize; label: string }[] = [
  { size: 'S', label: '10' },
  { size: 'M', label: '12' },
  { size: 'L', label: '14' },
];

// ---------------------------------------------------------------------------
// Pattern ↔ border style mapping
// ---------------------------------------------------------------------------

export const PATTERN_BORDER_MAP: { pattern: BubblePattern; label: string; icon: string }[] = [
  { pattern: 'plain', label: 'No Border', icon: '▯' },
  { pattern: 'spiral', label: 'All Borders', icon: '▦' },
  { pattern: 'dots', label: 'Dotted', icon: '▤' },
  { pattern: 'star', label: 'Double', icon: '▩' },
];
